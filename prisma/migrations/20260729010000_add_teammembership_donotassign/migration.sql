-- Track TeamMembership.doNotAssign in migration history.
-- The column already exists on environments where it was created via `prisma db push`,
-- so this is written idempotently (IF NOT EXISTS) to be safe on both drifted and fresh DBs.
ALTER TABLE "TeamMembership" ADD COLUMN IF NOT EXISTS "doNotAssign" BOOLEAN NOT NULL DEFAULT false;
