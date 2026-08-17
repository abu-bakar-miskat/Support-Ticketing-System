-- Additive only: persist the last scoring failure so stuck answers are diagnosable
ALTER TABLE "ScreeningAnswer" ADD COLUMN "scoringError" TEXT;
