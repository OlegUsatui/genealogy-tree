ALTER TABLE persons ADD COLUMN source_person_id TEXT;

CREATE INDEX idx_persons_source_person_id ON persons(source_person_id);
CREATE UNIQUE INDEX idx_persons_user_source_person_id ON persons(user_id, source_person_id);
