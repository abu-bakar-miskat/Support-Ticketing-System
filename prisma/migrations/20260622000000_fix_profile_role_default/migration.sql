-- 'lead' and 'staff' were added to production via prisma db push but were never
-- recorded in a migration, so the shadow database is missing them.
-- ADD VALUE IF NOT EXISTS is a no-op when the value already exists (production).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'lead';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'staff';

-- Fix: the initial migration set Profile.role DEFAULT 'developer' and
-- TeamMembership.role DEFAULT 'viewer' — both no longer valid enum values.
-- Update them to match the Prisma schema (@default(staff)).
ALTER TABLE "Profile" ALTER COLUMN "role" SET DEFAULT 'staff';
ALTER TABLE "TeamMembership" ALTER COLUMN "role" SET DEFAULT 'staff';
