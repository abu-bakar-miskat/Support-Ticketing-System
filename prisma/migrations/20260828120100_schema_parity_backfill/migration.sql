
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'PR_MERGED';
ALTER TYPE "ActivityAction" ADD VALUE 'FIELD_CHANGED';

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_ticketId_fkey";

-- AlterTable
ALTER TABLE "Department" DROP COLUMN "branding";

-- AlterTable
ALTER TABLE "DepartmentAccess" ADD COLUMN     "fullAccess" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Intake" ADD COLUMN     "estimatedHours" INTEGER;

-- AlterTable
ALTER TABLE "IntakeFormConfig" ADD COLUMN     "autoAssign" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "intakeDefaultFields" JSONB;

-- AlterTable
ALTER TABLE "IntakeFormField" ADD COLUMN     "helperText" TEXT,
ADD COLUMN     "placeholder" TEXT,
ADD COLUMN     "validation" JSONB;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "location" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "templateData" JSONB;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

