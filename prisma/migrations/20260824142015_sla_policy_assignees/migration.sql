-- Additive only: SLA policies gain a round-robin assignee pool (so they can
-- double as a support form's selectable issues). Pre-existing drift from
-- `prisma migrate diff` intentionally excluded — see AGENTS.md.

ALTER TABLE "SlaPolicy" ADD COLUMN "assigneeRotaPointer" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "SlaPolicyAssignee" (
    "policyId" TEXT NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "SlaPolicyAssignee_pkey" PRIMARY KEY ("policyId","userId")
);

CREATE INDEX "SlaPolicyAssignee_userId_idx" ON "SlaPolicyAssignee"("userId");

ALTER TABLE "SlaPolicyAssignee" ADD CONSTRAINT "SlaPolicyAssignee_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SlaPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SlaPolicyAssignee" ADD CONSTRAINT "SlaPolicyAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
