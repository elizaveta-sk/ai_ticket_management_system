-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('agent', 'customer');

-- CreateTable
CREATE TABLE "ticket_reply" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "senderType" "SenderType" NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_reply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_reply_ticketId_idx" ON "ticket_reply"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_reply_authorId_idx" ON "ticket_reply"("authorId");

-- AddForeignKey
ALTER TABLE "ticket_reply" ADD CONSTRAINT "ticket_reply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_reply" ADD CONSTRAINT "ticket_reply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
