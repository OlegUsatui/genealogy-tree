CREATE TABLE global_persons (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT,
  middle_name TEXT,
  maiden_name TEXT,
  gender TEXT NOT NULL DEFAULT 'unknown' CHECK (gender IN ('male', 'female', 'other', 'unknown')),
  birth_date TEXT,
  death_date TEXT,
  birth_place TEXT,
  death_place TEXT,
  biography TEXT,
  is_living INTEGER,
  photo_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE global_relationships (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('parent_child', 'spouse')),
  person1_id TEXT NOT NULL,
  person2_id TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (person1_id <> person2_id),
  FOREIGN KEY (person1_id) REFERENCES global_persons(id),
  FOREIGN KEY (person2_id) REFERENCES global_persons(id)
);

CREATE TABLE person_permissions (
  user_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, person_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (person_id) REFERENCES global_persons(id)
);

CREATE INDEX idx_global_persons_first_name ON global_persons(first_name);
CREATE INDEX idx_global_persons_last_name ON global_persons(last_name);
CREATE INDEX idx_global_relationships_person1_id ON global_relationships(person1_id);
CREATE INDEX idx_global_relationships_person2_id ON global_relationships(person2_id);
CREATE INDEX idx_global_relationships_type ON global_relationships(type);
CREATE UNIQUE INDEX idx_global_relationships_unique ON global_relationships(type, person1_id, person2_id);
CREATE INDEX idx_person_permissions_user_id ON person_permissions(user_id);
CREATE INDEX idx_person_permissions_person_id ON person_permissions(person_id);

WITH ranked_persons AS (
  SELECT
    COALESCE(source_person_id, id) AS canonical_id,
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
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(source_person_id, id)
      ORDER BY updated_at DESC, created_at DESC, id
    ) AS rank_position
  FROM persons
)
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
)
SELECT
  canonical_id,
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
FROM ranked_persons
WHERE rank_position = 1;

WITH mapped_relationships AS (
  SELECT
    relationships.id AS legacy_id,
    relationships.type AS relationship_type,
    CASE
      WHEN relationships.type = 'spouse'
        AND COALESCE(person1.source_person_id, person1.id) > COALESCE(person2.source_person_id, person2.id)
      THEN COALESCE(person2.source_person_id, person2.id)
      ELSE COALESCE(person1.source_person_id, person1.id)
    END AS mapped_person1_id,
    CASE
      WHEN relationships.type = 'spouse'
        AND COALESCE(person1.source_person_id, person1.id) > COALESCE(person2.source_person_id, person2.id)
      THEN COALESCE(person1.source_person_id, person1.id)
      ELSE COALESCE(person2.source_person_id, person2.id)
    END AS mapped_person2_id,
    relationships.start_date,
    relationships.end_date,
    relationships.notes,
    relationships.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY
        relationships.type,
        CASE
          WHEN relationships.type = 'spouse'
            AND COALESCE(person1.source_person_id, person1.id) > COALESCE(person2.source_person_id, person2.id)
          THEN COALESCE(person2.source_person_id, person2.id)
          ELSE COALESCE(person1.source_person_id, person1.id)
        END,
        CASE
          WHEN relationships.type = 'spouse'
            AND COALESCE(person1.source_person_id, person1.id) > COALESCE(person2.source_person_id, person2.id)
          THEN COALESCE(person1.source_person_id, person1.id)
          ELSE COALESCE(person2.source_person_id, person2.id)
        END
      ORDER BY relationships.created_at, relationships.id
    ) AS rank_position
  FROM relationships
  JOIN persons AS person1 ON person1.id = relationships.person1_id
  JOIN persons AS person2 ON person2.id = relationships.person2_id
  WHERE COALESCE(person1.source_person_id, person1.id) <> COALESCE(person2.source_person_id, person2.id)
)
INSERT INTO global_relationships (
  id,
  type,
  person1_id,
  person2_id,
  start_date,
  end_date,
  notes,
  created_at,
  updated_at
)
SELECT
  legacy_id,
  relationship_type,
  mapped_person1_id,
  mapped_person2_id,
  start_date,
  end_date,
  notes,
  created_at,
  created_at
FROM mapped_relationships
WHERE rank_position = 1;

INSERT INTO person_permissions (user_id, person_id, role, created_at)
SELECT
  user_id,
  COALESCE(source_person_id, id) AS canonical_person_id,
  'editor',
  MIN(created_at)
FROM persons
GROUP BY user_id, canonical_person_id;

INSERT INTO person_permissions (user_id, person_id, role, created_at)
SELECT
  users.id,
  COALESCE(persons.source_person_id, persons.id) AS canonical_person_id,
  'owner',
  users.created_at
FROM users
JOIN persons ON persons.id = users.primary_person_id
WHERE users.primary_person_id IS NOT NULL
ON CONFLICT(user_id, person_id) DO UPDATE SET role = 'owner';

UPDATE users
SET primary_person_id = (
  SELECT COALESCE(persons.source_person_id, persons.id)
  FROM persons
  WHERE persons.id = users.primary_person_id
)
WHERE primary_person_id IS NOT NULL;
