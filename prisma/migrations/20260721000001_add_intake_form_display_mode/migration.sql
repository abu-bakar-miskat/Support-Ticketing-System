-- CreateEnum
CREATE TYPE "IntakeFormDisplayMode" AS ENUM ('FORM', 'CHAT');

-- AlterTable
ALTER TABLE "IntakeFormConfig" ADD COLUMN     "displayMode" "IntakeFormDisplayMode" NOT NULL DEFAULT 'FORM';
