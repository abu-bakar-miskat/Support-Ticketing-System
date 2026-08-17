-- Add soft-delete support to Profile
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
