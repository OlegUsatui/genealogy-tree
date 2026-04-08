import type { SessionUser } from "@family-tree/shared";

import { getConnectedFamilyGraph, getPersonByIdGlobal } from "../lib/db";
import { HttpError, json } from "../lib/http";
import type { Env } from "../types";

export async function getFamilyGraph(
  env: Env,
  currentUser: SessionUser,
  personId: string,
): Promise<Response> {
  const person = await getPersonByIdGlobal(env.DB, personId);

  if (!person) {
    throw new HttpError(404, "Людину не знайдено");
  }

  return json(await getConnectedFamilyGraph(env.DB, currentUser.id, personId));
}
