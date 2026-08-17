-- Backfills the missing CREATE TABLE for "IntakeIssue". The table was created
-- directly on the live DB and never captured as a migration, so shadow-database
-- replay failed at 20260721000002 ("relation IntakeIssue does not exist").
-- Idempotent so applying to a DB that already has the table is a no-op.
-- Columns intakeTeamId (20260721000002) and assigneeRotaPointer (20260730101113)
-- are intentionally excluded — they are added by those later migrations.

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntakeIssue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "estimatedHours" INTEGER,
    "formConfigId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntakeIssue_formConfigId_idx" ON "IntakeIssue"("formConfigId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'IntakeIssue_formConfigId_fkey'
    ) THEN
        ALTER TABLE "IntakeIssue" ADD CONSTRAINT "IntakeIssue_formConfigId_fkey"
            FOREIGN KEY ("formConfigId") REFERENCES "IntakeFormConfig"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
