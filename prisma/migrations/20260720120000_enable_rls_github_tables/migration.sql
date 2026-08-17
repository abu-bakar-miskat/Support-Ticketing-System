-- Enable Row Level Security on the GitHub integration tables.
-- Policies already exist on these tables but were inert because RLS was off,
-- which the Supabase Security Advisor flags as CRITICAL ("Policy Exists RLS
-- Disabled"): the auto-generated PostgREST API could expose the rows.
--
-- These tables are only ever accessed server-side via Prisma (the GitHub
-- webhook + PR upsert paths). Prisma connects as the database owner /
-- service role, which bypasses RLS, so enabling it does not affect the app --
-- it only closes the public API access path.
ALTER TABLE "GitHubCommit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GitHubPullRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketPullRequest" ENABLE ROW LEVEL SECURITY;
