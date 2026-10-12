-- Cross-version mailbox idempotency. No existing rows are changed/backfilled.
CREATE INDEX IF NOT EXISTS "ActivityLog_mailbox_message_identity_idx"
ON "ActivityLog" ((btrim(btrim(metadata->>'providerMessageId'), '<>')))
WHERE action = 'TICKET_CREATED' AND metadata->>'source' = 'email';
CREATE INDEX IF NOT EXISTS "TicketMessage_normalized_identity_idx"
ON "TicketMessage" ((btrim(btrim("providerMessageId"), '<>')))
WHERE "providerMessageId" IS NOT NULL;

CREATE OR REPLACE FUNCTION mailbox_guard_email_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE identity text;
BEGIN
  IF TG_TABLE_NAME = 'ActivityLog' THEN
    IF NEW.action <> 'TICKET_CREATED' OR NEW.metadata->>'source' IS DISTINCT FROM 'email' THEN RETURN NEW; END IF;
    identity := btrim(btrim(NEW.metadata->>'providerMessageId'), '<>');
  ELSE
    IF NEW.direction <> 'inbound' THEN RETURN NEW; END IF;
    identity := btrim(btrim(NEW."providerMessageId"), '<>');
  END IF;
  IF identity IS NULL OR identity = '' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(identity));
  IF EXISTS (SELECT 1 FROM "ActivityLog" a WHERE a.action = 'TICKET_CREATED' AND a.metadata->>'source' = 'email'
      AND btrim(btrim(a.metadata->>'providerMessageId'), '<>') = identity AND a."ticketId" <> NEW."ticketId")
    OR EXISTS (SELECT 1 FROM "TicketMessage" m WHERE btrim(btrim(m."providerMessageId"), '<>') = identity AND m."ticketId" <> NEW."ticketId") THEN
    RAISE EXCEPTION 'Inbound email identity already belongs to another ticket' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "mailbox_guard_audit_identity" BEFORE INSERT ON "ActivityLog"
FOR EACH ROW EXECUTE FUNCTION mailbox_guard_email_identity();
CREATE TRIGGER "mailbox_guard_message_identity" BEFORE INSERT ON "TicketMessage"
FOR EACH ROW EXECUTE FUNCTION mailbox_guard_email_identity();

-- Source audit and in-app arrival alerts commit with the ticket, even when an
-- older webhook application lacks the post-commit manager-notification hook.
CREATE OR REPLACE FUNCTION mailbox_record_arrival() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE dept_id text; tenant_id text; mailbox_address text;
BEGIN
  IF NEW.action <> 'TICKET_CREATED' OR NEW.metadata->>'source' IS DISTINCT FROM 'email' THEN RETURN NEW; END IF;
  SELECT s."departmentId", t."tenantId" INTO dept_id, tenant_id
  FROM "Ticket" t JOIN "Team" s ON s.id = t."teamId" WHERE t.id = NEW."ticketId";
  SELECT address INTO mailbox_address FROM "MailboxConnection"
  WHERE id = NEW.metadata->'rawPayload'->>'mailboxConnectionId' AND "departmentId" = dept_id AND "tenantId" = tenant_id;

  INSERT INTO "Notification" (id, "recipientId", type, "ticketId", message)
  SELECT 'mailbox-arrival:' || NEW."ticketId" || ':' || p.id::text, p.id, 'intake_manager_alert', NEW."ticketId",
    CASE WHEN mailbox_address IS NULL THEN 'shared mailbox' ELSE 'shared mailbox ' || mailbox_address END
  FROM "Profile" p JOIN (
    SELECT "userId" FROM "DepartmentManager" WHERE "departmentId" = dept_id
    UNION
    SELECT "userId" FROM "TenantMembership" WHERE "tenantId" = tenant_id AND "isActive" AND role IN ('admin', 'manager')
  ) recipients ON recipients."userId" = p.id
  WHERE COALESCE(p."notificationPrefs"->>'intakeManagerAlert', 'true') <> 'false'
  ON CONFLICT (id) DO NOTHING;

  -- Stale description-only deployments have no message-row identity. Publish
  -- a body-free receipt so message-only deployments see this same arrival.
  IF NULLIF(NEW.metadata->>'providerMessageId', '') IS NOT NULL
      AND COALESCE(NEW.metadata->>'mailboxReceiptManagedByApp', 'false') <> 'true' THEN
    INSERT INTO "TicketMessage" (id, "ticketId", direction, status, "fromName", "fromEmail", "bodyHtml", "providerMessageId", "rawPayload")
    VALUES ('mailbox-receipt:' || NEW."ticketId", NEW."ticketId", 'inbound', 'system',
      COALESCE(NEW.metadata->>'fromName', ''), COALESCE(NEW.metadata->>'fromEmail', ''), '',
      btrim(btrim(NEW.metadata->>'providerMessageId'), '<>'), COALESCE(NEW.metadata->'rawPayload', '{}'::jsonb) || '{"mailboxReceipt":true}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "mailbox_arrival_persistence" AFTER INSERT ON "ActivityLog"
FOR EACH ROW EXECUTE FUNCTION mailbox_record_arrival();
