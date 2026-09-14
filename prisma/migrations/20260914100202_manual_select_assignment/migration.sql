-- AlterEnum
ALTER TYPE "AssignmentMethod" ADD VALUE 'MANUAL_SELECT';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "manualAssigneeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
