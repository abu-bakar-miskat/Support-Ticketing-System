-- Shared-mailbox SLA: department-level targets for mailbox tickets, and a
-- marker on the timers they start.

-- AlterTable
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "mailboxFirstResponseMins" INTEGER,
ADD COLUMN IF NOT EXISTS "mailboxResolutionMins" INTEGER;

-- AlterTable
ALTER TABLE "SlaTimer" ADD COLUMN IF NOT EXISTS "source" TEXT;
