-- Additive only: new SlaPolicy attributes for the issue-authored policy form.
-- (Pre-existing drift from `prisma migrate diff` intentionally excluded — see AGENTS.md.)
ALTER TABLE "SlaPolicy" ADD COLUMN     "assigneeId" UUID,
ADD COLUMN     "formConfigId" TEXT,
ADD COLUMN     "priority" "TicketPriority";
