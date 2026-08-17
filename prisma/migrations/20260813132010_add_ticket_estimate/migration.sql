-- CreateTable
CREATE TABLE "TicketEstimate" (
    "ticketId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "estimatedMinutes" INTEGER,
    "targetDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketEstimate_pkey" PRIMARY KEY ("ticketId","userId")
);

-- CreateIndex
CREATE INDEX "TicketEstimate_ticketId_idx" ON "TicketEstimate"("ticketId");

-- CreateIndex
CREATE INDEX "TicketEstimate_userId_idx" ON "TicketEstimate"("userId");

-- AddForeignKey
ALTER TABLE "TicketEstimate" ADD CONSTRAINT "TicketEstimate_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEstimate" ADD CONSTRAINT "TicketEstimate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

