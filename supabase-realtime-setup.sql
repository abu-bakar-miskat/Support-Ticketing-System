-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Realtime Setup  (idempotent — safe to run and re-run)
-- Run this in: Supabase Dashboard → SQL Editor
--
-- This whole script can be executed repeatedly without error. Parts of it may
-- already be applied on the shared DB (e.g. some tables are already members of
-- the supabase_realtime publication), so every step is guarded.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Add tables to the supabase_realtime publication
-- Without this, NO events are ever delivered — this is the primary requirement.
-- Postgres has no "ADD TABLE IF NOT EXISTS" for publications, so we guard each
-- add against pg_publication_tables (re-adding an existing member is a 42710 error).
do $$
declare
  t text;
begin
  foreach t in array array['Notification','Comment','Ticket','TicketAssignee','TicketMessage']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- NOTE: GitHub development activity (PRs/commits) does NOT use postgres_changes.
-- It uses Realtime *broadcast* pushed from the GitHub webhook
-- (see src/lib/github/broadcast.ts + createTicketGithubSubscription), which
-- needs no publication/replica-identity setup. Adding those tables here does
-- nothing until the Realtime service is restarted to re-read the publication,
-- which is exactly why the broadcast approach was chosen.

-- Step 2: Enable Row Level Security on each table
-- Supabase Realtime checks RLS policies before delivering events to the client.
-- ENABLE ROW LEVEL SECURITY is a no-op if already enabled (safe to re-run).
-- Note: RLS applies to the anon/authenticated roles only; server code uses the
-- service_role key which bypasses RLS, so this does not affect Prisma queries.
alter table "Notification"   enable row level security;
alter table "Comment"        enable row level security;
alter table "Ticket"         enable row level security;
alter table "TicketAssignee" enable row level security;
alter table "TicketMessage"  enable row level security;

-- Step 3: SELECT policies for the authenticated role
-- The browser client uses the user's session JWT — these policies control
-- which rows are delivered to which user.
-- Postgres has no "CREATE POLICY IF NOT EXISTS", so drop-then-create makes this
-- re-runnable. Names must match exactly for the drop to take effect.

-- Notifications: only the recipient sees their own
drop policy if exists "recipient can select own notifications" on "Notification";
create policy "recipient can select own notifications"
  on "Notification" for select to authenticated
  using (auth.uid() = "recipientId");

-- Comments: any authenticated user can read comments
drop policy if exists "authenticated can select comments" on "Comment";
create policy "authenticated can select comments"
  on "Comment" for select to authenticated
  using (true);

-- Tickets: any authenticated user can read tickets
drop policy if exists "authenticated can select tickets" on "Ticket";
create policy "authenticated can select tickets"
  on "Ticket" for select to authenticated
  using (true);

-- Co-assignees: any authenticated user can read assignments
drop policy if exists "authenticated can select ticket assignees" on "TicketAssignee";
create policy "authenticated can select ticket assignees"
  on "TicketAssignee" for select to authenticated
  using (true);

-- Ticket messages: any authenticated user can read messages
drop policy if exists "authenticated can select ticket messages" on "TicketMessage";
create policy "authenticated can select ticket messages"
  on "TicketMessage" for select to authenticated
  using (true);

-- Step 4: REPLICA IDENTITY FULL
-- Required so UPDATE/DELETE payloads carry the full old+new row.
-- Needed for our ticket status subscription (UPDATE event). Idempotent.
alter table "Notification"   replica identity full;
alter table "Comment"        replica identity full;
alter table "Ticket"         replica identity full;
alter table "TicketAssignee" replica identity full;
alter table "TicketMessage"  replica identity full;
