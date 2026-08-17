-- Additive: custom lifecycle stages (nullable JSONB, no drops)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "lifecycleStages" JSONB;
