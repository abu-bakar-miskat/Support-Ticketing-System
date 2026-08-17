-- Additive only: reviewer integrity flag on screening sessions
ALTER TABLE "ScreeningSession" ADD COLUMN "reviewerFlaggedAt" TIMESTAMP(3);
ALTER TABLE "ScreeningSession" ADD COLUMN "reviewerFlaggedById" UUID;
ALTER TABLE "ScreeningSession" ADD COLUMN "reviewerFlagNote" TEXT;
