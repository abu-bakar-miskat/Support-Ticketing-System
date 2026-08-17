-- Hybrid timer + QA time log support
CREATE TYPE "TimeEntryKind" AS ENUM ('DEVELOPMENT', 'QA');

ALTER TABLE "TimeEntry" ADD COLUMN "kind" "TimeEntryKind" NOT NULL DEFAULT 'DEVELOPMENT';

CREATE INDEX "TimeEntry_ticketId_kind_idx" ON "TimeEntry"("ticketId", "kind");

-- Activity log actions for reset + manual QA time
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TIMER_RESET';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'QA_TIME_LOGGED';
