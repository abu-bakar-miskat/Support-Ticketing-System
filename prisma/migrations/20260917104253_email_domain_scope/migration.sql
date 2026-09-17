-- AlterTable
ALTER TABLE "EmailDomain" ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "subDepartmentId" TEXT;

-- CreateIndex
CREATE INDEX "EmailDomain_departmentId_idx" ON "EmailDomain"("departmentId");

-- CreateIndex
CREATE INDEX "EmailDomain_subDepartmentId_idx" ON "EmailDomain"("subDepartmentId");
