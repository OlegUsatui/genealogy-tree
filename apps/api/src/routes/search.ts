import type { PersonSearchCandidate, RegistrationPersonCandidate, SessionUser } from "@family-tree/shared";

import { HttpError, json } from "../lib/http";
import type { Env } from "../types";

export async function searchPersons(url: URL, env: Env, currentUser: SessionUser): Promise<Response> {
  const query = url.searchParams.get("q")?.trim();

  if (!query) {
    throw new HttpError(400, "Параметр q є обов’язковим");
  }

  if (query.length < 3) {
    throw new HttpError(400, "Для пошуку введіть щонайменше 3 символи");
  }

  void currentUser;

  return json(await queryGlobalPersonCandidates(env, query, 20));
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

  if (query.length < 3) {
    throw new HttpError(400, "Для пошуку введіть щонайменше 3 символи");
  }

  return json(await queryGlobalPersonCandidates(env, query, 20));
}

async function queryGlobalPersonCandidates(
  env: Env,
  query: string,
  limit: number,
): Promise<PersonSearchCandidate[]> {
  const result = await env.DB.prepare(
    `
      SELECT
        COALESCE(source_person_id, id) AS source_person_id,
        first_name,
        last_name,
        middle_name,
        maiden_name,
        gender,
        birth_date,
        birth_place,
        is_living
      FROM persons
      ORDER BY COALESCE(last_name, ''), first_name, birth_date, id
    `,
  )
    .bind()
    .all<RegistrationCandidateRow>();

  const normalizedQuery = normalizeSearchValue(query);
  const candidates = new Map<string, RegistrationPersonCandidate>();

  for (const row of result.results) {
    if (!matchesSearchQuery(row, normalizedQuery)) {
      continue;
    }

    const candidate = mapRegistrationCandidateRow(row);
    const candidateKey = createCandidateKey(row);

    if (!candidates.has(candidateKey)) {
      candidates.set(candidateKey, candidate);
    }

    if (candidates.size >= limit) {
      break;
    }
  }

  return [...candidates.values()];
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

function matchesSearchQuery(row: RegistrationCandidateRow, normalizedQuery: string): boolean {
  return [row.first_name, row.last_name, row.middle_name, row.maiden_name]
    .some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("uk-UA");
}

function createCandidateKey(row: RegistrationCandidateRow): string {
  return [
    row.first_name,
    row.last_name ?? "",
    row.middle_name ?? "",
    row.maiden_name ?? "",
    row.gender,
    row.birth_date ?? "",
    row.birth_place ?? "",
    row.is_living === null ? "" : String(row.is_living),
  ].join("\u0000");
}
