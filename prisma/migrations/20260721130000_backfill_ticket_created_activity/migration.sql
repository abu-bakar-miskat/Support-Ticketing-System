-- Backfill creation events for existing tickets so the Activity filter works
-- for tickets created before TICKET_CREATED logging shipped.
INSERT INTO "ActivityLog" (id, "ticketId", "actorId", action, metadata, "createdAt")
SELECT
  gen_random_uuid()::text,
  t.id,
  t."creatorId",
  'TICKET_CREATED'::"ActivityAction",
  jsonb_build_object(
    'humanId', tm.prefix || '-' || t."ticketNumber"::text,
    'title', t.title,
    'status', t.status
  ),
  t."createdAt"
FROM "Ticket" t
INNER JOIN "Team" tm ON tm.id = t."teamId"
WHERE t."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "ActivityLog" al
    WHERE al."ticketId" = t.id
      AND al.action = 'TICKET_CREATED'::"ActivityAction"
  );
