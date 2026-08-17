-- Per-issue assignees for intake "Classic Form" issues.
-- Additive only: adds a round-robin cursor column on IntakeIssue and a join
-- table linking issues to assigned users. (Pre-existing drift surfaced by
-- `prisma migrate diff` — DROP COLUMNs on IntakeIssue/IntakeFormField/Profile,
-- the priority retype, and the MemberSchedule default — is intentionally
-- omitted per AGENTS.md.)

-- AlterTable
ALTER TABLE "IntakeIssue" ADD COLUMN "assigneeRotaPointer" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "IntakeIssueAssignee" (
    "issueId" TEXT NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "IntakeIssueAssignee_pkey" PRIMARY KEY ("issueId","userId")
);

-- CreateIndex
CREATE INDEX "IntakeIssueAssignee_userId_idx" ON "IntakeIssueAssignee"("userId");

-- AddForeignKey
ALTER TABLE "IntakeIssueAssignee" ADD CONSTRAINT "IntakeIssueAssignee_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "IntakeIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeIssueAssignee" ADD CONSTRAINT "IntakeIssueAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
