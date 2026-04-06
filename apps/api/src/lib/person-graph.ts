import type { Person, Relationship, RelationshipType } from "@family-tree/shared";

import { HttpError } from "./http";
import { mapPersonRow, mapRelationshipRow } from "./db";
import type { DbNullable } from "../types";

type PersonRow = {
  id: string;
  user_id: string;
  source_person_id: DbNullable<string>;
  first_name: string;
  last_name: DbNullable<string>;
  middle_name: DbNullable<string>;
  maiden_name: DbNullable<string>;
  gender: Person["gender"];
  birth_date: DbNullable<string>;
  death_date: DbNullable<string>;
  birth_place: DbNullable<string>;
  death_place: DbNullable<string>;
  biography: DbNullable<string>;
  is_living: DbNullable<number>;
  photo_url: DbNullable<string>;
  created_at: string;
  updated_at: string;
};

type RelationshipRow = {
  id: string;
  user_id: string;
  type: Relationship["type"];
  person1_id: string;
  person2_id: string;
  start_date: DbNullable<string>;
  end_date: DbNullable<string>;
  notes: DbNullable<string>;
  created_at: string;
};

export async function getCanonicalPersonRowByAnyId(
  db: D1Database,
  personId: string,
): Promise<PersonRow | null> {
  const row = await db.prepare("SELECT * FROM persons WHERE id = ?").bind(personId).first<PersonRow>();

  if (!row) {
    return null;
  }

  const canonicalId = getCanonicalPersonId(row);

  if (canonicalId === row.id) {
    return row;
  }

  const canonicalRow = await db.prepare("SELECT * FROM persons WHERE id = ?").bind(canonicalId).first<PersonRow>();
  return canonicalRow ?? row;
}

export async function ensurePersonGraphImported(
  db: D1Database,
  sourceUserId: string,
  rootPersonId: string,
  targetUserId: string,
): Promise<Person> {
  const sourcePersons = await listPersonRowsByUser(db, sourceUserId);
  const sourcePersonMap = new Map(sourcePersons.map((person) => [person.id, person] as const));
  const rootPerson = sourcePersonMap.get(rootPersonId);

  if (!rootPerson) {
    throw new HttpError(404, "Людину не знайдено");
  }

  const sourceRelationships = await listRelationshipRowsByUser(db, sourceUserId);
  const connectedPersonIds = collectConnectedPersonIds(rootPersonId, sourceRelationships);
  const targetPersons = await listPersonRowsByUser(db, targetUserId);
  const targetByCanonicalId = new Map<string, PersonRow>();

  for (const person of targetPersons) {
    const canonicalId = getCanonicalPersonId(person);

    if (!targetByCanonicalId.has(canonicalId)) {
      targetByCanonicalId.set(canonicalId, person);
    }
  }

  const sourceIdsInOrder = orderConnectedPersonIds(rootPersonId, connectedPersonIds, sourceRelationships);
  const mappedPersonIds = new Map<string, string>();

  for (const sourcePersonId of sourceIdsInOrder) {
    const sourcePerson = sourcePersonMap.get(sourcePersonId);

    if (!sourcePerson) {
      continue;
    }

    const canonicalId = getCanonicalPersonId(sourcePerson);
    let targetPerson = targetByCanonicalId.get(canonicalId);

    if (!targetPerson) {
      targetPerson = await createImportedPerson(db, targetUserId, canonicalId, sourcePerson);
      targetByCanonicalId.set(canonicalId, targetPerson);
    }

    mappedPersonIds.set(sourcePersonId, targetPerson.id);
  }

  for (const relationship of sourceRelationships) {
    if (!connectedPersonIds.has(relationship.person1_id) || !connectedPersonIds.has(relationship.person2_id)) {
      continue;
    }

    const mappedPerson1Id = mappedPersonIds.get(relationship.person1_id);
    const mappedPerson2Id = mappedPersonIds.get(relationship.person2_id);

    if (!mappedPerson1Id || !mappedPerson2Id || mappedPerson1Id === mappedPerson2Id) {
      continue;
    }

    const existingRelationship = await findExistingRelationship(
      db,
      targetUserId,
      relationship.type,
      mappedPerson1Id,
      mappedPerson2Id,
    );

    if (!existingRelationship) {
      await createRelationshipRow(db, {
        userId: targetUserId,
        type: relationship.type,
        person1Id: mappedPerson1Id,
        person2Id: mappedPerson2Id,
        startDate: relationship.start_date,
        endDate: relationship.end_date,
        notes: relationship.notes,
      });
    }
  }

  const importedRootPersonId = mappedPersonIds.get(rootPersonId);

  if (!importedRootPersonId) {
    throw new HttpError(500, "Не вдалося підготувати людину для зв’язку");
  }

  const importedRootPerson = targetByCanonicalId.get(getCanonicalPersonId(rootPerson));

  if (!importedRootPerson) {
    throw new HttpError(500, "Не вдалося підготувати людину для зв’язку");
  }

  return mapPersonRow(importedRootPerson);
}

export async function createRelationshipForUser(
  db: D1Database,
  input: {
    userId: string;
    type: RelationshipType;
    person1Id: string;
    person2Id: string;
    startDate?: string | null;
    endDate?: string | null;
    notes?: string | null;
  },
): Promise<Relationship> {
  const existingRelationship = await findExistingRelationship(
    db,
    input.userId,
    input.type,
    input.person1Id,
    input.person2Id,
  );

  if (existingRelationship) {
    return mapRelationshipRow(existingRelationship);
  }

  const row = await createRelationshipRow(db, input);
  return mapRelationshipRow(row);
}

