-- Reconcile additive drift shipped in 5af0baf (intake forms versioning + rules)
-- that was never applied to the shared DB. Purely additive: new columns, enum
-- values, and RuleExecutionLog. No drops.
--
-- Idempotent: every object here is also created (identically) by
-- 20260828140000_not_built_srs, so a from-scratch build applies that first
-- and this migration must no-op instead of colliding.

-- AlterEnum
ALTER TYPE "IntakeFieldType" ADD VALUE IF NOT EXISTS 'checkbox';
ALTER TYPE "IntakeFieldType" ADD VALUE IF NOT EXISTS 'radio';
ALTER TYPE "IntakeFieldType" ADD VALUE IF NOT EXISTS 'date';

-- AlterTable
ALTER TABLE "Intake"
  ADD COLUMN IF NOT EXISTS "fieldSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER;

-- AlterTable
ALTER TABLE "IntakeFormConfig"
  ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "IntakeFormField"
  ADD COLUMN IF NOT EXISTS "visibleWhen" JSONB;

-- AlterTable
ALTER TABLE "TicketMessage"
  ADD COLUMN IF NOT EXISTS "deliveryError" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryStatusAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RuleExecutionLog" (
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
CREATE INDEX IF NOT EXISTS "RuleExecutionLog_ticketId_createdAt_idx" ON "RuleExecutionLog"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RuleExecutionLog_tenantId_idx" ON "RuleExecutionLog"("tenantId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RuleExecutionLog_tenantId_fkey'
  ) THEN
    ALTER TABLE "RuleExecutionLog"
      ADD CONSTRAINT "RuleExecutionLog_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RuleExecutionLog_ticketId_fkey'
  ) THEN
    ALTER TABLE "RuleExecutionLog"
      ADD CONSTRAINT "RuleExecutionLog_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RuleExecutionLog_ruleId_fkey'
  ) THEN
    ALTER TABLE "RuleExecutionLog"
      ADD CONSTRAINT "RuleExecutionLog_ruleId_fkey"
      FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
