import type { CreateRelationshipDto, SessionUser } from "@family-tree/shared";

import { getPersonById, getRelationshipById, listRelationshipsByPersonId, mapRelationshipRow, personsExist } from "../lib/db";
import { HttpError, json, noContent, readJson } from "../lib/http";
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

  const relationshipId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  await env.DB.prepare(
    `
      INSERT INTO relationships (
        id,
        user_id,
        type,
        person1_id,
        person2_id,
        start_date,
        end_date,
        notes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      relationshipId,
      currentUser.id,
      input.type,
      input.person1Id,
      input.person2Id,
      input.startDate ?? null,
      input.endDate ?? null,
      input.notes ?? null,
      timestamp,
    )
    .run();

  const row = await env.DB
    .prepare("SELECT * FROM relationships WHERE user_id = ? AND id = ?")
    .bind(currentUser.id, relationshipId)
    .first<RelationshipRow>();

  if (!row) {
    throw new HttpError(500, "Не вдалося створити зв’язок");
  }

  return json(mapRelationshipRow(row), { status: 201 });
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