async function createImportedPerson(
  db: D1Database,
  targetUserId: string,
  canonicalId: string,
  sourcePerson: PersonRow,
): Promise<PersonRow> {
  const personId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  await db.prepare(
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
      personId,
      targetUserId,
      canonicalId,
      sourcePerson.first_name,
      sourcePerson.last_name,
      sourcePerson.middle_name,
      sourcePerson.maiden_name,
      sourcePerson.gender,
      sourcePerson.birth_date,
      sourcePerson.death_date,
      sourcePerson.birth_place,
      sourcePerson.death_place,
      sourcePerson.biography,
      sourcePerson.is_living,
      sourcePerson.photo_url,
      timestamp,
      timestamp,
    )
    .run();

  const createdPerson = await db
    .prepare("SELECT * FROM persons WHERE user_id = ? AND id = ?")
    .bind(targetUserId, personId)
    .first<PersonRow>();

  if (!createdPerson) {
    throw new HttpError(500, "Не вдалося додати людину до дерева");
  }

  return createdPerson;
}

async function createRelationshipRow(
  db: D1Database,
  input: {
    userId: string;
    type: RelationshipType;
    person1Id: string;
    person2Id: string;
    startDate?: string | null;
    endDate?: string | null;
    notes?: string | null;
  },
): Promise<RelationshipRow> {
  const relationshipId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  await db.prepare(
    `
      INSERT INTO relationships (
        id,
        user_id,
        type,
        person1_id,
        person2_id,
        start_date,
        end_date,
        notes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      relationshipId,
      input.userId,
      input.type,
      input.person1Id,
      input.person2Id,
      input.startDate ?? null,
      input.endDate ?? null,
      input.notes ?? null,
      timestamp,
    )
    .run();

  const createdRelationship = await db
    .prepare("SELECT * FROM relationships WHERE user_id = ? AND id = ?")
    .bind(input.userId, relationshipId)
    .first<RelationshipRow>();

  if (!createdRelationship) {
    throw new HttpError(500, "Не вдалося створити зв’язок");
  }

  return createdRelationship;
}

async function listPersonRowsByUser(db: D1Database, userId: string): Promise<PersonRow[]> {
  const result = await db
    .prepare("SELECT * FROM persons WHERE user_id = ? ORDER BY created_at")
    .bind(userId)
    .all<PersonRow>();

  return result.results;
}

async function listRelationshipRowsByUser(db: D1Database, userId: string): Promise<RelationshipRow[]> {
  const result = await db
    .prepare("SELECT * FROM relationships WHERE user_id = ? ORDER BY created_at")
    .bind(userId)
    .all<RelationshipRow>();

  return result.results;
}

async function findExistingRelationship(
  db: D1Database,
  userId: string,
  type: RelationshipType,
  person1Id: string,
  person2Id: string,
): Promise<RelationshipRow | null> {
  if (type === "spouse") {
    return db
      .prepare(
        `
          SELECT *
          FROM relationships
          WHERE user_id = ?
            AND type = 'spouse'
            AND (
              (person1_id = ? AND person2_id = ?)
              OR (person1_id = ? AND person2_id = ?)
            )
          LIMIT 1
        `,
      )
      .bind(userId, person1Id, person2Id, person2Id, person1Id)
      .first<RelationshipRow>();
  }

  return db
    .prepare(
      `
        SELECT *
        FROM relationships
        WHERE user_id = ?
          AND type = 'parent_child'
          AND person1_id = ?
          AND person2_id = ?
        LIMIT 1
      `,
    )
    .bind(userId, person1Id, person2Id)
    .first<RelationshipRow>();
}

function getCanonicalPersonId(person: Pick<PersonRow, "id" | "source_person_id">): string {
  return person.source_person_id ?? person.id;
}

function collectConnectedPersonIds(rootPersonId: string, relationships: RelationshipRow[]): Set<string> {
  const adjacency = new Map<string, Set<string>>();

  for (const relationship of relationships) {
    addAdjacency(adjacency, relationship.person1_id, relationship.person2_id);
    addAdjacency(adjacency, relationship.person2_id, relationship.person1_id);
  }

  const visited = new Set<string>();
  const queue = [rootPersonId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    if (visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);

    for (const relatedId of adjacency.get(currentId) ?? []) {
      if (!visited.has(relatedId)) {
        queue.push(relatedId);
      }
    }
  }

  return visited;
}

function orderConnectedPersonIds(
  rootPersonId: string,
  connectedPersonIds: Set<string>,
  relationships: RelationshipRow[],
): string[] {
  const adjacency = new Map<string, Set<string>>();

  for (const relationship of relationships) {
    if (!connectedPersonIds.has(relationship.person1_id) || !connectedPersonIds.has(relationship.person2_id)) {
      continue;
    }

    addAdjacency(adjacency, relationship.person1_id, relationship.person2_id);
    addAdjacency(adjacency, relationship.person2_id, relationship.person1_id);
  }

  const visited = new Set<string>();
  const orderedIds: string[] = [];
  const queue = [rootPersonId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    if (visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    orderedIds.push(currentId);

    const neighbors = [...(adjacency.get(currentId) ?? [])].sort();

    for (const neighborId of neighbors) {
      if (!visited.has(neighborId)) {
        queue.push(neighborId);
      }
    }
  }

  return orderedIds;
}

function addAdjacency(adjacency: Map<string, Set<string>>, sourceId: string, targetId: string): void {
  const values = adjacency.get(sourceId) ?? new Set<string>();
  values.add(targetId);
  adjacency.set(sourceId, values);
}
