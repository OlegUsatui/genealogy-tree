UPDATE users
SET primary_person_id = 'person-petro-petrenko'
WHERE id = 'user-admin' AND primary_person_id IS NULL;
