import type { CreatePersonDto, DuplicatePersonCheckResponse, SessionUser, UpdatePersonDto } from "@family-tree/shared";

import {
  canEditPerson,
  countOtherPersonPermissions,
  findDuplicatePersonByIdentity,
  getPersonById,
  getPersonByIdGlobal,
  grantPersonPermission,
  isUserAdmin,
  listPersons,
} from "../lib/db";
import { HttpError, json, noContent, readJson } from "../lib/http";
import { normalizeCreatePersonDto, normalizeUpdatePersonDto, toDbBoolean } from "../lib/normalize";
import {
  buildDuplicatePersonHttpError,
  formatDuplicatePersonName,
  isDuplicatePersonConstraintError,
} from "../lib/person-duplicates";
import type { Env } from "../types";

export async function getPersons(env: Env, currentUser: SessionUser): Promise<Response> {
  const persons = await listPersons(env.DB, currentUser.id);
  return json(persons);
}

export async function checkDuplicatePerson(url: URL, env: Env): Promise<Response> {
  const firstName = url.searchParams.get("firstName")?.trim() ?? "";
  const lastName = url.searchParams.get("lastName")?.trim() ?? "";
  const birthDate = url.searchParams.get("birthDate")?.trim() ?? "";
  const ignorePersonId = url.searchParams.get("ignorePersonId")?.trim() || undefined;

  if (!firstName || !lastName || !birthDate) {
    return json({ duplicate: null } satisfies DuplicatePersonCheckResponse);
  }

  const duplicate = await findDuplicatePersonByIdentity(
    env.DB,
    {
      firstName,
      lastName,
      birthDate,
    },
    ignorePersonId,
  );

  const response: DuplicatePersonCheckResponse = {
    duplicate: duplicate
      ? {
          personId: duplicate.id,
          personName: formatDuplicatePersonName(duplicate),
        }
      : null,
  };

  return json(response);
}

export async function getPerson(env: Env, currentUser: SessionUser, personId: string): Promise<Response> {
  const person = await getPersonById(env.DB, currentUser.id, personId);

  if (!person) {
    throw new HttpError(404, "Людину не знайдено");
  }

  return json(person);
}

export async function getDirectoryPerson(
  env: Env,
  currentUser: SessionUser,
  personId: string,
): Promise<Response> {
  return getPerson(env, currentUser, personId);
}

export async function importDirectoryPerson(
  env: Env,
  currentUser: SessionUser,
  sourcePersonId: string,
): Promise<Response> {
  const person = await getPersonById(env.DB, currentUser.id, sourcePersonId);

  if (!person) {
    throw new HttpError(404, "Людину не знайдено");
  }

  return json(person, { status: 200 });
}

export async function createPerson(request: Request, env: Env, currentUser: SessionUser): Promise<Response> {
  const input = normalizeCreatePersonDto(await readJson<CreatePersonDto>(request));
  const duplicate = await findDuplicatePersonByIdentity(env.DB, {
    firstName: input.firstName,
    lastName: input.lastName,
    birthDate: input.birthDate,
  });

  if (duplicate) {
    throw new HttpError(
      409,
      "Неможливо створити людину: профіль з таким ім’ям, прізвищем і датою народження вже існує.",
      {
        code: "person_duplicate",
        personId: duplicate.id,
        personName: formatDuplicatePersonName(duplicate),
      },
    );
  }

  const personId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  try {
    await env.DB.prepare(
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
  } catch (error) {
    if (isDuplicatePersonConstraintError(error)) {
      throw await buildDuplicatePersonHttpError(
        env.DB,
        {
          firstName: input.firstName,
          lastName: input.lastName,
          birthDate: input.birthDate,
        },
        "Неможливо створити людину: профіль з таким ім’ям, прізвищем і датою народження вже існує.",
      );
    }

    throw error;
  }

  await grantPersonPermission(env.DB, currentUser.id, personId, "owner");

  const person = await getPersonById(env.DB, currentUser.id, personId);

  if (!person) {
    throw new HttpError(500, "Не вдалося створити людину");
  }

  return json(person, { status: 201 });
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

  if (!(await canEditPerson(env.DB, currentUser.id, personId))) {
    throw new HttpError(403, "У вас немає прав на редагування цього профілю");
  }

  const input = normalizeUpdatePersonDto(await readJson<UpdatePersonDto>(request));
  const duplicate = await findDuplicatePersonByIdentity(
    env.DB,
    {
      firstName: input.firstName ?? existing.firstName,
      lastName: input.lastName ?? existing.lastName,
      birthDate: input.birthDate ?? existing.birthDate,
    },
    existing.id,
  );

  if (duplicate) {
    throw new HttpError(
      409,
      "Неможливо зберегти зміни: профіль з таким ім’ям, прізвищем і датою народження вже існує.",
      {
        code: "person_duplicate",
        personId: duplicate.id,
          personName: formatDuplicatePersonName(duplicate),
      },
    );
  }

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

  try {
    await env.DB
      .prepare(`UPDATE global_persons SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...values, personId)
      .run();
  } catch (error) {
    if (isDuplicatePersonConstraintError(error)) {
      throw await buildDuplicatePersonHttpError(
        env.DB,
        {
          firstName: input.firstName ?? existing.firstName,
          lastName: input.lastName ?? existing.lastName,
          birthDate: input.birthDate ?? existing.birthDate,
        },
        "Неможливо зберегти зміни: профіль з таким ім’ям, прізвищем і датою народження вже існує.",
        existing.id,
      );
    }

    throw error;
  }

  const person = await getPersonById(env.DB, currentUser.id, personId);

  if (!person) {
    throw new HttpError(500, "Не вдалося оновити людину");
  }

  return json(person);
}

export async function deletePerson(env: Env, currentUser: SessionUser, personId: string): Promise<Response> {
  const existing = await getPersonByIdGlobal(env.DB, personId);

  if (!existing) {
    throw new HttpError(404, "Людину не знайдено");
  }

  if (!(await canEditPerson(env.DB, currentUser.id, personId))) {
    throw new HttpError(403, "У вас немає прав на видалення цього профілю");
  }

  if (currentUser.primaryPersonId === personId) {
    throw new HttpError(400, "Не можна видалити власний профіль");
  }

  const currentUserIsAdmin = await isUserAdmin(env.DB, currentUser.id);

  if (!currentUserIsAdmin && (await countOtherPersonPermissions(env.DB, personId, currentUser.id)) > 0) {
    throw new HttpError(409, "Не можна видалити спільний профіль, який уже використовується іншими акаунтами");
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE users SET primary_person_id = NULL WHERE primary_person_id = ?").bind(personId),
    env.DB.prepare("DELETE FROM global_relationships WHERE person1_id = ? OR person2_id = ?").bind(personId, personId),
    env.DB.prepare("DELETE FROM person_permissions WHERE person_id = ?").bind(personId),
    env.DB.prepare("DELETE FROM global_persons WHERE id = ?").bind(personId),
  ]);

  return noContent();
}
