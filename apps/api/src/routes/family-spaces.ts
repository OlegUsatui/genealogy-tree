import type {
  CreatePersonDto,
  FamilyShareLinkResponse,
  Person,
  PublicFamilyTreeResponse,
  PublicSelfAddDto,
  PublicSelfAddResponse,
  PublicSelfRelationshipKind,
  Relationship,
  SessionUser,
  TreeResponse,
} from "@family-tree/shared";

import {
  getPersonById,
  getPersonByIdGlobal,
  mapPersonRow,
  mapRelationshipRow,
  findDuplicatePersonByIdentity,
} from "../lib/db";
import { HttpError, json, readJson } from "../lib/http";
import { normalizeCreatePersonDto, toDbBoolean } from "../lib/normalize";
import {
  buildDuplicatePersonHttpError,
  formatDuplicatePersonName,
  isDuplicatePersonConstraintError,
} from "../lib/person-duplicates";
import type { DbNullable, Env } from "../types";

type FamilySpaceRow = {
  id: string;
  title: string;
  root_person_id: string;
  allow_guest_add: number;
};

type FamilyShareTokenRow = {
  id: string;
  family_space_id: string;
  token: string;
  status: "active" | "revoked";
  expires_at: string | null;
};

type PersonRow = {
  id: string;
  first_name: string;
  last_name: DbNullable<string>;
  middle_name: DbNullable<string>;
  maiden_name: DbNullable<string>;
  gender: Person["gender"];
  birth_date: DbNullable<string>;
  death_date: DbNullable<string>;
  birth_place: DbNullable<string>;
  death_place: DbNullable<string>;
  biography: DbNullable<string>;
  is_living: DbNullable<number>;
  photo_url: DbNullable<string>;
  created_at: string;
  updated_at: string;
};

type RelationshipRow = {
  id: string;
  type: Relationship["type"];
  person1_id: string;
  person2_id: string;
  start_date: DbNullable<string>;
  end_date: DbNullable<string>;
  notes: DbNullable<string>;
  created_at: string;
  updated_at: string;
};

type CreateFamilySpaceInput = {
  rootPersonId?: string | null;
  title?: string | null;
};

