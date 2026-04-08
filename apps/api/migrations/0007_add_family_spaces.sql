CREATE TABLE family_spaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  root_person_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  allow_guest_add INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (root_person_id) REFERENCES global_persons(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE family_share_tokens (
  id TEXT PRIMARY KEY,
  family_space_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (family_space_id) REFERENCES family_spaces(id)
);

CREATE UNIQUE INDEX idx_family_spaces_owner_root
  ON family_spaces(created_by_user_id, root_person_id);

CREATE INDEX idx_family_spaces_root_person_id
  ON family_spaces(root_person_id);

CREATE INDEX idx_family_share_tokens_family_space_id
  ON family_share_tokens(family_space_id);
