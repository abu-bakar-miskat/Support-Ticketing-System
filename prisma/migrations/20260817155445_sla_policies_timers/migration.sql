-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'sla_at_risk';
ALTER TYPE "NotificationType" ADD VALUE 'sla_breach';

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "businessHours" JSONB,
ADD COLUMN     "slaConfig" JSONB;

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "firstResponseMins" INTEGER NOT NULL,
    "resolutionMins" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaTimer" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT,
    "firstResponseTargetMins" INTEGER NOT NULL,
    "resolutionTargetMins" INTEGER NOT NULL,
    "firstResponseStartedAt" TIMESTAMP(3) NOT NULL,
    "firstResponseStoppedAt" TIMESTAMP(3),
    "resolutionStartedAt" TIMESTAMP(3) NOT NULL,
    "resolutionStoppedAt" TIMESTAMP(3),
    "firstResponseAtRiskNotifiedAt" TIMESTAMP(3),
    "firstResponseBreachNotifiedAt" TIMESTAMP(3),
    "resolutionAtRiskNotifiedAt" TIMESTAMP(3),
    "resolutionBreachNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaBreach" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "timerId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "targetMins" INTEGER NOT NULL,
    "breachedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlaBreach_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlaPolicy_departmentId_idx" ON "SlaPolicy"("departmentId");

-- CreateIndex
CREATE INDEX "SlaPolicy_tenantId_idx" ON "SlaPolicy"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SlaTimer_ticketId_key" ON "SlaTimer"("ticketId");

-- CreateIndex
CREATE INDEX "SlaTimer_tenantId_idx" ON "SlaTimer"("tenantId");

-- CreateIndex
CREATE INDEX "SlaTimer_policyId_idx" ON "SlaTimer"("policyId");

-- CreateIndex
CREATE INDEX "SlaBreach_ticketId_idx" ON "SlaBreach"("ticketId");

-- CreateIndex
CREATE INDEX "SlaBreach_tenantId_idx" ON "SlaBreach"("tenantId");

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaTimer" ADD CONSTRAINT "SlaTimer_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaTimer" ADD CONSTRAINT "SlaTimer_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SlaPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaBreach" ADD CONSTRAINT "SlaBreach_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

