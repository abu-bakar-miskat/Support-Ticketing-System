-- Additive only: retry bookkeeping for the scoring self-heal
ALTER TABLE "ScreeningSession" ADD COLUMN "scoringAttemptAt" TIMESTAMP(3);
