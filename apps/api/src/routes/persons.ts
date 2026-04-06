import type { CreatePersonDto, SessionUser, UpdatePersonDto } from "@family-tree/shared";

import { getPersonById, listPersons, mapPersonRow } from "../lib/db";
import { HttpError, json, noContent, readJson } from "../lib/http";
import { normalizeCreatePersonDto, normalizeUpdatePersonDto, toDbBoolean } from "../lib/normalize";
import type { Env } from "../types";

type PersonRow = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string | null;
  middle_name: string | null;
  maiden_name: string | null;
  gender: "male" | "female" | "other" | "unknown";
  birth_date: string | null;
  death_date: string | null;
  birth_place: string | null;
  death_place: string | null;
  biography: string | null;
  is_living: number | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
};

export async function getPersons(env: Env, currentUser: SessionUser): Promise<Response> {
  const persons = await listPersons(env.DB, currentUser.id);
  return json(persons);
}

export async function getPerson(env: Env, currentUser: SessionUser, personId: string): Promise<Response> {
  const person = await getPersonById(env.DB, currentUser.id, personId);

  if (!person) {
    throw new HttpError(404, "Людину не знайдено");
  }

  return json(person);
}

export async function createPerson(request: Request, env: Env, currentUser: SessionUser): Promise<Response> {
  const input = normalizeCreatePersonDto(await readJson<CreatePersonDto>(request));
  const personId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  await env.DB.prepare(
    `
      INSERT INTO persons (
        id,
        user_id,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      personId,
      currentUser.id,
      input.firstName,
      input.lastName,
      input.middleName,
      input.maidenName,
      input.gender,
      input.birthDate,
      input.deathDate,
      input.birthPlace,
      input.deathPlace,
      input.biography,
      toDbBoolean(input.isLiving),
      input.photoUrl,
      timestamp,
      timestamp,
    )
    .run();

  const row = await env.DB
    .prepare("SELECT * FROM persons WHERE user_id = ? AND id = ?")
    .bind(currentUser.id, personId)
    .first<PersonRow>();

  if (!row) {
    throw new HttpError(500, "Не вдалося створити людину");
  }

  return json(mapPersonRow(row), { status: 201 });
}

export async function updatePerson(
  request: Request,
  env: Env,
  currentUser: SessionUser,
  personId: string,
): Promise<Response> {
  const existing = await getPersonById(env.DB, currentUser.id, personId);

  if (!existing) {
    throw new HttpError(404, "Людину не знайдено");
  }

  const input = normalizeUpdatePersonDto(await readJson<UpdatePersonDto>(request));
  const updates: string[] = [];
  const values: unknown[] = [];

  if ("firstName" in input) {
    updates.push("first_name = ?");
    values.push(input.firstName);
  }

  if ("lastName" in input) {
    updates.push("last_name = ?");
    values.push(input.lastName);
  }

  if ("middleName" in input) {
    updates.push("middle_name = ?");
    values.push(input.middleName);
  }

  if ("maidenName" in input) {
    updates.push("maiden_name = ?");
    values.push(input.maidenName);
  }

  if ("gender" in input) {
    updates.push("gender = ?");
    values.push(input.gender);
  }

  if ("birthDate" in input) {
    updates.push("birth_date = ?");
    values.push(input.birthDate);
  }

  if ("deathDate" in input) {
    updates.push("death_date = ?");
    values.push(input.deathDate);
  }

  if ("birthPlace" in input) {
    updates.push("birth_place = ?");
    values.push(input.birthPlace);
  }

  if ("deathPlace" in input) {
    updates.push("death_place = ?");
    values.push(input.deathPlace);
  }

  if ("biography" in input) {
    updates.push("biography = ?");
    values.push(input.biography);
  }

  if ("isLiving" in input) {
    updates.push("is_living = ?");
    values.push(toDbBoolean(input.isLiving ?? null));
  }

  if ("photoUrl" in input) {
    updates.push("photo_url = ?");
    values.push(input.photoUrl);
  }

  if (updates.length === 0) {
    throw new HttpError(400, "Не передано жодного поля для оновлення");
  }

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());

  await env.DB
    .prepare(`UPDATE persons SET ${updates.join(", ")} WHERE user_id = ? AND id = ?`)
    .bind(...values, currentUser.id, personId)
    .run();

  const row = await env.DB
    .prepare("SELECT * FROM persons WHERE user_id = ? AND id = ?")
    .bind(currentUser.id, personId)
    .first<PersonRow>();

  if (!row) {
    throw new HttpError(500, "Не вдалося оновити людину");
  }

  return json(mapPersonRow(row));
}

export async function deletePerson(env: Env, currentUser: SessionUser, personId: string): Promise<Response> {
  const existing = await getPersonById(env.DB, currentUser.id, personId);

  if (!existing) {
    throw new HttpError(404, "Людину не знайдено");
  }

  if (currentUser.primaryPersonId === personId) {
    throw new HttpError(400, "Не можна видалити власний профіль");
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM relationships WHERE user_id = ? AND (person1_id = ? OR person2_id = ?)")
      .bind(currentUser.id, personId, personId),
    env.DB.prepare("DELETE FROM persons WHERE user_id = ? AND id = ?").bind(currentUser.id, personId),
  ]);

  return noContent();
}