export async function createFamilyShare(
  request: Request,
  env: Env,
  currentUser: SessionUser,
): Promise<Response> {
  const input = await readJson<CreateFamilySpaceInput>(request);
  const rootPersonId = input.rootPersonId?.trim();

  if (!rootPersonId) {
    throw new HttpError(400, "Потрібно вказати rootPersonId");
  }

  const rootPerson = await getPersonById(env.DB, currentUser.id, rootPersonId);

  if (!rootPerson) {
    throw new HttpError(404, "Людину для поширення не знайдено");
  }

  const timestamp = new Date().toISOString();
  const normalizedTitle = input.title?.trim() || defaultFamilyTitle(rootPerson);
  let familySpace = await env.DB
    .prepare(
      `
        SELECT id, title, root_person_id, allow_guest_add
        FROM family_spaces
        WHERE created_by_user_id = ?
          AND root_person_id = ?
        LIMIT 1
      `,
    )
    .bind(currentUser.id, rootPersonId)
    .first<FamilySpaceRow>();

  if (!familySpace) {
    familySpace = {
      id: crypto.randomUUID(),
      title: normalizedTitle,
      root_person_id: rootPersonId,
      allow_guest_add: 1,
    };

    await env.DB
      .prepare(
        `
          INSERT INTO family_spaces (
            id,
            slug,
            title,
            root_person_id,
            created_by_user_id,
            allow_guest_add,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `,
      )
      .bind(
        familySpace.id,
        buildFamilySlug(rootPerson, familySpace.id),
        familySpace.title,
        rootPersonId,
        currentUser.id,
        timestamp,
        timestamp,
      )
      .run();
  } else if (familySpace.title !== normalizedTitle && input.title?.trim()) {
    await env.DB
      .prepare("UPDATE family_spaces SET title = ?, updated_at = ? WHERE id = ?")
      .bind(normalizedTitle, timestamp, familySpace.id)
      .run();
    familySpace.title = normalizedTitle;
  }

  let shareToken = await env.DB
    .prepare(
      `
        SELECT id, family_space_id, token, status, expires_at
        FROM family_share_tokens
        WHERE family_space_id = ?
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )
    .bind(familySpace.id)
    .first<FamilyShareTokenRow>();

  if (!shareToken) {
    shareToken = {
      id: crypto.randomUUID(),
      family_space_id: familySpace.id,
      token: createShareToken(),
      status: "active",
      expires_at: null,
    };

    await env.DB
      .prepare(
        `
          INSERT INTO family_share_tokens (
            id,
            family_space_id,
            token,
            status,
            expires_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, 'active', NULL, ?, ?)
        `,
      )
      .bind(shareToken.id, familySpace.id, shareToken.token, timestamp, timestamp)
      .run();
  }

  const url = new URL(request.url);
  const response: FamilyShareLinkResponse = {
    familySpaceId: familySpace.id,
    title: familySpace.title,
    rootPersonId: familySpace.root_person_id,
    token: shareToken.token,
    shareUrl: `${url.origin}/f/${shareToken.token}`,
  };

  return json(response, { status: 201 });
}

export async function getPublicFamilyTree(env: Env, token: string): Promise<Response> {
  const familySpace = await getFamilySpaceByToken(env.DB, token);

  if (!familySpace) {
    throw new HttpError(404, "Посилання на сімейне дерево не знайдено");
  }

  const tree = await buildConnectedTreeResponse(env.DB, familySpace.root_person_id);
  const response: PublicFamilyTreeResponse = {
    familySpaceId: familySpace.id,
    title: familySpace.title,
    rootPersonId: familySpace.root_person_id,
    token,
    tree,
  };

  return json(response);
}

export async function addSelfToPublicFamily(
  request: Request,
  env: Env,
  token: string,
): Promise<Response> {
  const familySpace = await getFamilySpaceByToken(env.DB, token);

  if (!familySpace) {
    throw new HttpError(404, "Посилання на сімейне дерево не знайдено");
  }

  if (familySpace.allow_guest_add !== 1) {
    throw new HttpError(403, "Для цього дерева публічне додавання вимкнено");
  }

  const input = await readJson<PublicSelfAddDto>(request);
  const connectedPersonIds = new Set(await listConnectedPersonIds(env.DB, familySpace.root_person_id));
  const existingPersonId = input.existingPersonId?.trim() || null;

  if (existingPersonId) {
    if (!connectedPersonIds.has(existingPersonId)) {
      throw new HttpError(404, "Обрану людину не знайдено в цьому дереві");
    }

    const person = await getPersonByIdGlobal(env.DB, existingPersonId);

    if (!person) {
      throw new HttpError(404, "Обрану людину не знайдено");
    }

    const response: PublicSelfAddResponse = {
      person,
      relationship: null,
      usedExistingPerson: true,
      alreadyInTree: true,
    };

    return json(response);
  }

  const relatedToPersonId = input.relatedToPersonId?.trim() || null;
  const relationKind = normalizePublicRelationshipKind(input.relationKind);

  if (!relatedToPersonId || !relationKind) {
    throw new HttpError(400, "Щоб додати себе до дерева, оберіть родича і тип зв’язку");
  }

  if (!connectedPersonIds.has(relatedToPersonId)) {
    throw new HttpError(404, "Обрану людину не знайдено в цьому дереві");
  }

  const personInput = normalizeCreatePersonDto((input.person ?? {}) as CreatePersonDto);

  if (!personInput.lastName || !personInput.birthDate) {
    throw new HttpError(400, "Для додавання себе в дерево вкажіть щонайменше ім’я, прізвище і дату народження");
  }

  const duplicate = await findDuplicatePersonByIdentity(env.DB, {
    firstName: personInput.firstName,
    lastName: personInput.lastName,
    birthDate: personInput.birthDate,
  });

  if (duplicate && connectedPersonIds.has(duplicate.id)) {
    throw new HttpError(
      409,
      "Така людина вже є в цьому дереві. Оберіть її зі списку вище замість створення дубля.",
      {
        code: "person_already_in_family",
        personId: duplicate.id,
        personName: formatDuplicatePersonName(duplicate),
      },
    );
  }

  const personId = duplicate?.id ?? crypto.randomUUID();
  const timestamp = new Date().toISOString();

  if (!duplicate) {
    try {
      await env.DB
        .prepare(
          `
            INSERT INTO global_persons (
              id,
              first_name,
              last_name,
              middle_name,
              maiden_name,
              gender,
              birth_date,
              death_date,
              birth_place,
              death_place,
              biography,
              is_living,
              photo_url,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, NULL, ?, ?)
          `,
        )
        .bind(
          personId,
          personInput.firstName,
          personInput.lastName,
          personInput.middleName,
          personInput.maidenName,
          personInput.gender,
          personInput.birthDate,
          personInput.birthPlace,
          toDbBoolean(personInput.isLiving),
          timestamp,
          timestamp,
        )
        .run();
    } catch (error) {
      if (isDuplicatePersonConstraintError(error)) {
        throw await buildDuplicatePersonHttpError(
          env.DB,
          {
            firstName: personInput.firstName,
            lastName: personInput.lastName,
            birthDate: personInput.birthDate,
          },
          "Така людина вже є в базі. Оберіть її зі списку вище замість створення дубля.",
        );
      }

      throw error;
    }
  }

  if (personId === relatedToPersonId) {
    throw new HttpError(400, "Не можна створити зв’язок людини самої з собою");
  }

  const normalizedRelationship = normalizePublicRelationship(personId, relatedToPersonId, relationKind);
  const existingRelationship = await env.DB
    .prepare(
      `
        SELECT id, type, person1_id, person2_id, start_date, end_date, notes, created_at, updated_at
        FROM global_relationships
        WHERE type = ?
          AND person1_id = ?
          AND person2_id = ?
        LIMIT 1
      `,
    )
    .bind(normalizedRelationship.type, normalizedRelationship.person1Id, normalizedRelationship.person2Id)
    .first<RelationshipRow>();

  let relationship: Relationship | null = null;

  if (existingRelationship) {
    relationship = mapRelationshipRow(existingRelationship);
  } else {
    const relationshipId = crypto.randomUUID();
    await env.DB
      .prepare(
        `
          INSERT INTO global_relationships (
            id,
            type,
            person1_id,
            person2_id,
            start_date,
            end_date,
            notes,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
        `,
      )
      .bind(
        relationshipId,
        normalizedRelationship.type,
        normalizedRelationship.person1Id,
        normalizedRelationship.person2Id,
        timestamp,
        timestamp,
      )
      .run();

    const createdRelationship = await env.DB
      .prepare(
        `
          SELECT id, type, person1_id, person2_id, start_date, end_date, notes, created_at, updated_at
          FROM global_relationships
          WHERE id = ?
        `,
      )
      .bind(relationshipId)
      .first<RelationshipRow>();

    relationship = createdRelationship ? mapRelationshipRow(createdRelationship) : null;
  }

  const person = await getPersonByIdGlobal(env.DB, personId);

  if (!person) {
    throw new HttpError(500, "Не вдалося додати людину до дерева");
  }

  const response: PublicSelfAddResponse = {
    person,
    relationship,
    usedExistingPerson: !!duplicate,
    alreadyInTree: false,
  };

  return json(response, { status: duplicate ? 200 : 201 });
}

async function getFamilySpaceByToken(db: D1Database, token: string): Promise<FamilySpaceRow | null> {
  const shareToken = await db
    .prepare(
      `
        SELECT id, family_space_id, token, status, expires_at
        FROM family_share_tokens
        WHERE token = ?
          AND status = 'active'
        LIMIT 1
      `,
    )
    .bind(token)
    .first<FamilyShareTokenRow>();

  if (!shareToken) {
    return null;
  }

  if (shareToken.expires_at && new Date(shareToken.expires_at).getTime() < Date.now()) {
    return null;
  }

  return db
    .prepare(
      `
        SELECT id, title, root_person_id, allow_guest_add
        FROM family_spaces
        WHERE id = ?
        LIMIT 1
      `,
    )
    .bind(shareToken.family_space_id)
    .first<FamilySpaceRow>();
}

async function buildConnectedTreeResponse(db: D1Database, rootPersonId: string): Promise<TreeResponse> {
  const personIds = await listConnectedPersonIds(db, rootPersonId);

  const personsResult = await db
    .prepare(
      `
        SELECT *
        FROM global_persons
        WHERE id IN (${createPlaceholders(personIds.length)})
        ORDER BY COALESCE(last_name, ''), first_name, birth_date, id
      `,
    )
    .bind(...personIds)
    .all<PersonRow>();

  const relationshipsResult = await db
    .prepare(
      `
        SELECT *
        FROM global_relationships
        WHERE person1_id IN (${createPlaceholders(personIds.length)})
           OR person2_id IN (${createPlaceholders(personIds.length)})
        ORDER BY created_at
      `,
    )
    .bind(...personIds, ...personIds)
    .all<RelationshipRow>();

  return {
    rootPersonId,
    persons: personsResult.results.map((row) => mapPersonRow(row, false)),
    relationships: relationshipsResult.results.map(mapRelationshipRow),
  };
}

async function listConnectedPersonIds(db: D1Database, rootPersonId: string): Promise<string[]> {
  const result = await db
    .prepare(
      `
        WITH RECURSIVE connected(id) AS (
          SELECT ?
          UNION
          SELECT CASE
            WHEN global_relationships.person1_id = connected.id THEN global_relationships.person2_id
            ELSE global_relationships.person1_id
          END
          FROM global_relationships
          JOIN connected
            ON global_relationships.person1_id = connected.id
            OR global_relationships.person2_id = connected.id
        )
        SELECT id FROM connected
      `,
    )
    .bind(rootPersonId)
    .all<{ id: string }>();

  return result.results.map((row) => row.id);
}

function normalizePublicRelationshipKind(value: PublicSelfRelationshipKind | null | undefined): PublicSelfRelationshipKind | null {
  if (value === "parent" || value === "child" || value === "spouse") {
    return value;
  }

  return null;
}

function normalizePublicRelationship(
  personId: string,
  relatedToPersonId: string,
  relationKind: PublicSelfRelationshipKind,
): {
  type: Relationship["type"];
  person1Id: string;
  person2Id: string;
} {
  switch (relationKind) {
    case "parent":
      return {
        type: "parent_child",
        person1Id: personId,
        person2Id: relatedToPersonId,
      };
    case "child":
      return {
        type: "parent_child",
        person1Id: relatedToPersonId,
        person2Id: personId,
      };
    case "spouse":
      return personId < relatedToPersonId
        ? {
            type: "spouse",
            person1Id: personId,
            person2Id: relatedToPersonId,
          }
        : {
            type: "spouse",
            person1Id: relatedToPersonId,
            person2Id: personId,
          };
  }
}

function buildFamilySlug(rootPerson: Person, familySpaceId: string): string {
  const base = [rootPerson.lastName, rootPerson.firstName]
    .filter(Boolean)
    .join("-")
    .toLocaleLowerCase("uk-UA")
    .replace(/[^a-z0-9а-яіїєґ]+/giu, "-")
    .replace(/^-+|-+$/g, "");

  return `${base || "family"}-${familySpaceId.slice(0, 8)}`;
}

function defaultFamilyTitle(rootPerson: Person): string {
  const familyName = rootPerson.lastName?.trim() || rootPerson.firstName.trim();
  return `Родина ${familyName}`;
}

function createShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function createPlaceholders(count: number): string {
  if (count <= 0) {
    throw new HttpError(500, "Неможливо зібрати дерево без людей");
  }

  return Array.from({ length: count }, () => "?").join(", ");
}
