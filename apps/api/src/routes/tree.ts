import type { SessionUser, TreeResponse } from "@family-tree/shared";

import {
  getChildRelationshipsForParents,
  getParentRelationshipsForChildren,
  getPersonByIdGlobal,
  getPersonsByIds,
  getSpouseRelationshipsForPersons,
} from "../lib/db";
import { HttpError, json } from "../lib/http";
import type { Env } from "../types";

export async function getTree(
  url: URL,
  env: Env,
  currentUser: SessionUser,
  personId: string,
): Promise<Response> {
  const rootPerson = await getPersonByIdGlobal(env.DB, personId);

  if (!rootPerson) {
    throw new HttpError(404, "Людину не знайдено");
  }

  const upDepth = parseDepth(url.searchParams.get("up"));
  const downDepth = parseDepth(url.searchParams.get("down"));
  const personIds = new Set<string>([personId]);
  const relationshipMap = new Map<string, TreeResponse["relationships"][number]>();
  const rootParentIds = new Set<string>();
  const seenAncestorIds = new Set<string>([personId]);
  const seenDescendantIds = new Set<string>([personId]);

  let currentAncestorIds = [personId];

  for (let level = 0; upDepth === null || level < upDepth; level += 1) {
    const relationships = await getParentRelationshipsForChildren(env.DB, currentUser.id, currentAncestorIds);
    const nextAncestorIds = new Set<string>();

    for (const relationship of relationships) {
      relationshipMap.set(relationship.id, relationship);
      personIds.add(relationship.person1Id);
      personIds.add(relationship.person2Id);

      if (!seenAncestorIds.has(relationship.person1Id)) {
        seenAncestorIds.add(relationship.person1Id);
        nextAncestorIds.add(relationship.person1Id);
      }

      if (level === 0) {
        rootParentIds.add(relationship.person1Id);
      }
    }

    if (nextAncestorIds.size === 0) {
      break;
    }

    currentAncestorIds = [...nextAncestorIds];
  }

  if (rootParentIds.size > 0) {
    const siblingRelationships = await getChildRelationshipsForParents(env.DB, currentUser.id, [...rootParentIds]);

    for (const relationship of siblingRelationships) {
      relationshipMap.set(relationship.id, relationship);
      personIds.add(relationship.person1Id);
      personIds.add(relationship.person2Id);
    }
  }

  let currentDescendantIds = [personId];

  for (let level = 0; downDepth === null || level < downDepth; level += 1) {
    const relationships = await getChildRelationshipsForParents(env.DB, currentUser.id, currentDescendantIds);
    const nextDescendantIds = new Set<string>();

    for (const relationship of relationships) {
      relationshipMap.set(relationship.id, relationship);
      personIds.add(relationship.person1Id);
      personIds.add(relationship.person2Id);

      if (!seenDescendantIds.has(relationship.person2Id)) {
        seenDescendantIds.add(relationship.person2Id);
        nextDescendantIds.add(relationship.person2Id);
      }
    }

    if (nextDescendantIds.size === 0) {
      break;
    }

    currentDescendantIds = [...nextDescendantIds];
  }

  const spouseRelationships = await getSpouseRelationshipsForPersons(env.DB, currentUser.id, [...personIds]);

  for (const relationship of spouseRelationships) {
    relationshipMap.set(relationship.id, relationship);
    personIds.add(relationship.person1Id);
    personIds.add(relationship.person2Id);
  }

  const persons = await getPersonsByIds(env.DB, currentUser.id, [...personIds]);
  const response: TreeResponse = {
    rootPersonId: personId,
    persons,
    relationships: [...relationshipMap.values()],
  };

  return json(response);
}

function parseDepth(value: string | null): number | null {
  if (!value) {
    return 4;
  }

  if (value === "all") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, "Параметри up і down мають бути цілими числами, не меншими за 0, або значенням all");
  }

  return parsed;
}
