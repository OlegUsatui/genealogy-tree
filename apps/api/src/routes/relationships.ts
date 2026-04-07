import type {
  CreateDirectoryRelationshipDto,
  CreateDirectoryRelationshipResponse,
  CreateRelationshipDto,
  RelationshipDirection,
  SessionUser,
} from "@family-tree/shared";

import { getPersonById, getRelationshipById, listRelationshipsByPersonId, personsExist } from "../lib/db";
import { HttpError, json, noContent, readJson } from "../lib/http";
import {
  ensurePersonGraphImported,
  getCanonicalPersonRowByAnyId,
  replaceRelationshipAcrossAccounts,
  syncRelationshipAcrossAccounts,
} from "../lib/person-graph";
import { normalizeCreateRelationshipDto } from "../lib/normalize";
import type { Env } from "../types";

type RelationshipRow = {
  id: string;
  user_id: string;
  type: "parent_child" | "spouse";
  person1_id: string;
  person2_id: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
};

export async function getRelationships(url: URL, env: Env, currentUser: SessionUser): Promise<Response> {
  const personId = url.searchParams.get("personId")?.trim();

  if (!personId) {
    throw new HttpError(400, "Параметр personId є обов’язковим");
  }

  const person = await getPersonById(env.DB, currentUser.id, personId);

  if (!person) {
    throw new HttpError(404, "Людину не знайдено");
  }

  const relationships = await listRelationshipsByPersonId(env.DB, currentUser.id, personId);
  return json(relationships);
}

export async function createRelationship(
  request: Request,
  env: Env,
  currentUser: SessionUser,
): Promise<Response> {
  const input = normalizeCreateRelationshipDto(await readJson<CreateRelationshipDto>(request));

  if (!(await personsExist(env.DB, currentUser.id, [input.person1Id, input.person2Id]))) {
    throw new HttpError(404, "Одну або кілька людей не знайдено");
  }

  const duplicate = await findDuplicateRelationship(env, currentUser, input);

  if (duplicate) {
    throw new HttpError(409, "Такий зв’язок уже існує");
  }
  const relationship = await syncRelationshipAcrossAccounts(env.DB, {
    userId: currentUser.id,
    type: input.type,
    person1Id: input.person1Id,
    person2Id: input.person2Id,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    notes: input.notes ?? null,
  });

  return json(relationship, { status: 201 });
}

export async function createDirectoryRelationship(
  request: Request,
  env: Env,
  currentUser: SessionUser,
  directoryPersonId: string,
): Promise<Response> {
  const input = normalizeCreateDirectoryRelationshipDto(await readJson<CreateDirectoryRelationshipDto>(request));
  const localPerson = await getPersonById(env.DB, currentUser.id, input.localPersonId);

  if (!localPerson) {
    throw new HttpError(404, "Людину з вашого дерева не знайдено");
  }

  const sourcePerson = await getCanonicalPersonRowByAnyId(env.DB, directoryPersonId);

  if (!sourcePerson) {
    throw new HttpError(404, "Людину не знайдено");
  }

  const currentAccountPerson = await ensurePersonGraphImported(env.DB, sourcePerson.user_id, sourcePerson.id, currentUser.id);

  if (currentAccountPerson.id === input.localPersonId) {
    throw new HttpError(400, "Не можна створити зв’язок людини самої з собою");
  }

  const localPayload = buildRelationshipPayload(currentAccountPerson.id, input);
  const relationship = await syncRelationshipAcrossAccounts(env.DB, {
    userId: currentUser.id,
    ...localPayload,
  });

  const response: CreateDirectoryRelationshipResponse = {
    person: currentAccountPerson,
    relationship,
  };

  return json(response, { status: 201 });
}

