-- CreateEnum
CREATE TYPE "AssignmentMethod" AS ENUM ('RULE_BASED', 'ROUND_ROBIN', 'WORKLOAD_BASED', 'MANUAL');

-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'ASSIGNMENT_FAILED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'assignment_failed_alert';

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "assignmentMethod" "AssignmentMethod" NOT NULL DEFAULT 'ROUND_ROBIN';

-- CreateTable
CREATE TABLE "AssignmentRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "agentId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentRule_departmentId_idx" ON "AssignmentRule"("departmentId");

-- CreateIndex
CREATE INDEX "AssignmentRule_tenantId_idx" ON "AssignmentRule"("tenantId");

-- AddForeignKey
ALTER TABLE "AssignmentRule" ADD CONSTRAINT "AssignmentRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRule" ADD CONSTRAINT "AssignmentRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

