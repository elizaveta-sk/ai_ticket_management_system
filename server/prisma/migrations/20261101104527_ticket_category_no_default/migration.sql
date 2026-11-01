-- New tickets have no category until they are classified.
ALTER TABLE "ticket" ALTER COLUMN "category" DROP DEFAULT,
ALTER COLUMN "category" DROP NOT NULL;
