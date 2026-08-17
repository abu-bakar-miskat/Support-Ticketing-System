-- CreateTable
CREATE TABLE "ScreeningQuestion" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "hint" TEXT NOT NULL DEFAULT '',
    "rubricFive" TEXT NOT NULL DEFAULT '',
    "rubricThree" TEXT NOT NULL DEFAULT '',
    "rubricOne" TEXT NOT NULL DEFAULT '',
    "rubricPenalise" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreeningQuestion_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ScreeningAnswer" ADD COLUMN "prompt" TEXT,
ADD COLUMN "hint" TEXT,
ADD COLUMN "rubric" JSONB;

-- Same posture as the other screening tables: no PostgREST/anon access.
ALTER TABLE "ScreeningQuestion" ENABLE ROW LEVEL SECURITY;
