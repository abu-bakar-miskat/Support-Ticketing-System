ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "projectUrl"       TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "analyticalLinks"  JSONB DEFAULT '[]';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "guidelines"       TEXT;
