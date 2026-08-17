-- CreateEnum
CREATE TYPE "RecruitmentFieldType" AS ENUM ('text', 'select', 'multi_select', 'number', 'date', 'url', 'email', 'phone', 'rating', 'checkbox');

-- CreateTable
CREATE TABLE "RecruitmentBoard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruitmentBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentField" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RecruitmentFieldType" NOT NULL DEFAULT 'text',
    "options" JSONB,
    "order" INTEGER NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruitmentField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentCandidate" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecruitmentField_boardId_idx" ON "RecruitmentField"("boardId");

-- CreateIndex
CREATE INDEX "RecruitmentCandidate_boardId_idx" ON "RecruitmentCandidate"("boardId");

-- AddForeignKey
ALTER TABLE "RecruitmentField" ADD CONSTRAINT "RecruitmentField_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "RecruitmentBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentCandidate" ADD CONSTRAINT "RecruitmentCandidate_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "RecruitmentBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

