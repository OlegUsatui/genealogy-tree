import type { TreeResponse } from "@family-tree/shared";

import {
  getChildRelationshipsForParents,
  getParentRelationshipsForChildren,
  getPersonById,
  getPersonsByIds,
  getSpouseRelationshipsForPersons,
} from "../lib/db";
import { HttpError, json } from "../lib/http";
import type { Env } from "../types";

export async function getTree(url: URL, env: Env, personId: string): Promise<Response> {
  const rootPerson = await getPersonById(env.DB, personId);

  if (!rootPerson) {
    throw new HttpError(404, "Person not found");
  }

  const upDepth = clampDepth(url.searchParams.get("up"));
  const downDepth = clampDepth(url.searchParams.get("down"));
  const personIds = new Set<string>([personId]);
  const relationshipMap = new Map<string, TreeResponse["relationships"][number]>();

  let currentAncestorIds = [personId];

  for (let level = 0; level < upDepth; level += 1) {
    const relationships = await getParentRelationshipsForChildren(env.DB, currentAncestorIds);
    const nextAncestorIds = new Set<string>();

    for (const relationship of relationships) {
      relationshipMap.set(relationship.id, relationship);
      personIds.add(relationship.person1Id);
      personIds.add(relationship.person2Id);
      nextAncestorIds.add(relationship.person1Id);
    }

    currentAncestorIds = [...nextAncestorIds];
  }

  let currentDescendantIds = [personId];

  for (let level = 0; level < downDepth; level += 1) {
    const relationships = await getChildRelationshipsForParents(env.DB, currentDescendantIds);
    const nextDescendantIds = new Set<string>();

    for (const relationship of relationships) {
      relationshipMap.set(relationship.id, relationship);
      personIds.add(relationship.person1Id);
      personIds.add(relationship.person2Id);
      nextDescendantIds.add(relationship.person2Id);
    }

    currentDescendantIds = [...nextDescendantIds];
  }

  const spouseRelationships = await getSpouseRelationshipsForPersons(env.DB, [...personIds]);

  for (const relationship of spouseRelationships) {
    relationshipMap.set(relationship.id, relationship);
    personIds.add(relationship.person1Id);
    personIds.add(relationship.person2Id);
  }

  const persons = await getPersonsByIds(env.DB, [...personIds]);
  const response: TreeResponse = {
    rootPersonId: personId,
    persons,
    relationships: [...relationshipMap.values()],
  };

  return json(response);
}

function clampDepth(value: string | null): number {
  if (!value) {
    return 2;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, "up and down must be integers greater than or equal to 0");
  }

  return Math.min(parsed, 5);
}

