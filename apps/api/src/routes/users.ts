import type { CreateUserDto, UserAccount } from "@family-tree/shared";

import { HttpError, json, readJson } from "../lib/http";
import { normalizeCreateUserDto } from "../lib/normalize";
import { hashPassword } from "../lib/password";
import type { Env } from "../types";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  primary_person_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function createUser(request: Request, env: Env): Promise<Response> {
  const input = normalizeCreateUserDto(await readJson<CreateUserDto>(request));

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(input.email)
    .first<{ id: string }>();

  if (existing) {
    throw new HttpError(409, "Користувач з таким email уже існує");
  }

  const userId = crypto.randomUUID();
  const primaryPersonId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const passwordHash = await hashPassword(input.password, crypto.randomUUID());
  const primaryPerson = input.personMode === "existing"
    ? await getExistingPersonTemplate(env.DB, input.existingPersonId!)
    : input.person!;

  await env.DB.batch([
    env.DB.prepare(
      `
        INSERT INTO users (
          id,
          email,
          password_hash,
          primary_person_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
      .bind(userId, input.email, passwordHash, primaryPersonId, timestamp, timestamp),
    env.DB.prepare(
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
        primaryPersonId,
        userId,
        primaryPerson.firstName,
        primaryPerson.lastName,
        primaryPerson.middleName,
        primaryPerson.maidenName,
        primaryPerson.gender,
        primaryPerson.birthDate,
        null,
        primaryPerson.birthPlace,
        null,
        null,
        primaryPerson.isLiving === null ? null : primaryPerson.isLiving ? 1 : 0,
        null,
        timestamp,
        timestamp,
      ),
  ]);

  const createdUser = await env.DB.prepare(
    "SELECT id, email, password_hash, primary_person_id, created_at, updated_at FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<UserRow>();

  if (!createdUser) {
    throw new HttpError(500, "Не вдалося створити користувача");
  }

  return json(mapUserRow(createdUser), { status: 201 });
}

function mapUserRow(row: UserRow): UserAccount {
  return {
    id: row.id,
    email: row.email,
    primaryPersonId: row.primary_person_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type ExistingPersonRow = {
  first_name: string;
  last_name: string | null;
  middle_name: string | null;
  maiden_name: string | null;
  gender: "male" | "female" | "other" | "unknown";
  birth_date: string | null;
  birth_place: string | null;
  is_living: number | null;
};

async function getExistingPersonTemplate(db: D1Database, personId: string) {
  const person = await db.prepare(
    `
      SELECT
        first_name,
        last_name,
        middle_name,
        maiden_name,
        gender,
        birth_date,
        birth_place,
        is_living
      FROM persons
      WHERE id = ?
    `,
  )
    .bind(personId)
    .first<ExistingPersonRow>();

  if (!person) {
    throw new HttpError(404, "Обрану людину не знайдено");
  }

  return {
    firstName: person.first_name,
    lastName: person.last_name,
    middleName: person.middle_name,
    maidenName: person.maiden_name,
    gender: person.gender,
    birthDate: person.birth_date,
    birthPlace: person.birth_place,
    isLiving: person.is_living === null ? null : person.is_living === 1,
  };
}
