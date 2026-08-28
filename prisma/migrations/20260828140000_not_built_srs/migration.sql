-- Additive-only: DAT-04 field versioning, FM-02 new field types, FM-05 visibleWhen,
-- RE-05 rule execution log, MAIL-03 message delivery status.

-- New intake field types (must land before any INSERT that uses them; this
-- migration only ALTERs the type, it does not insert those values).
ALTER TYPE "IntakeFieldType" ADD VALUE IF NOT EXISTS 'checkbox';
ALTER TYPE "IntakeFieldType" ADD VALUE IF NOT EXISTS 'radio';
ALTER TYPE "IntakeFieldType" ADD VALUE IF NOT EXISTS 'date';

ALTER TABLE "IntakeFormConfig"
  ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "IntakeFormField"
  ADD COLUMN IF NOT EXISTS "visibleWhen" JSONB;

ALTER TABLE "Intake"
  ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "fieldSnapshot" JSONB;

ALTER TABLE "TicketMessage"
  ADD COLUMN IF NOT EXISTS "deliveryStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryError" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryStatusAt" TIMESTAMP(3);

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

CREATE INDEX IF NOT EXISTS "RuleExecutionLog_ticketId_createdAt_idx"
  ON "RuleExecutionLog"("ticketId", "createdAt");

CREATE INDEX IF NOT EXISTS "RuleExecutionLog_tenantId_idx"
  ON "RuleExecutionLog"("tenantId");

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
