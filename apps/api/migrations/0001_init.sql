CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE persons (
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

CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('parent_child', 'spouse')),
  person1_id TEXT NOT NULL,
  person2_id TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  CHECK (person1_id <> person2_id),
  FOREIGN KEY (person1_id) REFERENCES persons(id),
  FOREIGN KEY (person2_id) REFERENCES persons(id)
);

CREATE INDEX idx_relationships_person1_id ON relationships(person1_id);
CREATE INDEX idx_relationships_person2_id ON relationships(person2_id);
CREATE INDEX idx_relationships_type ON relationships(type);
CREATE INDEX idx_persons_first_name ON persons(first_name);
CREATE INDEX idx_persons_last_name ON persons(last_name);
CREATE UNIQUE INDEX idx_relationships_unique ON relationships(type, person1_id, person2_id);

