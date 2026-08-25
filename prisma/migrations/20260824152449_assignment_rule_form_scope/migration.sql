-- AlterTable: per-support-form scope for assignment rules
ALTER TABLE "AssignmentRule" ADD COLUMN     "formConfigId" TEXT;

-- CreateIndex
CREATE INDEX "AssignmentRule_formConfigId_idx" ON "AssignmentRule"("formConfigId");

-- AddForeignKey
ALTER TABLE "AssignmentRule" ADD CONSTRAINT "AssignmentRule_formConfigId_fkey" FOREIGN KEY ("formConfigId") REFERENCES "IntakeFormConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
