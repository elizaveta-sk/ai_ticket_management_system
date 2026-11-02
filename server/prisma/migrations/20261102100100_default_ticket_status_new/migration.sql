-- Separate from the migration that adds the value, because PostgreSQL can't use a new enum
-- value in the transaction that added it.
ALTER TABLE "ticket" ALTER COLUMN "status" SET DEFAULT 'new';
