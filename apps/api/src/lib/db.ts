import type { Person, Relationship } from "@family-tree/shared";

import type { DbNullable } from "../types";

type PersonRow = {
  id: string;
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
  type: Relationship["type"];
  person1_id: string;
  person2_id: string;
  start_date: DbNullable<string>;
  end_date: DbNullable<string>;
  notes: DbNullable<string>;
  created_at: string;
};

export function mapPersonRow(row: PersonRow): Person {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    middleName: row.middle_name,
    maidenName: row.maiden_name,
    gender: row.gender,
    birthDate: row.birth_date,
    deathDate: row.death_date,
    birthPlace: row.birth_place,
    deathPlace: row.death_place,
    biography: row.biography,
    isLiving: row.is_living === null ? null : row.is_living === 1,
    photoUrl: row.photo_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRelationshipRow(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    type: row.type,
    person1Id: row.person1_id,
    person2Id: row.person2_id,
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function getPersonById(db: D1Database, personId: string): Promise<Person | null> {
  const row = await db.prepare("SELECT * FROM persons WHERE id = ?").bind(personId).first<PersonRow>();
  return row ? mapPersonRow(row) : null;
}

export async function listPersons(db: D1Database): Promise<Person[]> {
  const result = await db
    .prepare("SELECT * FROM persons ORDER BY COALESCE(last_name, ''), first_name, created_at")
    .all<PersonRow>();
  return result.results.map(mapPersonRow);
}

export async function getPersonsByIds(db: D1Database, personIds: string[]): Promise<Person[]> {
  if (personIds.length === 0) {
    return [];
  }

  const placeholders = createPlaceholders(personIds.length);
  const result = await db
    .prepare(`SELECT * FROM persons WHERE id IN (${placeholders}) ORDER BY COALESCE(last_name, ''), first_name`)
    .bind(...personIds)
    .all<PersonRow>();

  return result.results.map(mapPersonRow);
}

export async function listRelationshipsByPersonId(
  db: D1Database,
  personId: string,
): Promise<Relationship[]> {
  const result = await db
    .prepare(
      `
        SELECT *
        FROM relationships
        WHERE person1_id = ? OR person2_id = ?
        ORDER BY created_at DESC
      `,
    )
    .bind(personId, personId)
    .all<RelationshipRow>();

  return result.results.map(mapRelationshipRow);
}

export async function getRelationshipById(
  db: D1Database,
  relationshipId: string,
): Promise<Relationship | null> {
  const row = await db
    .prepare("SELECT * FROM relationships WHERE id = ?")
    .bind(relationshipId)
    .first<RelationshipRow>();

  return row ? mapRelationshipRow(row) : null;
}

export async function personsExist(db: D1Database, personIds: string[]): Promise<boolean> {
  const uniqueIds = [...new Set(personIds)];
  const placeholders = createPlaceholders(uniqueIds.length);
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM persons WHERE id IN (${placeholders})`)
    .bind(...uniqueIds)
    .first<{ count: number }>();

  return Number(row?.count ?? 0) === uniqueIds.length;
}

export async function getParentRelationshipsForChildren(
  db: D1Database,
  childIds: string[],
): Promise<Relationship[]> {
  if (childIds.length === 0) {
    return [];
  }

  const result = await db
    .prepare(
      `
        SELECT *
        FROM relationships
        WHERE type = 'parent_child'
          AND person2_id IN (${createPlaceholders(childIds.length)})
      `,
    )
    .bind(...childIds)
    .all<RelationshipRow>();

  return result.results.map(mapRelationshipRow);
}

export async function getChildRelationshipsForParents(
  db: D1Database,
  parentIds: string[],
): Promise<Relationship[]> {
  if (parentIds.length === 0) {
    return [];
  }

  const result = await db
    .prepare(
      `
        SELECT *
        FROM relationships
        WHERE type = 'parent_child'
          AND person1_id IN (${createPlaceholders(parentIds.length)})
      `,
    )
    .bind(...parentIds)
    .all<RelationshipRow>();

  return result.results.map(mapRelationshipRow);
}

export async function getSpouseRelationshipsForPersons(
  db: D1Database,
  personIds: string[],
): Promise<Relationship[]> {
  if (personIds.length === 0) {
    return [];
  }

  const placeholders = createPlaceholders(personIds.length);
  const result = await db
    .prepare(
      `
        SELECT *
        FROM relationships
        WHERE type = 'spouse'
          AND (person1_id IN (${placeholders}) OR person2_id IN (${placeholders}))
      `,
    )
    .bind(...personIds, ...personIds)
    .all<RelationshipRow>();

  return result.results.map(mapRelationshipRow);
}

function createPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

