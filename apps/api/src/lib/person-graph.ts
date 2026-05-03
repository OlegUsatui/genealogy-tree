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

const D1_MAX_BOUND_PARAMETERS = 100;

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

export async function syncRelationshipAcrossAccounts(
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
  const sourcePerson1 = await getPersonRowByUserAndId(db, input.userId, input.person1Id);
  const sourcePerson2 = await getPersonRowByUserAndId(db, input.userId, input.person2Id);

  if (!sourcePerson1 || !sourcePerson2) {
    throw new HttpError(404, "Одну або кілька людей не знайдено");
  }

  const canonicalPerson1 = (await getCanonicalPersonRowByAnyId(db, sourcePerson1.id)) ?? sourcePerson1;
  const canonicalPerson2 = (await getCanonicalPersonRowByAnyId(db, sourcePerson2.id)) ?? sourcePerson2;
  const affectedUserIds = await listAffectedUserIdsByCanonicalIds(db, [
    getCanonicalPersonId(canonicalPerson1),
    getCanonicalPersonId(canonicalPerson2),
  ]);

  if (!affectedUserIds.includes(input.userId)) {
    affectedUserIds.push(input.userId);
  }

  let currentUserRelationship: Relationship | null = null;

  for (const targetUserId of affectedUserIds) {
    const targetPerson1 =
      targetUserId === input.userId
        ? sourcePerson1
        : await ensureCanonicalPersonAvailableInUser(db, canonicalPerson1, targetUserId);
    const targetPerson2 =
      targetUserId === input.userId
        ? sourcePerson2
        : await ensureCanonicalPersonAvailableInUser(db, canonicalPerson2, targetUserId);

    if (!targetPerson1 || !targetPerson2 || targetPerson1.id === targetPerson2.id) {
      continue;
    }

    const relationship = await createRelationshipForUser(db, {
      userId: targetUserId,
      type: input.type,
      person1Id: targetPerson1.id,
      person2Id: targetPerson2.id,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      notes: input.notes ?? null,
    });

    if (targetUserId === input.userId) {
      currentUserRelationship = relationship;
    }
  }

  if (!currentUserRelationship) {
    throw new HttpError(500, "Не вдалося створити зв’язок");
  }

  return currentUserRelationship;
}

