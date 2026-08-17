-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Realtime Setup
-- Run this in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Add tables to the supabase_realtime publication
-- Without this, NO events are ever delivered — this is the primary requirement.
alter publication supabase_realtime add table "Notification";
alter publication supabase_realtime add table "Comment";
alter publication supabase_realtime add table "Ticket";
alter publication supabase_realtime add table "TicketAssignee";
alter publication supabase_realtime add table "TicketMessage";

-- NOTE: GitHub development activity (PRs/commits) does NOT use postgres_changes.
-- It uses Realtime *broadcast* pushed from the GitHub webhook
-- (see src/lib/github/broadcast.ts + createTicketGithubSubscription), which
-- needs no publication/replica-identity setup. Adding those tables here does
-- nothing until the Realtime service is restarted to re-read the publication,
-- which is exactly why the broadcast approach was chosen.

-- Step 2: Enable Row Level Security on each table
-- Supabase Realtime checks RLS policies before delivering events to the client.
alter table "Notification"  enable row level security;
alter table "Comment"       enable row level security;
alter table "Ticket"        enable row level security;
alter table "TicketAssignee" enable row level security;
alter table "TicketMessage" enable row level security;

-- Step 3: SELECT policies for the authenticated role
-- The browser client uses the user's session JWT — these policies control
-- which rows are delivered to which user.

-- Notifications: only the recipient sees their own
create policy "recipient can select own notifications"
  on "Notification" for select to authenticated
  using (auth.uid() = "recipientId");

-- Comments: any authenticated user can read comments
create policy "authenticated can select comments"
  on "Comment" for select to authenticated
  using (true);

-- Tickets: any authenticated user can read tickets
create policy "authenticated can select tickets"
  on "Ticket" for select to authenticated
  using (true);

-- Co-assignees: any authenticated user can read assignments
create policy "authenticated can select ticket assignees"
  on "TicketAssignee" for select to authenticated
  using (true);

-- Ticket messages: any authenticated user can read messages
create policy "authenticated can select ticket messages"
  on "TicketMessage" for select to authenticated
  using (true);

-- Step 4: REPLICA IDENTITY FULL
-- Required so UPDATE/DELETE payloads carry the full old+new row.
-- Needed for our ticket status subscription (UPDATE event).
alter table "Notification"  replica identity full;
alter table "Comment"       replica identity full;
alter table "Ticket"        replica identity full;
alter table "TicketAssignee" replica identity full;
alter table "TicketMessage" replica identity full;
