ALTER TABLE users ADD COLUMN primary_person_id TEXT;

UPDATE users
SET primary_person_id = 'person-petro-petrenko'
WHERE id = 'user-admin' AND primary_person_id IS NULL;
