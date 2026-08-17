-- Composite indexes for manager dashboard overdue + team stats queries.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Ticket_teamId_deletedAt_dueDate_idx"
  ON "Ticket" ("teamId", "deletedAt", "dueDate");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Ticket_teamId_deletedAt_status_idx"
  ON "Ticket" ("teamId", "deletedAt", "status");
