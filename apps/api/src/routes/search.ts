import type { RegistrationPersonCandidate, SessionUser } from "@family-tree/shared";

import { mapPersonRow } from "../lib/db";
import { HttpError, json } from "../lib/http";
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

export async function searchPersons(url: URL, env: Env, currentUser: SessionUser): Promise<Response> {
  const query = url.searchParams.get("q")?.trim();

  if (!query) {
    throw new HttpError(400, "Параметр q є обов’язковим");
  }

  const searchTerm = `%${query}%`;
  const result = await env.DB
    .prepare(
      `
        SELECT *
        FROM persons
        WHERE user_id = ?
          AND (
            first_name LIKE ?
            OR last_name LIKE ?
          )
        ORDER BY COALESCE(last_name, ''), first_name
        LIMIT 20
      `,
    )
    .bind(currentUser.id, searchTerm, searchTerm)
    .all<PersonRow>();

  return json(result.results.map(mapPersonRow));
}

type RegistrationCandidateRow = {
  source_person_id: string;
  first_name: string;
  last_name: string | null;
  middle_name: string | null;
  maiden_name: string | null;
  gender: "male" | "female" | "other" | "unknown";
  birth_date: string | null;
  birth_place: string | null;
  is_living: number | null;
};

export async function searchRegistrationPersons(url: URL, env: Env): Promise<Response> {
  const query = url.searchParams.get("q")?.trim();

  if (!query) {
    throw new HttpError(400, "Параметр q є обов’язковим");
  }

  if (query.length < 2) {
    throw new HttpError(400, "Для пошуку введіть щонайменше 2 символи");
  }

  const searchTerm = `%${query}%`;
  const result = await env.DB.prepare(
    `
      SELECT
        MIN(id) AS source_person_id,
        first_name,
        last_name,
        middle_name,
        maiden_name,
        gender,
        birth_date,
        birth_place,
        is_living
      FROM persons
      WHERE
        first_name LIKE ?
        OR last_name LIKE ?
        OR middle_name LIKE ?
        OR maiden_name LIKE ?
      GROUP BY
        first_name,
        last_name,
        middle_name,
        maiden_name,
        gender,
        birth_date,
        birth_place,
        is_living
      ORDER BY COALESCE(last_name, ''), first_name, birth_date
      LIMIT 20
    `,
  )
    .bind(searchTerm, searchTerm, searchTerm, searchTerm)
    .all<RegistrationCandidateRow>();

  return json(result.results.map(mapRegistrationCandidateRow));
}

function mapRegistrationCandidateRow(row: RegistrationCandidateRow): RegistrationPersonCandidate {
  return {
    sourcePersonId: row.source_person_id,
    firstName: row.first_name,
    lastName: row.last_name,
    middleName: row.middle_name,
    maidenName: row.maiden_name,
    gender: row.gender,
    birthDate: row.birth_date,
    birthPlace: row.birth_place,
    isLiving: row.is_living === null ? null : row.is_living === 1,
  };
}
