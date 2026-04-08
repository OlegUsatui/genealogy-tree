CREATE UNIQUE INDEX IF NOT EXISTS idx_global_persons_unique_identity
ON global_persons (
  lower(trim(first_name)),
  lower(trim(last_name)),
  birth_date
)
WHERE first_name IS NOT NULL
  AND trim(first_name) <> ''
  AND last_name IS NOT NULL
  AND trim(last_name) <> ''
  AND birth_date IS NOT NULL;
