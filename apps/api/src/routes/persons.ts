import type { CreatePersonDto, UpdatePersonDto } from "@family-tree/shared";

import { getPersonById, listPersons, mapPersonRow } from "../lib/db";
import { HttpError, json, noContent, readJson } from "../lib/http";
import { normalizeCreatePersonDto, normalizeUpdatePersonDto, toDbBoolean } from "../lib/normalize";
import type { Env } from "../types";

type PersonRow = {
  id: string;
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

export async function getPersons(env: Env): Promise<Response> {
  const persons = await listPersons(env.DB);
  return json(persons);
}

export async function getPerson(env: Env, personId: string): Promise<Response> {
  const person = await getPersonById(env.DB, personId);

  if (!person) {
    throw new HttpError(404, "Person not found");
  }

  return json(person);
}

export async function createPerson(request: Request, env: Env): Promise<Response> {
  const input = normalizeCreatePersonDto(await readJson<CreatePersonDto>(request));
  const personId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  await env.DB.prepare(
    `
      INSERT INTO persons (
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      personId,
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

  const row = await env.DB.prepare("SELECT * FROM persons WHERE id = ?").bind(personId).first<PersonRow>();

  if (!row) {
    throw new HttpError(500, "Failed to create person");
  }

  return json(mapPersonRow(row), { status: 201 });
}

export async function updatePerson(request: Request, env: Env, personId: string): Promise<Response> {
  const existing = await getPersonById(env.DB, personId);

  if (!existing) {
    throw new HttpError(404, "Person not found");
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
    throw new HttpError(400, "No fields provided for update");
  }

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(personId);

  await env.DB.prepare(`UPDATE persons SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();

  const row = await env.DB.prepare("SELECT * FROM persons WHERE id = ?").bind(personId).first<PersonRow>();

  if (!row) {
    throw new HttpError(500, "Failed to update person");
  }

  return json(mapPersonRow(row));
}

export async function deletePerson(env: Env, personId: string): Promise<Response> {
  const existing = await getPersonById(env.DB, personId);

  if (!existing) {
    throw new HttpError(404, "Person not found");
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM relationships WHERE person1_id = ? OR person2_id = ?").bind(personId, personId),
    env.DB.prepare("DELETE FROM persons WHERE id = ?").bind(personId),
  ]);

  return noContent();
}

