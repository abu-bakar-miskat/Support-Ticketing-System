-- AlterTable
ALTER TABLE "TeamStatus" ADD COLUMN     "allowedLabels" TEXT[] DEFAULT ARRAY[]::TEXT[];
