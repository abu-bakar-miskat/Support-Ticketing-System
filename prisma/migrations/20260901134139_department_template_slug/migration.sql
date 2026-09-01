-- Per-department template gating: remember which catalogue template a
-- department was created from (templateSlug), plus a Super-Admin-controllable
-- per-department feature allowlist (featureKeys). Both additive & nullable;
-- null featureKeys = uncontrolled (every feature visible).
ALTER TABLE "Department" ADD COLUMN "templateSlug" TEXT;
ALTER TABLE "Department" ADD COLUMN "featureKeys" JSONB;
