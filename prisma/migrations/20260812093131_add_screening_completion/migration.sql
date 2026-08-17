-- Additive only: reviewer sign-off fields on ScreeningSession
ALTER TABLE "ScreeningSession" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "ScreeningSession" ADD COLUMN "completedById" UUID;
