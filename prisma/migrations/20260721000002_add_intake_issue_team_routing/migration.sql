-- AlterTable
ALTER TABLE "IntakeIssue" ADD COLUMN     "intakeTeamId" TEXT;

-- AddForeignKey
ALTER TABLE "IntakeIssue" ADD CONSTRAINT "IntakeIssue_intakeTeamId_fkey" FOREIGN KEY ("intakeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