export async function replaceRelationshipAcrossAccounts(
  db: D1Database,
  input: {
    userId: string;
    relationshipId: string;
    type: RelationshipType;
    person1Id: string;
    person2Id: string;
    startDate?: string | null;
    endDate?: string | null;
    notes?: string | null;
  },
): Promise<Relationship> {
  const existingRelationship = await getRelationshipRowByUserAndId(db, input.userId, input.relationshipId);

  if (!existingRelationship) {
    throw new HttpError(404, "Зв’язок не знайдено");
  }

  const sourcePerson1 = await getPersonRowByUserAndId(db, input.userId, input.person1Id);
  const sourcePerson2 = await getPersonRowByUserAndId(db, input.userId, input.person2Id);

  if (!sourcePerson1 || !sourcePerson2) {
    throw new HttpError(404, "Одну або кілька людей не знайдено");
  }

  const existingPerson1 = await getPersonRowByUserAndId(db, input.userId, existingRelationship.person1_id);
  const existingPerson2 = await getPersonRowByUserAndId(db, input.userId, existingRelationship.person2_id);
  const canonicalIds = [
    getCanonicalPersonId((await getCanonicalPersonRowByAnyId(db, sourcePerson1.id)) ?? sourcePerson1),
    getCanonicalPersonId((await getCanonicalPersonRowByAnyId(db, sourcePerson2.id)) ?? sourcePerson2),
  ];

  if (existingPerson1) {
    canonicalIds.push(getCanonicalPersonId((await getCanonicalPersonRowByAnyId(db, existingPerson1.id)) ?? existingPerson1));
  }

  if (existingPerson2) {
    canonicalIds.push(getCanonicalPersonId((await getCanonicalPersonRowByAnyId(db, existingPerson2.id)) ?? existingPerson2));
  }

  const affectedUserIds = await listAffectedUserIdsByCanonicalIds(db, canonicalIds);

  if (!affectedUserIds.includes(input.userId)) {
    affectedUserIds.push(input.userId);
  }

  let currentUserRelationship: Relationship | null = null;

  for (const targetUserId of affectedUserIds) {
    const targetPerson1 = await ensureCanonicalPersonAvailableInUser(
      db,
      (await getCanonicalPersonRowByAnyId(db, sourcePerson1.id)) ?? sourcePerson1,
      targetUserId,
    );
    const targetPerson2 = await ensureCanonicalPersonAvailableInUser(
      db,
      (await getCanonicalPersonRowByAnyId(db, sourcePerson2.id)) ?? sourcePerson2,
      targetUserId,
    );

    if (!targetPerson1 || !targetPerson2 || targetPerson1.id === targetPerson2.id) {
      continue;
    }

    await deleteRelationshipsBetweenPersonsForUser(db, targetUserId, targetPerson1.id, targetPerson2.id);

    const relationship = await createRelationshipForUser(db, {
      userId: targetUserId,
      type: input.type,
      person1Id: targetPerson1.id,
      person2Id: targetPerson2.id,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      notes: input.notes ?? null,
    });

    if (targetUserId === input.userId) {
      currentUserRelationship = relationship;
    }
  }

  if (!currentUserRelationship) {
    throw new HttpError(500, "Не вдалося оновити зв’язок");
  }

  return currentUserRelationship;
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

async function getPersonRowByUserAndId(
  db: D1Database,
  userId: string,
  personId: string,
): Promise<PersonRow | null> {
  return db.prepare("SELECT * FROM persons WHERE user_id = ? AND id = ?").bind(userId, personId).first<PersonRow>();
}

async function getRelationshipRowByUserAndId(
  db: D1Database,
  userId: string,
  relationshipId: string,
): Promise<RelationshipRow | null> {
  return db
    .prepare("SELECT * FROM relationships WHERE user_id = ? AND id = ?")
    .bind(userId, relationshipId)
    .first<RelationshipRow>();
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

async function listAffectedUserIdsByCanonicalIds(db: D1Database, canonicalIds: string[]): Promise<string[]> {
  const uniqueCanonicalIds = [...new Set(canonicalIds)];

  if (uniqueCanonicalIds.length === 0) {
    return [];
  }

  const userIds = new Set<string>();

  for (const idsChunk of chunkByD1Limit(uniqueCanonicalIds, 2)) {
    const placeholders = createPlaceholders(idsChunk.length);
    const result = await db
      .prepare(
        `
          SELECT DISTINCT user_id
          FROM persons
          WHERE id IN (${placeholders})
            OR source_person_id IN (${placeholders})
          ORDER BY user_id
        `,
      )
      .bind(...idsChunk, ...idsChunk)
      .all<{ user_id: string }>();

    for (const row of result.results) {
      userIds.add(row.user_id);
    }
  }

  return [...userIds].sort((left, right) => left.localeCompare(right));
}

async function ensureCanonicalPersonAvailableInUser(
  db: D1Database,
  canonicalPerson: PersonRow,
  targetUserId: string,
): Promise<PersonRow | null> {
  const canonicalId = getCanonicalPersonId(canonicalPerson);
  let localPerson = await findLocalPersonRowByCanonicalId(db, targetUserId, canonicalId);

  if (localPerson) {
    return localPerson;
  }

  if (canonicalPerson.user_id === targetUserId) {
    return canonicalPerson;
  }

  return createImportedPerson(db, targetUserId, canonicalId, canonicalPerson);
}

async function findLocalPersonRowByCanonicalId(
  db: D1Database,
  userId: string,
  canonicalId: string,
): Promise<PersonRow | null> {
  return db
    .prepare(
      `
        SELECT *
        FROM persons
        WHERE user_id = ?
          AND (id = ? OR source_person_id = ?)
        ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, created_at
        LIMIT 1
      `,
    )
    .bind(userId, canonicalId, canonicalId, canonicalId)
    .first<PersonRow>();
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

async function deleteRelationshipsBetweenPersonsForUser(
  db: D1Database,
  userId: string,
  person1Id: string,
  person2Id: string,
): Promise<void> {
  await db
    .prepare(
      `
        DELETE FROM relationships
        WHERE user_id = ?
          AND (
            (
              type = 'spouse'
              AND (
                (person1_id = ? AND person2_id = ?)
                OR (person1_id = ? AND person2_id = ?)
              )
            )
            OR (
              type = 'parent_child'
              AND (
                (person1_id = ? AND person2_id = ?)
                OR (person1_id = ? AND person2_id = ?)
              )
            )
          )
      `,
    )
    .bind(userId, person1Id, person2Id, person2Id, person1Id, person1Id, person2Id, person2Id, person1Id)
    .run();
}

function getCanonicalPersonId(person: Pick<PersonRow, "id" | "source_person_id">): string {
  return person.source_person_id ?? person.id;
}

function createPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function chunkByD1Limit<T>(values: T[], repeatedLists = 1, reservedBindings = 0): T[][] {
  const maxChunkSize = Math.floor((D1_MAX_BOUND_PARAMETERS - reservedBindings) / repeatedLists);

  if (maxChunkSize < 1) {
    throw new Error("Неможливо підібрати chunk size під ліміт D1 bound parameters.");
  }

  return chunkArray(values, maxChunkSize);
}

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
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
