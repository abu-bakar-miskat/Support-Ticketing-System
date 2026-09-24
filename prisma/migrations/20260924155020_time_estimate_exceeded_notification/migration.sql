-- Add "time exceeded estimate" notification support (additive only).

-- New notification type for the estimate-overrun alert.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'time_estimate_exceeded';

-- Fire-once guard: set when a ticket's total logged time first crosses its estimate.
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "estimateOverrunNotifiedAt" TIMESTAMP(3);
