import type { FamilyGraphResponse, Person, Relationship } from "@family-tree/shared";

import type { DbNullable } from "../types";

type PersonRow = {
  id: string;
  source_person_id?: DbNullable<string>;
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
  updated_at?: string;
};

type PermissionRole = "owner" | "editor" | "viewer";

type PermissionRow = {
  person_id: string;
};

type PrimaryPersonRow = {
  primary_person_id: string | null;
};

type CountRow = {
  count: number;
};

type AdminRow = {
  is_admin: number | null;
};

export function mapPersonRow(row: PersonRow, canEdit = false): Person {
  return {
    id: row.id,
    sourcePersonId: row.source_person_id ?? null,
    canEdit,
    firstName: row.first_name,
    lastName: row.last_name,
    middleName: row.middle_name,
    maidenName: row.maiden_name,
    gender: row.gender,
    birthDate: row.birth_date,
    deathDate: row.death_date,
    birthPlace: row.birth_place,
    deathPlace: row.death_place,
    biography: row.biography,
    isLiving: row.is_living === null ? null : row.is_living === 1,
    photoUrl: row.photo_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRelationshipRow(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    type: row.type,
    person1Id: row.person1_id,
    person2Id: row.person2_id,
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function getPersonById(
  db: D1Database,
  userId: string,
  personId: string,
): Promise<Person | null> {
  const row = await db.prepare("SELECT * FROM global_persons WHERE id = ?").bind(personId).first<PersonRow>();

  if (!row) {
    return null;
  }

  return mapPersonRow(row, await canEditPerson(db, userId, personId));
}

export async function getPersonByIdGlobal(
  db: D1Database,
  personId: string,
): Promise<Person | null> {
  const row = await db.prepare("SELECT * FROM global_persons WHERE id = ?").bind(personId).first<PersonRow>();
  return row ? mapPersonRow(row) : null;
}

export async function listPersons(db: D1Database, userId: string): Promise<Person[]> {
  const editablePersonIds = await listEditablePersonIds(db, userId);
  const rootPersonId = await getPrimaryPersonId(db, userId);
  const connectedPersonIds = rootPersonId ? await listConnectedPersonIds(db, rootPersonId) : [];
  const personIds = [...new Set([...editablePersonIds, ...connectedPersonIds])];

  if (personIds.length === 0) {
    return [];
  }

  return getPersonsByIds(db, userId, personIds);
}

export async function listAllPersons(db: D1Database): Promise<Person[]> {
  const result = await db
    .prepare(
      `
        SELECT *
        FROM global_persons
        ORDER BY COALESCE(last_name, ''), first_name, birth_date, id
      `,
    )
    .all<PersonRow>();

  return result.results.map((row) => mapPersonRow(row));
}

export async function listAllPersonsPage(
  db: D1Database,
  userId: string,
  params: {
    query: string;
    page: number;
    pageSize: number;
  },
): Promise<{ items: Person[]; totalItems: number }> {
  const normalizedQuery = normalizeSearchValue(params.query);
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.max(1, Math.min(50, Math.floor(params.pageSize)));
  const offset = (page - 1) * pageSize;
  const editablePersonIds = await listEditablePersonIds(db, userId);

  const rows = await db
    .prepare(
      `
        SELECT *
        FROM global_persons
        WHERE
          ? = ''
          OR LOWER(first_name) LIKE ?
          OR LOWER(COALESCE(last_name, '')) LIKE ?
          OR LOWER(COALESCE(middle_name, '')) LIKE ?
          OR LOWER(COALESCE(maiden_name, '')) LIKE ?
          OR LOWER(COALESCE(birth_place, '')) LIKE ?
          OR LOWER(COALESCE(death_place, '')) LIKE ?
        ORDER BY COALESCE(last_name, ''), first_name, birth_date, id
        LIMIT ? OFFSET ?
      `,
    )
    .bind(
      normalizedQuery,
      likePattern(normalizedQuery),
      likePattern(normalizedQuery),
      likePattern(normalizedQuery),
      likePattern(normalizedQuery),
      likePattern(normalizedQuery),
      likePattern(normalizedQuery),
      pageSize,
      offset,
    )
    .all<PersonRow>();

  const totalRow = await db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM global_persons
        WHERE
          ? = ''
          OR LOWER(first_name) LIKE ?
          OR LOWER(COALESCE(last_name, '')) LIKE ?
          OR LOWER(COALESCE(middle_name, '')) LIKE ?
          OR LOWER(COALESCE(maiden_name, '')) LIKE ?
          OR LOWER(COALESCE(birth_place, '')) LIKE ?
          OR LOWER(COALESCE(death_place, '')) LIKE ?
      `,
    )
    .bind(
      normalizedQuery,
      likePattern(normalizedQuery),
      likePattern(normalizedQuery),
      likePattern(normalizedQuery),
      likePattern(normalizedQuery),
      likePattern(normalizedQuery),
      likePattern(normalizedQuery),
    )
    .first<CountRow>();

  return {
    items: rows.results.map((row) => mapPersonRow(row, editablePersonIds.includes(row.id))),
    totalItems: Number(totalRow?.count ?? 0),
  };
}

export async function getPersonsByIds(
  db: D1Database,
  userId: string,
  personIds: string[],
): Promise<Person[]> {
  if (personIds.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(personIds)];
  const placeholders = createPlaceholders(uniqueIds.length);
  const result = await db
    .prepare(
      `SELECT * FROM global_persons WHERE id IN (${placeholders}) ORDER BY COALESCE(last_name, ''), first_name`,
    )
    .bind(...uniqueIds)
    .all<PersonRow>();
  const editableIds = await listEditablePersonIds(db, userId, uniqueIds);

  return result.results.map((row) => mapPersonRow(row, editableIds.includes(row.id)));
}

export async function listRelationshipsByPersonId(
  db: D1Database,
  userId: string,
  personId: string,
): Promise<Relationship[]> {
  void userId;
  const result = await db
    .prepare(
      `
        SELECT *
        FROM global_relationships
        WHERE person1_id = ? OR person2_id = ?
        ORDER BY created_at DESC
      `,
    )
    .bind(personId, personId)
    .all<RelationshipRow>();

  return result.results.map(mapRelationshipRow);
}

export async function getRelationshipById(
  db: D1Database,
  userId: string,
  relationshipId: string,
): Promise<Relationship | null> {
  void userId;
  const row = await db
    .prepare("SELECT * FROM global_relationships WHERE id = ?")
    .bind(relationshipId)
    .first<RelationshipRow>();

  return row ? mapRelationshipRow(row) : null;
}

export async function personsExist(db: D1Database, userId: string, personIds: string[]): Promise<boolean> {
  void userId;
  const uniqueIds = [...new Set(personIds)];

  if (uniqueIds.length === 0) {
    return false;
  }

  const placeholders = createPlaceholders(uniqueIds.length);
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM global_persons WHERE id IN (${placeholders})`)
    .bind(...uniqueIds)
    .first<CountRow>();

  return Number(row?.count ?? 0) === uniqueIds.length;
}

export async function getParentRelationshipsForChildren(
  db: D1Database,
  userId: string,
  childIds: string[],
): Promise<Relationship[]> {
  void userId;
  if (childIds.length === 0) {
    return [];
  }

  const result = await db
    .prepare(
      `
        SELECT *
        FROM global_relationships
        WHERE type = 'parent_child'
          AND person2_id IN (${createPlaceholders(childIds.length)})
      `,
    )
    .bind(...childIds)
    .all<RelationshipRow>();

  return result.results.map(mapRelationshipRow);
}

export async function getChildRelationshipsForParents(
  db: D1Database,
  userId: string,
  parentIds: string[],
): Promise<Relationship[]> {
  void userId;
  if (parentIds.length === 0) {
    return [];
  }

  const result = await db
    .prepare(
      `
        SELECT *
        FROM global_relationships
        WHERE type = 'parent_child'
          AND person1_id IN (${createPlaceholders(parentIds.length)})
      `,
    )
    .bind(...parentIds)
    .all<RelationshipRow>();

  return result.results.map(mapRelationshipRow);
}

export async function getSpouseRelationshipsForPersons(
  db: D1Database,
  userId: string,
  personIds: string[],
): Promise<Relationship[]> {
  void userId;
  if (personIds.length === 0) {
    return [];
  }

  const placeholders = createPlaceholders(personIds.length);
  const result = await db
    .prepare(
      `
        SELECT *
        FROM global_relationships
        WHERE type = 'spouse'
          AND (person1_id IN (${placeholders}) OR person2_id IN (${placeholders}))
      `,
    )
    .bind(...personIds, ...personIds)
    .all<RelationshipRow>();

  return result.results.map(mapRelationshipRow);
}

export async function getConnectedFamilyGraph(
  db: D1Database,
  userId: string,
  focusPersonId: string,
): Promise<FamilyGraphResponse> {
  const personIds = await listConnectedPersonIds(db, focusPersonId);
  const persons = await getPersonsByIds(db, userId, personIds);

  if (personIds.length === 0) {
    return {
      focusPersonId,
      persons: [],
      relationships: [],
    };
  }

  const placeholders = createPlaceholders(personIds.length);
  const relationshipsResult = await db
    .prepare(
      `
        SELECT *
        FROM global_relationships
        WHERE person1_id IN (${placeholders})
          OR person2_id IN (${placeholders})
        ORDER BY created_at
      `,
    )
    .bind(...personIds, ...personIds)
    .all<RelationshipRow>();

  return {
    focusPersonId,
    persons,
    relationships: relationshipsResult.results.map(mapRelationshipRow),
  };
}

export async function canEditPerson(db: D1Database, userId: string, personId: string): Promise<boolean> {
  if (await isUserAdmin(db, userId)) {
    return true;
  }

  const row = await db
    .prepare(
      `
        SELECT person_id
        FROM person_permissions
        WHERE user_id = ?
          AND person_id = ?
          AND role IN ('owner', 'editor')
        LIMIT 1
      `,
    )
    .bind(userId, personId)
    .first<PermissionRow>();

  return !!row;
}

export async function canEditAnyPerson(
  db: D1Database,
  userId: string,
  personIds: string[],
): Promise<boolean> {
  if (await isUserAdmin(db, userId)) {
    return personIds.length > 0;
  }

  const uniqueIds = [...new Set(personIds)];

  if (uniqueIds.length === 0) {
    return false;
  }

  const placeholders = createPlaceholders(uniqueIds.length);
  const row = await db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM person_permissions
        WHERE user_id = ?
          AND role IN ('owner', 'editor')
          AND person_id IN (${placeholders})
      `,
    )
    .bind(userId, ...uniqueIds)
    .first<CountRow>();

  return Number(row?.count ?? 0) > 0;
}

export async function grantPersonPermission(
  db: D1Database,
  userId: string,
  personId: string,
  role: PermissionRole,
): Promise<void> {
  await db
    .prepare(
      `
        INSERT INTO person_permissions (user_id, person_id, role, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, person_id) DO UPDATE SET role = CASE
          WHEN person_permissions.role = 'owner' OR excluded.role = 'owner' THEN 'owner'
          WHEN person_permissions.role = 'editor' OR excluded.role = 'editor' THEN 'editor'
          ELSE 'viewer'
        END
      `,
    )
    .bind(userId, personId, role, new Date().toISOString())
    .run();
}

export async function countOtherPersonPermissions(
  db: D1Database,
  personId: string,
  userId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM person_permissions
        WHERE person_id = ?
          AND user_id <> ?
      `,
    )
    .bind(personId, userId)
    .first<CountRow>();

  return Number(row?.count ?? 0);
}

export async function isUserAdmin(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT is_admin FROM users WHERE id = ?")
    .bind(userId)
    .first<AdminRow>();

  return row?.is_admin === 1;
}

export async function findDuplicatePersonByIdentity(
  db: D1Database,
  input: {
    firstName: string | null | undefined;
    lastName: string | null | undefined;
    birthDate: string | null | undefined;
  },
  ignorePersonId?: string,
): Promise<{
  id: string;
  firstName: string;
  lastName: string | null;
  middleName: string | null;
} | null> {
  const firstName = normalizeIdentityValue(input.firstName);
  const lastName = normalizeIdentityValue(input.lastName);
  const birthDate = input.birthDate?.trim() ?? "";

  if (!firstName || !lastName || !birthDate) {
    return null;
  }

  const result = await db
    .prepare(
      `
        SELECT
          id,
          first_name AS firstName,
          last_name AS lastName,
          middle_name AS middleName
        FROM global_persons
        WHERE birth_date = ?
        ORDER BY created_at
      `,
    )
    .bind(birthDate)
    .all<{
      id: string;
      firstName: string;
      lastName: string | null;
      middleName: string | null;
    }>();

  return (
    result.results.find((candidate) => {
      if (candidate.id === ignorePersonId) {
        return false;
      }

      return (
        normalizeIdentityValue(candidate.firstName) === firstName &&
        normalizeIdentityValue(candidate.lastName) === lastName
      );
    }) ?? null
  );
}

function createPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase("uk-UA");
}

function likePattern(value: string): string {
  return `%${value}%`;
}

async function getPrimaryPersonId(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT primary_person_id FROM users WHERE id = ?")
    .bind(userId)
    .first<PrimaryPersonRow>();

  return row?.primary_person_id ?? null;
}

async function listEditablePersonIds(
  db: D1Database,
  userId: string,
  personIds?: string[],
): Promise<string[]> {
  if (personIds && personIds.length === 0) {
    return [];
  }

  if (await isUserAdmin(db, userId)) {
    if (personIds) {
      return [...new Set(personIds)];
    }

    const result = await db.prepare("SELECT id AS person_id FROM global_persons").all<PermissionRow>();
    return result.results.map((row) => row.person_id);
  }

  const scopedClause = personIds ? ` AND person_id IN (${createPlaceholders(personIds.length)})` : "";
  const result = await db
    .prepare(
      `
        SELECT person_id
        FROM person_permissions
        WHERE user_id = ?
          AND role IN ('owner', 'editor')${scopedClause}
      `,
    )
    .bind(userId, ...(personIds ?? []))
    .all<PermissionRow>();

  return result.results.map((row) => row.person_id);
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

function normalizeIdentityValue(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase("uk") ?? "";
}
