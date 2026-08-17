-- Additive: project lifecycle stage dates (all nullable, no drops/backfill)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "pipelineStartedAt"    TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "developmentStartedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "liveAt"               TIMESTAMP(3);
