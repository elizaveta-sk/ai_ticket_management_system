-- Existing tickets without a name fall back to their email address.
UPDATE "ticket" SET "senderName" = "senderEmail" WHERE "senderName" IS NULL;
ALTER TABLE "ticket" ALTER COLUMN "senderName" SET NOT NULL;

-- Replace the UUID id with a numeric one. Existing rows are kept and numbered.
ALTER TABLE "ticket" DROP CONSTRAINT "ticket_pkey",
DROP COLUMN "id",
ADD COLUMN "id" SERIAL NOT NULL,
ADD CONSTRAINT "ticket_pkey" PRIMARY KEY ("id");
