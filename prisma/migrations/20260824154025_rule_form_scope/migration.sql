-- AlterTable: per-support-form scope for automation rules
ALTER TABLE "Rule" ADD COLUMN     "formConfigId" TEXT;

-- CreateIndex
CREATE INDEX "Rule_formConfigId_idx" ON "Rule"("formConfigId");

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_formConfigId_fkey" FOREIGN KEY ("formConfigId") REFERENCES "IntakeFormConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
