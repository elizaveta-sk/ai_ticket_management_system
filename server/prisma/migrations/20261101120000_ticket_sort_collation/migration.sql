-- Sort subjects and sender names the way people read them, whatever the database's
-- default collation is. Under "C", lowercase sorts after every capital and accented
-- letters sort after "z". The Prisma schema can't express a column collation.
ALTER TABLE "ticket"
  ALTER COLUMN "subject" TYPE TEXT COLLATE "und-x-icu",
  ALTER COLUMN "senderName" TYPE TEXT COLLATE "und-x-icu";
