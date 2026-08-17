-- Add preferences column to Profile (was applied to production via db push,
-- never recorded as a migration).
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "preferences" JSONB NOT NULL DEFAULT '{}';
