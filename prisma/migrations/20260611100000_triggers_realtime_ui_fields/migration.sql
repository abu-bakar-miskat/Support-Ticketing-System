-- =============================================================================
-- Part 1 — UI data alignment
-- Fields the implemented UI renders but the schema lacked.
-- =============================================================================

-- AlterTable: Ticket gains description, due date, labels, and sub-ticket parent
ALTER TABLE "Ticket" ADD COLUMN "description" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Ticket" ADD COLUMN "parentId" TEXT;

-- AlterTable: Project gains color + description (project board header)
ALTER TABLE "Project" ADD COLUMN "color" TEXT;
ALTER TABLE "Project" ADD COLUMN "description" TEXT;

-- AddForeignKey: sub-ticket self relation
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Part 2 — Indexes on hot FK columns + Mention uniqueness
-- =============================================================================

CREATE INDEX "Ticket_projectId_idx" ON "Ticket"("projectId");
CREATE INDEX "Ticket_teamId_idx" ON "Ticket"("teamId");
CREATE INDEX "Ticket_assigneeId_idx" ON "Ticket"("assigneeId");
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "Ticket_parentId_idx" ON "Ticket"("parentId");
CREATE INDEX "Comment_ticketId_idx" ON "Comment"("ticketId");
CREATE INDEX "Attachment_ticketId_idx" ON "Attachment"("ticketId");
CREATE INDEX "ActivityLog_ticketId_idx" ON "ActivityLog"("ticketId");

-- Prevent duplicate mention rows from concurrent processMentions calls
CREATE UNIQUE INDEX "Mention_commentId_mentionedUserId_key" ON "Mention"("commentId", "mentionedUserId");

-- =============================================================================
-- Part 3 — Postgres triggers (moved from prisma/triggers.sql so a clean
-- `prisma migrate deploy` produces a fully working database).
-- All functions use CREATE OR REPLACE so re-running on a DB where
-- triggers.sql was applied manually is a no-op.
-- =============================================================================

-- Trigger: per-team ticket numbering
CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_number INT;
BEGIN
  INSERT INTO public."TeamTicketCounter" ("teamId", "lastNumber")
  VALUES (NEW."teamId", 1)
  ON CONFLICT ("teamId") DO UPDATE
    SET "lastNumber" = "TeamTicketCounter"."lastNumber" + 1
  RETURNING "lastNumber" INTO next_number;

  NEW."ticketNumber" := next_number;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER before_ticket_insert
  BEFORE INSERT ON public."Ticket"
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ticket_number();

-- Trigger: activity log on status change
CREATE OR REPLACE FUNCTION public.log_ticket_status_change()
RETURNS trigger
LANGUAGE plpgsql
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

CREATE OR REPLACE TRIGGER after_ticket_status_change
  AFTER UPDATE ON public."Ticket"
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_ticket_status_change();

-- Trigger: cycle time capture on transition to Live
CREATE OR REPLACE FUNCTION public.capture_cycle_time()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  first_in_progress_at TIMESTAMPTZ;
BEGIN
  SELECT MIN("createdAt") INTO first_in_progress_at
  FROM public."ActivityLog"
  WHERE "ticketId" = NEW.id
    AND action = 'STATUS_CHANGED'::"ActivityAction"
    AND metadata->>'to' = 'InProgress';

  IF first_in_progress_at IS NOT NULL THEN
    NEW."cycleTime" := EXTRACT(EPOCH FROM (NOW() - first_in_progress_at))::INT;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER before_ticket_live
  BEFORE UPDATE ON public."Ticket"
  FOR EACH ROW
  WHEN (NEW.status = 'Live'::"TicketStatus" AND OLD.status IS DISTINCT FROM 'Live'::"TicketStatus")
  EXECUTE FUNCTION public.capture_cycle_time();

-- Trigger: profile auto-creation from Supabase auth.users.
-- Guarded — the auth schema only exists on Supabase databases, not in the
-- Prisma shadow database used by `migrate dev`.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER SET search_path = public
    AS $fn$
    BEGIN
      INSERT INTO public."Profile" (id, email, name, role, "createdAt")
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
          NEW.raw_user_meta_data->>'name',
          NEW.raw_user_meta_data->>'full_name',
          split_part(NEW.email, '@', 1)
        ),
        'developer',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END;
    $fn$;

    CREATE OR REPLACE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;

-- =============================================================================
-- Part 4 — Supabase Realtime publication (moved from prisma/realtime.sql).
-- Guarded — the publication only exists on Supabase, and the tables may
-- already be members when realtime.sql was run manually.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE "Ticket";
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE "Comment";
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$$;
