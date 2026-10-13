-- AlterEnum
ALTER TYPE "ReportScheduleFrequency" ADD VALUE 'MONTHLY';

-- AlterTable
ALTER TABLE "ReportSchedule" ADD COLUMN     "settings" JSONB;

