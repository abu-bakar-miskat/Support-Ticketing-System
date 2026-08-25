-- Sub-department scoping for email config, SLA (policies + business hours),
-- and automation rules. Additive only.

-- AlterTable: SubDepartment (maps to "Team") — optional per-sub-department overrides
ALTER TABLE "Team" ADD COLUMN     "businessHours" JSONB,
ADD COLUMN     "emailConfig" JSONB,
ADD COLUMN     "slaConfig" JSONB;

-- AlterTable: Rule — optional sub-department scope
ALTER TABLE "Rule" ADD COLUMN     "teamId" TEXT;

-- AlterTable: SlaPolicy — optional sub-department scope
ALTER TABLE "SlaPolicy" ADD COLUMN     "teamId" TEXT;

-- CreateIndex
CREATE INDEX "Rule_teamId_idx" ON "Rule"("teamId");

-- CreateIndex
CREATE INDEX "SlaPolicy_teamId_idx" ON "SlaPolicy"("teamId");

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
