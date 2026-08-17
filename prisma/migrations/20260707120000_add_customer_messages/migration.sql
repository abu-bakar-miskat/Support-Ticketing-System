-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('trusted', 'quarantined', 'system');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "messageId" TEXT;

-- AlterTable
ALTER TABLE "IntakeFormConfig" ADD COLUMN     "allowCustomerReplies" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Intake" ADD COLUMN     "replyToken" TEXT;

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'trusted',
    "authorProfileId" UUID,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "rawPayload" JSONB,
    "providerMessageId" TEXT,
    "inReplyTo" TEXT,
    "acceptedById" UUID,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_idx" ON "TicketMessage"("ticketId");

-- CreateIndex
CREATE INDEX "TicketMessage_providerMessageId_idx" ON "TicketMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "Intake_replyToken_key" ON "Intake"("replyToken");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TicketMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill an opaque reply token for every existing intake (issue 009)
UPDATE "Intake"
SET "replyToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "replyToken" IS NULL;
