-- Additive only: pin certain questions to every invite; the rest rotate
ALTER TABLE "ScreeningQuestion" ADD COLUMN "alwaysInclude" BOOLEAN NOT NULL DEFAULT false;