export async function deleteRelationship(
  env: Env,
  currentUser: SessionUser,
  relationshipId: string,
): Promise<Response> {
  const existing = await getRelationshipById(env.DB, currentUser.id, relationshipId);

  if (!existing) {
    throw new HttpError(404, "Зв’язок не знайдено");
  }

  await env.DB.prepare("DELETE FROM relationships WHERE user_id = ? AND id = ?").bind(currentUser.id, relationshipId).run();
  return noContent();
}

export async function updateRelationship(
  request: Request,
  env: Env,
  currentUser: SessionUser,
  relationshipId: string,
): Promise<Response> {
  const existing = await getRelationshipById(env.DB, currentUser.id, relationshipId);

  if (!existing) {
    throw new HttpError(404, "Зв’язок не знайдено");
  }

  const input = normalizeCreateRelationshipDto(await readJson<CreateRelationshipDto>(request));

  if (!(await personsExist(env.DB, currentUser.id, [input.person1Id, input.person2Id]))) {
    throw new HttpError(404, "Одну або кілька людей не знайдено");
  }

  const relationship = await replaceRelationshipAcrossAccounts(env.DB, {
    userId: currentUser.id,
    relationshipId,
    type: input.type,
    person1Id: input.person1Id,
    person2Id: input.person2Id,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    notes: input.notes ?? null,
  });

  return json(relationship);
}

async function findDuplicateRelationship(
  env: Env,
  currentUser: SessionUser,
  input: CreateRelationshipDto,
): Promise<RelationshipRow | null> {
  if (input.type === "spouse") {
    return env.DB
      .prepare(
        `
          SELECT *
          FROM relationships
          WHERE user_id = ?
            AND type = 'spouse'
            AND (
              (person1_id = ? AND person2_id = ?)
              OR (person1_id = ? AND person2_id = ?)
            )
          LIMIT 1
        `,
      )
      .bind(currentUser.id, input.person1Id, input.person2Id, input.person2Id, input.person1Id)
      .first<RelationshipRow>();
  }

  return env.DB
    .prepare(
      `
        SELECT *
        FROM relationships
        WHERE user_id = ?
          AND type = 'parent_child'
          AND person1_id = ?
          AND person2_id = ?
        LIMIT 1
      `,
    )
    .bind(currentUser.id, input.person1Id, input.person2Id)
    .first<RelationshipRow>();
}

function normalizeCreateDirectoryRelationshipDto(input: CreateDirectoryRelationshipDto): CreateDirectoryRelationshipDto & {
  localPersonId: string;
  direction: RelationshipDirection;
} {
  const localPersonId = normalizeRequiredString(input.localPersonId, "Поле localPersonId є обов’язковим");

  if (input.type !== "parent_child" && input.type !== "spouse") {
    throw new HttpError(400, "Поле type має бути або parent_child, або spouse");
  }

  const direction = input.direction ?? "current_is_parent";

  if (direction !== "current_is_parent" && direction !== "current_is_child") {
    throw new HttpError(400, "Поле direction має бути current_is_parent або current_is_child");
  }

  return {
    type: input.type,
    localPersonId,
    direction,
    startDate: normalizeOptionalString(input.startDate),
    endDate: normalizeOptionalString(input.endDate),
    notes: normalizeOptionalString(input.notes),
  };
}

function buildRelationshipPayload(
  currentPersonId: string,
  input: CreateDirectoryRelationshipDto & { localPersonId: string; direction: RelationshipDirection },
): CreateRelationshipDto {
  if (input.type === "spouse") {
    return {
      type: "spouse",
      person1Id: currentPersonId,
      person2Id: input.localPersonId,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      notes: input.notes ?? null,
    };
  }

  const currentIsParent = input.direction === "current_is_parent";

  return {
    type: "parent_child",
    person1Id: currentIsParent ? currentPersonId : input.localPersonId,
    person2Id: currentIsParent ? input.localPersonId : currentPersonId,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    notes: input.notes ?? null,
  };
}

function normalizeRequiredString(value: unknown, errorMessage: string): string {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    throw new HttpError(400, errorMessage);
  }

  return normalized;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}
