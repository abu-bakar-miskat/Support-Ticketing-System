-- CreateEnum
CREATE TYPE "ScreeningStatus" AS ENUM ('sent', 'started', 'submitted', 'scored', 'expired');

-- CreateTable
CREATE TABLE "ScreeningSession" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT,
    "candidateName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "ScreeningStatus" NOT NULL DEFAULT 'sent',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "overallScore" DOUBLE PRECISION,

    CONSTRAINT "ScreeningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningAnswer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "objectKey" TEXT,
    "durationSec" INTEGER,
    "takesUsed" INTEGER NOT NULL DEFAULT 0,
    "transcript" TEXT,
    "score" INTEGER,
    "reasoning" TEXT,
    "evidence" TEXT,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uploadedAt" TIMESTAMP(3),
    "scoredAt" TIMESTAMP(3),

    CONSTRAINT "ScreeningAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningSession_token_key" ON "ScreeningSession"("token");

-- CreateIndex
CREATE INDEX "ScreeningSession_candidateId_idx" ON "ScreeningSession"("candidateId");

-- CreateIndex
CREATE INDEX "ScreeningSession_status_idx" ON "ScreeningSession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningAnswer_sessionId_questionKey_key" ON "ScreeningAnswer"("sessionId", "questionKey");

-- CreateIndex
CREATE INDEX "ScreeningAnswer_sessionId_idx" ON "ScreeningAnswer"("sessionId");

-- AddForeignKey
ALTER TABLE "ScreeningSession" ADD CONSTRAINT "ScreeningSession_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "RecruitmentCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningAnswer" ADD CONSTRAINT "ScreeningAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScreeningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Screening rows must never be readable through the Supabase anon/authenticated
-- PostgREST roles: enable RLS with no policies (Prisma connects as the table
-- owner, which bypasses RLS, so server routes are unaffected).
ALTER TABLE "ScreeningSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScreeningAnswer" ENABLE ROW LEVEL SECURITY;
