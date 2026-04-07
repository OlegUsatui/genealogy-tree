import type { CreateUserDto, UserAccount } from "@family-tree/shared";

import { HttpError, json, readJson } from "../lib/http";
import { normalizeCreateUserDto } from "../lib/normalize";
import { hashPassword } from "../lib/password";
import { ensurePersonGraphImported, getCanonicalPersonRowByAnyId } from "../lib/person-graph";
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
  const timestamp = new Date().toISOString();
  const passwordHash = await hashPassword(input.password, crypto.randomUUID());
  let primaryPersonId: string | null = null;

  if (input.personMode === "existing") {
    const sourcePerson = await getCanonicalPersonRowByAnyId(env.DB, input.existingPersonId!);

    if (!sourcePerson) {
      throw new HttpError(404, "Обрану людину не знайдено");
    }

    await env.DB.prepare(
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
      .bind(userId, input.email, passwordHash, null, timestamp, timestamp)
      .run();

    try {
      const importedPrimaryPerson = await ensurePersonGraphImported(
        env.DB,
        sourcePerson.user_id,
        sourcePerson.id,
        userId,
      );

      primaryPersonId = importedPrimaryPerson.id;

      await env.DB.prepare("UPDATE users SET primary_person_id = ?, updated_at = ? WHERE id = ?")
        .bind(primaryPersonId, new Date().toISOString(), userId)
        .run();
    } catch (error) {
      await cleanupUserCreation(env.DB, userId);
      throw error;
    }
  } else {
    primaryPersonId = crypto.randomUUID();
    const primaryPerson = input.person!;

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
            source_person_id,
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
        .bind(
          primaryPersonId,
          userId,
          null,
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
  }

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

async function cleanupUserCreation(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM relationships WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM persons WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
}
