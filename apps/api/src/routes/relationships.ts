import type {
  CreateDirectoryRelationshipDto,
  CreateDirectoryRelationshipResponse,
  CreateRelationshipDto,
  RelationshipDirection,
  SessionUser,
} from "@family-tree/shared";

import {
  canEditAnyPerson,
  canEditPerson,
  getPersonById,
  getPersonByIdGlobal,
  getRelationshipById,
  listRelationshipsByPersonId,
  personsExist,
} from "../lib/db";
import { HttpError, json, noContent, readJson } from "../lib/http";
import { normalizeCreateRelationshipDto } from "../lib/normalize";
import type { Env } from "../types";

type RelationshipRow = {
  id: string;
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

  const person = await getPersonByIdGlobal(env.DB, personId);

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

  if (!(await canEditAnyPerson(env.DB, currentUser.id, [input.person1Id, input.person2Id]))) {
    throw new HttpError(403, "У вас немає прав на створення цього зв’язку");
  }

  const duplicate = await findDuplicateRelationship(env, input);

  if (duplicate) {
    throw new HttpError(409, "Такий зв’язок уже існує");
  }

  const relationship = await insertRelationship(env, input);
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

  if (!(await canEditPerson(env.DB, currentUser.id, input.localPersonId))) {
    throw new HttpError(403, "У вас немає прав на редагування обраної людини");
  }

  const directoryPerson = await getPersonById(env.DB, currentUser.id, directoryPersonId);

  if (!directoryPerson) {
    throw new HttpError(404, "Людину не знайдено");
  }

  if (directoryPerson.id === input.localPersonId) {
    throw new HttpError(400, "Не можна створити зв’язок людини самої з собою");
  }

  const payload = buildRelationshipPayload(directoryPerson.id, input);
  const duplicate = await findDuplicateRelationship(env, payload);

  if (duplicate) {
    throw new HttpError(409, "Такий зв’язок уже існує");
  }

  const relationship = await insertRelationship(env, payload);
  const response: CreateDirectoryRelationshipResponse = {
    person: directoryPerson,
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

  if (!(await canEditAnyPerson(env.DB, currentUser.id, [existing.person1Id, existing.person2Id]))) {
    throw new HttpError(403, "У вас немає прав на видалення цього зв’язку");
  }

  await env.DB.prepare("DELETE FROM global_relationships WHERE id = ?").bind(relationshipId).run();
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

  if (!(await canEditAnyPerson(env.DB, currentUser.id, [existing.person1Id, existing.person2Id]))) {
    throw new HttpError(403, "У вас немає прав на оновлення цього зв’язку");
  }

  const input = normalizeCreateRelationshipDto(await readJson<CreateRelationshipDto>(request));

  if (!(await personsExist(env.DB, currentUser.id, [input.person1Id, input.person2Id]))) {
    throw new HttpError(404, "Одну або кілька людей не знайдено");
  }

  if (!(await canEditAnyPerson(env.DB, currentUser.id, [input.person1Id, input.person2Id]))) {
    throw new HttpError(403, "У вас немає прав на оновлення цього зв’язку");
  }

  const duplicate = await findDuplicateRelationship(env, input, relationshipId);

  if (duplicate) {
    throw new HttpError(409, "Такий зв’язок уже існує");
  }

  await env.DB
    .prepare(
      `
        UPDATE global_relationships
        SET
          type = ?,
          person1_id = ?,
          person2_id = ?,
          start_date = ?,
          end_date = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ?
      `,
    )
    .bind(
      input.type,
      normalizeRelationshipPerson1Id(input),
      normalizeRelationshipPerson2Id(input),
      input.startDate ?? null,
      input.endDate ?? null,
      input.notes ?? null,
      new Date().toISOString(),
      relationshipId,
    )
    .run();

  const updated = await getRelationshipById(env.DB, currentUser.id, relationshipId);

  if (!updated) {
    throw new HttpError(500, "Не вдалося оновити зв’язок");
  }

  return json(updated);
}

async function insertRelationship(env: Env, input: CreateRelationshipDto) {
  const relationshipId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      relationshipId,
      input.type,
      normalizeRelationshipPerson1Id(input),
      normalizeRelationshipPerson2Id(input),
      input.startDate ?? null,
      input.endDate ?? null,
      input.notes ?? null,
      timestamp,
      timestamp,
    )
    .run();

  const relationship = await getRelationshipById(env.DB, "", relationshipId);

  if (!relationship) {
    throw new HttpError(500, "Не вдалося створити зв’язок");
  }

  return relationship;
}

async function findDuplicateRelationship(
  env: Env,
  input: CreateRelationshipDto,
  ignoreRelationshipId?: string,
): Promise<RelationshipRow | null> {
  const person1Id = normalizeRelationshipPerson1Id(input);
  const person2Id = normalizeRelationshipPerson2Id(input);
  const row = await env.DB
    .prepare(
      `
        SELECT *
        FROM global_relationships
        WHERE type = ?
          AND person1_id = ?
          AND person2_id = ?
        LIMIT 1
      `,
    )
    .bind(input.type, person1Id, person2Id)
    .first<RelationshipRow>();

  if (!row || row.id === ignoreRelationshipId) {
    return null;
  }

  return row;
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

function normalizeRelationshipPerson1Id(input: CreateRelationshipDto): string {
  if (input.type !== "spouse") {
    return input.person1Id;
  }

  return input.person1Id.localeCompare(input.person2Id) <= 0 ? input.person1Id : input.person2Id;
}

function normalizeRelationshipPerson2Id(input: CreateRelationshipDto): string {
  if (input.type !== "spouse") {
    return input.person2Id;
  }

  return input.person1Id.localeCompare(input.person2Id) <= 0 ? input.person2Id : input.person1Id;
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
