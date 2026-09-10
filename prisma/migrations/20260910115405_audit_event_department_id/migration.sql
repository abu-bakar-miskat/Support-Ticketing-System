-- Add optional department scope to the audit trail so member-management events
-- (restrict/reactivate, role changes, department moves, deletion) can be read at
-- both tenant and department level. Additive and nullable — no backfill needed.
ALTER TABLE "AuditEvent" ADD COLUMN "departmentId" TEXT;

CREATE INDEX "AuditEvent_departmentId_idx" ON "AuditEvent"("departmentId");
