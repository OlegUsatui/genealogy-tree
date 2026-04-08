import type { CreateUserDto, UserAccount } from "@family-tree/shared";

import { findDuplicatePersonByIdentity, getPersonByIdGlobal, grantPersonPermission } from "../lib/db";
import { HttpError, json, readJson } from "../lib/http";
import { normalizeCreateUserDto, toDbBoolean } from "../lib/normalize";
import {
  buildDuplicatePersonHttpError,
  formatDuplicatePersonName,
  isDuplicatePersonConstraintError,
} from "../lib/person-duplicates";
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
  const timestamp = new Date().toISOString();
  const passwordHash = await hashPassword(input.password, crypto.randomUUID());
  let primaryPersonId: string | null = null;

  if (input.personMode === "existing") {
    const existingPerson = await getPersonByIdGlobal(env.DB, input.existingPersonId!);

    if (!existingPerson) {
      throw new HttpError(404, "Обрану людину не знайдено");
    }

    if (input.person) {
      const duplicate = await findDuplicatePersonByIdentity(
        env.DB,
        {
          firstName: input.person.firstName,
          lastName: input.person.lastName,
          birthDate: input.person.birthDate,
        },
        existingPerson.id,
      );

      if (duplicate) {
        throw new HttpError(
          409,
          "Неможливо зберегти профіль: людина з таким ім’ям, прізвищем і датою народження вже існує.",
          {
            code: "person_duplicate",
            personId: duplicate.id,
            personName: formatDuplicatePersonName(duplicate),
          },
        );
      }
    }

    primaryPersonId = existingPerson.id;

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
      .bind(userId, input.email, passwordHash, primaryPersonId, timestamp, timestamp)
      .run();

    try {
      await grantPersonPermission(env.DB, userId, primaryPersonId, "owner");

      if (input.person) {
        try {
          await env.DB.prepare(
            `
              UPDATE global_persons
              SET
                first_name = ?,
                last_name = ?,
                middle_name = ?,
                maiden_name = ?,
                gender = ?,
                birth_date = ?,
                birth_place = ?,
                is_living = ?,
                updated_at = ?
              WHERE id = ?
            `,
          )
            .bind(
              input.person.firstName,
              input.person.lastName,
              input.person.middleName,
              input.person.maidenName,
              input.person.gender,
              input.person.birthDate,
              input.person.birthPlace,
              toDbBoolean(input.person.isLiving ?? null),
              timestamp,
              primaryPersonId,
            )
            .run();
        } catch (error) {
          if (isDuplicatePersonConstraintError(error)) {
            throw await buildDuplicatePersonHttpError(
              env.DB,
              {
                firstName: input.person.firstName,
                lastName: input.person.lastName,
                birthDate: input.person.birthDate,
              },
              "Неможливо зберегти профіль: людина з таким ім’ям, прізвищем і датою народження вже існує.",
              existingPerson.id,
            );
          }

          throw error;
        }
      }
    } catch (error) {
      await cleanupUserCreation(env.DB, userId);
      throw error;
    }
  } else {
    const primaryPerson = input.person!;
    const duplicate = await findDuplicatePersonByIdentity(env.DB, {
      firstName: primaryPerson.firstName,
      lastName: primaryPerson.lastName,
      birthDate: primaryPerson.birthDate,
    });

    if (duplicate) {
      throw new HttpError(
        409,
        "Неможливо створити профіль: людина з таким ім’ям, прізвищем і датою народження вже існує.",
        {
          code: "person_duplicate",
          personId: duplicate.id,
          personName: formatDuplicatePersonName(duplicate),
        },
      );
    }

    primaryPersonId = crypto.randomUUID();

    try {
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
          .bind(
            primaryPersonId,
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
            toDbBoolean(primaryPerson.isLiving ?? null),
            null,
            timestamp,
            timestamp,
          ),
        env.DB.prepare(
          `
            INSERT INTO person_permissions (user_id, person_id, role, created_at)
            VALUES (?, ?, 'owner', ?)
          `,
        ).bind(userId, primaryPersonId, timestamp),
      ]);
    } catch (error) {
      await cleanupUserCreation(env.DB, userId);

      if (isDuplicatePersonConstraintError(error)) {
        throw await buildDuplicatePersonHttpError(
          env.DB,
          {
            firstName: primaryPerson.firstName,
            lastName: primaryPerson.lastName,
            birthDate: primaryPerson.birthDate,
          },
          "Неможливо створити профіль: людина з таким ім’ям, прізвищем і датою народження вже існує.",
        );
      }

      throw error;
    }
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
    db.prepare("DELETE FROM person_permissions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
}
