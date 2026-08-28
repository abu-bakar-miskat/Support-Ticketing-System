-- TicketTemplate and Ticket.templateId exist in the Prisma schema but were never
-- created by an earlier migration (they lived only as out-of-band drift on the
-- shared DB). Create them additively so a fresh database matches the schema.

CREATE TABLE IF NOT EXISTS "TicketTemplate" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "departmentId" TEXT,
    "customFields" JSONB NOT NULL DEFAULT '[]',
    "createdById"  UUID NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TicketTemplate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TicketTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "TicketTemplate_departmentId_idx" ON "TicketTemplate"("departmentId");

ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
DO $$ BEGIN
    ALTER TABLE "Ticket"
        ADD CONSTRAINT "Ticket_templateId_fkey"
        FOREIGN KEY ("templateId") REFERENCES "TicketTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Ticket_templateId_idx" ON "Ticket"("templateId");
