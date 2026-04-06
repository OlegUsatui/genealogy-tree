INSERT OR IGNORE INTO users (id, email, password_hash, created_at, updated_at) VALUES
  (
    'user-admin',
    'admin@example.com',
    'pbkdf2$100000$family-tree-admin-salt$iJu3Xh_xX5Zg2D1wCcV9d6_Z6imdCU3NW2R8SdcSn5g',
    '2026-04-06T11:24:01Z',
    '2026-04-06T11:24:01Z'
  );

CREATE TABLE persons_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'user-admin',
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
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO persons_new (
  id,
  user_id,
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
  id,
  'user-admin',
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
FROM persons;

CREATE TABLE relationships_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'user-admin',
  type TEXT NOT NULL CHECK (type IN ('parent_child', 'spouse')),
  person1_id TEXT NOT NULL,
  person2_id TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  CHECK (person1_id <> person2_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (person1_id) REFERENCES persons_new(id),
  FOREIGN KEY (person2_id) REFERENCES persons_new(id)
);

INSERT INTO relationships_new (
  id,
  user_id,
  type,
  person1_id,
  person2_id,
  start_date,
  end_date,
  notes,
  created_at
)
SELECT
  id,
  'user-admin',
  type,
  person1_id,
  person2_id,
  start_date,
  end_date,
  notes,
  created_at
FROM relationships;

DROP TABLE relationships;
DROP TABLE persons;

ALTER TABLE persons_new RENAME TO persons;
ALTER TABLE relationships_new RENAME TO relationships;

CREATE INDEX idx_persons_user_id ON persons(user_id);
CREATE INDEX idx_persons_first_name ON persons(first_name);
CREATE INDEX idx_persons_last_name ON persons(last_name);
CREATE INDEX idx_relationships_user_person1_id ON relationships(user_id, person1_id);
CREATE INDEX idx_relationships_user_person2_id ON relationships(user_id, person2_id);
CREATE INDEX idx_relationships_user_type ON relationships(user_id, type);
CREATE UNIQUE INDEX idx_relationships_unique ON relationships(user_id, type, person1_id, person2_id);
