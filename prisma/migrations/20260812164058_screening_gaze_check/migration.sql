-- Additive only: webcam frame sampling + AI gaze-check verdict per answer
ALTER TABLE "ScreeningAnswer" ADD COLUMN "frameCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScreeningAnswer" ADD COLUMN "gazeVerdict" TEXT;
ALTER TABLE "ScreeningAnswer" ADD COLUMN "gazeReasoning" TEXT;
