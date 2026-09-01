-- Reconcile additive drift shipped in 5af0baf (intake forms versioning + rules)
-- that was never applied to the shared DB. Purely additive: new columns, enum
-- values, and RuleExecutionLog. No drops.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntakeFieldType" ADD VALUE 'checkbox';
ALTER TYPE "IntakeFieldType" ADD VALUE 'radio';
ALTER TYPE "IntakeFieldType" ADD VALUE 'date';

-- AlterTable
ALTER TABLE "Intake" ADD COLUMN     "fieldSnapshot" JSONB,
ADD COLUMN     "schemaVersion" INTEGER;

-- AlterTable
ALTER TABLE "IntakeFormConfig" ADD COLUMN     "schemaVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "IntakeFormField" ADD COLUMN     "visibleWhen" JSONB;

-- AlterTable
ALTER TABLE "TicketMessage" ADD COLUMN     "deliveryError" TEXT,
ADD COLUMN     "deliveryStatus" TEXT,
ADD COLUMN     "deliveryStatusAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RuleExecutionLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "ruleId" TEXT,
    "ruleName" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "actionsApplied" JSONB NOT NULL DEFAULT '[]',
    "stopProcessing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RuleExecutionLog_ticketId_createdAt_idx" ON "RuleExecutionLog"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "RuleExecutionLog_tenantId_idx" ON "RuleExecutionLog"("tenantId");

-- AddForeignKey
ALTER TABLE "RuleExecutionLog" ADD CONSTRAINT "RuleExecutionLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleExecutionLog" ADD CONSTRAINT "RuleExecutionLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleExecutionLog" ADD CONSTRAINT "RuleExecutionLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

