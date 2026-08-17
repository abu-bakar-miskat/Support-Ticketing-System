-- Let status-change activity carry an optional automation source in its
-- metadata. Callers set the `app.activity_source` GUC to a JSON object (e.g.
-- {"source":"github","base":"main","event":"prMerged"}) which is merged into
-- the ActivityLog metadata. The actor still comes from `app.current_user_id`
-- (falling back to the ticket creator to satisfy the NOT NULL FK), but the UI
-- uses `metadata.source` to render automation events without a human name.

CREATE OR REPLACE FUNCTION public.log_ticket_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actor_id UUID;
  source_meta JSONB;
BEGIN
  actor_id := NULLIF(current_setting('app.current_user_id', true), '')::UUID;

  IF actor_id IS NULL THEN
    actor_id := NEW."creatorId";
  END IF;

  source_meta := COALESCE(
    NULLIF(current_setting('app.activity_source', true), '')::jsonb,
    '{}'::jsonb
  );

  INSERT INTO public."ActivityLog" (id, "ticketId", "actorId", action, metadata, "createdAt")
  VALUES (
    gen_random_uuid()::text,
    NEW.id,
    actor_id,
    'STATUS_CHANGED'::"ActivityAction",
    jsonb_build_object('from', OLD.status::text, 'to', NEW.status::text) || source_meta,
    NOW()
  );
  RETURN NEW;
END;
$$;
