-- Recreate trigger functions with an explicit search_path so they resolve
-- public-schema types ("ActivityAction", "TicketStatus") even when the
-- session search_path is empty (e.g. PgBouncer transaction-pooler mode).

CREATE OR REPLACE FUNCTION public.log_ticket_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actor_id UUID;
BEGIN
  actor_id := NULLIF(current_setting('app.current_user_id', true), '')::UUID;

  IF actor_id IS NULL THEN
    actor_id := NEW."creatorId";
  END IF;

  INSERT INTO public."ActivityLog" (id, "ticketId", "actorId", action, metadata, "createdAt")
  VALUES (
    gen_random_uuid()::text,
    NEW.id,
    actor_id,
    'STATUS_CHANGED'::"ActivityAction",
    jsonb_build_object('from', OLD.status::text, 'to', NEW.status::text),
    NOW()
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_cycle_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  first_in_progress_at TIMESTAMPTZ;
BEGIN
  SELECT MIN("createdAt") INTO first_in_progress_at
  FROM public."ActivityLog"
  WHERE "ticketId" = NEW.id
    AND action = 'STATUS_CHANGED'::"ActivityAction"
    AND metadata->>'to' = 'In Progress';

  IF first_in_progress_at IS NOT NULL THEN
    NEW."cycleTime" := EXTRACT(EPOCH FROM (NOW() - first_in_progress_at))::INT;
  END IF;

  RETURN NEW;
END;
$$;

-- Update the before_ticket_live trigger condition to match the current
-- plain-text status value (Ticket.status is now TEXT, not "TicketStatus" enum).
DROP TRIGGER IF EXISTS before_ticket_live ON public."Ticket";

CREATE OR REPLACE TRIGGER before_ticket_live
  BEFORE UPDATE ON public."Ticket"
  FOR EACH ROW
  WHEN (NEW.status = 'Live' AND OLD.status IS DISTINCT FROM 'Live')
  EXECUTE FUNCTION public.capture_cycle_time();
