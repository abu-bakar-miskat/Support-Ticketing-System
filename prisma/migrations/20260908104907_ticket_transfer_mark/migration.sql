-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ticket_transferred';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "transferredAt" TIMESTAMP(3),
ADD COLUMN     "transferredById" UUID,
ADD COLUMN     "transferredByName" TEXT,
ADD COLUMN     "transferredFromName" TEXT,
ADD COLUMN     "transferredFromSubDepartmentId" UUID;

