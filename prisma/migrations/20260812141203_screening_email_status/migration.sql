-- Additive only: Resend delivery-status tracking on ScreeningSession
ALTER TABLE "ScreeningSession" ADD COLUMN "resendEmailId" TEXT;
ALTER TABLE "ScreeningSession" ADD COLUMN "emailStatus" TEXT;
ALTER TABLE "ScreeningSession" ADD COLUMN "emailStatusAt" TIMESTAMP(3);
