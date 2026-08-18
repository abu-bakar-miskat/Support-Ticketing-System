-- CreateEnum
CREATE TYPE "BulkReassignTargetType" AS ENUM ('SINGLE_AGENT', 'GROUP', 'DEPARTMENT_POOL');

-- CreateEnum
CREATE TYPE "BulkReassignJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "TicketAccessGrant" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkReassignJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "sourceAssigneeId" UUID NOT NULL,
    "targetType" "BulkReassignTargetType" NOT NULL,
    "targetAgentId" UUID,
    "targetTeamId" TEXT,
    "status" "BulkReassignJobStatus" NOT NULL DEFAULT 'PENDING',
    "ticketIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "succeededTicketIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resultSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BulkReassignJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketAccessGrant_userId_idx" ON "TicketAccessGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketAccessGrant_ticketId_userId_key" ON "TicketAccessGrant"("ticketId", "userId");

-- CreateIndex
CREATE INDEX "BulkReassignJob_departmentId_idx" ON "BulkReassignJob"("departmentId");

-- CreateIndex
CREATE INDEX "BulkReassignJob_tenantId_idx" ON "BulkReassignJob"("tenantId");

-- CreateIndex
CREATE INDEX "BulkReassignJob_status_idx" ON "BulkReassignJob"("status");

-- AddForeignKey
ALTER TABLE "TicketAccessGrant" ADD CONSTRAINT "TicketAccessGrant_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkReassignJob" ADD CONSTRAINT "BulkReassignJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkReassignJob" ADD CONSTRAINT "BulkReassignJob_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

