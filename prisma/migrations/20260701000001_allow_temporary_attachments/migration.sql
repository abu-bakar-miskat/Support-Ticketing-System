-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'attached';

-- Make ticketId nullable to allow temporary attachments
ALTER TABLE "Attachment" ALTER COLUMN "ticketId" DROP NOT NULL;
