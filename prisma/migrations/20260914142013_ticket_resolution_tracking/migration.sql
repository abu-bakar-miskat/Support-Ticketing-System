-- Ticket resolution time tracking: start time (In Progress), total resolution
-- time, and whether it beat the allowed resolution time. Additive only.
-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "inProgressStartedAt" TIMESTAMP(3),
ADD COLUMN     "resolutionDurationMins" INTEGER,
ADD COLUMN     "resolvedWithinAllowed" BOOLEAN;
