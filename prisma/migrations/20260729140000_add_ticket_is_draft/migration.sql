-- Personal draft tickets: creator-only (lists also expose dept-scoped drafts to admins).
ALTER TABLE "Ticket" ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Ticket_creatorId_isDraft_idx" ON "Ticket"("creatorId", "isDraft");
CREATE INDEX "Ticket_isDraft_deletedAt_idx" ON "Ticket"("isDraft", "deletedAt");
