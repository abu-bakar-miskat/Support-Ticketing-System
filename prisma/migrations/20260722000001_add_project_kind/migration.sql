-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('standard', 'support');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "kind" "ProjectKind" NOT NULL DEFAULT 'standard';
