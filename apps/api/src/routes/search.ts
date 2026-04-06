import { mapPersonRow } from "../lib/db";
import { HttpError, json } from "../lib/http";
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

export async function searchPersons(url: URL, env: Env): Promise<Response> {
  const query = url.searchParams.get("q")?.trim();

  if (!query) {
    throw new HttpError(400, "q query parameter is required");
  }

  const searchTerm = `%${query}%`;
  const result = await env.DB
    .prepare(
      `
        SELECT *
        FROM persons
        WHERE first_name LIKE ?
           OR last_name LIKE ?
        ORDER BY COALESCE(last_name, ''), first_name
        LIMIT 20
      `,
    )
    .bind(searchTerm, searchTerm)
    .all<PersonRow>();

  return json(result.results.map(mapPersonRow));
}

