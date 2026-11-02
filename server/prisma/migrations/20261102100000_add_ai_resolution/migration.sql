-- AlterEnum
ALTER TYPE "SenderType" ADD VALUE 'ai';

-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'new' BEFORE 'open';
ALTER TYPE "TicketStatus" ADD VALUE 'processing' BEFORE 'open';

-- AlterTable
ALTER TABLE "ticket" ADD COLUMN "resolvedByAi" BOOLEAN NOT NULL DEFAULT false;
