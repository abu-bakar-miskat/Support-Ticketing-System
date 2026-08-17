-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'QA_ASSIGNEE_ADDED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'QA_ASSIGNEE_REMOVED';

-- CreateTable
CREATE TABLE "TicketQaAssignee" (
    "ticketId" TEXT NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "TicketQaAssignee_pkey" PRIMARY KEY ("ticketId", "userId")
);

-- CreateIndex
CREATE INDEX "TicketQaAssignee_ticketId_idx" ON "TicketQaAssignee"("ticketId");

-- CreateIndex
CREATE INDEX "TicketQaAssignee_userId_idx" ON "TicketQaAssignee"("userId");

-- AddForeignKey
ALTER TABLE "TicketQaAssignee" ADD CONSTRAINT "TicketQaAssignee_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketQaAssignee" ADD CONSTRAINT "TicketQaAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
