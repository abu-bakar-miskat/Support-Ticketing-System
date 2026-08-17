-- Per-tenant branding + settings (absorbing the former global Workspace config).
-- Additive, nullable columns only. Then backfill: seed each tenant's config from
-- the singleton Workspace so behavior is unchanged for the existing (PEN) tenant.

ALTER TABLE "Tenant" ADD COLUMN "branding" JSONB;
ALTER TABLE "Tenant" ADD COLUMN "emailConfig" JSONB;
ALTER TABLE "Tenant" ADD COLUMN "timeTrackingConfig" JSONB;
ALTER TABLE "Tenant" ADD COLUMN "approvalsConfig" JSONB;

-- Backfill from the singleton Workspace (if one exists), only where the tenant
-- has no config yet. With a single workspace row this seeds every tenant with
-- the previous global config as its starting point.
UPDATE "Tenant" t
SET "emailConfig" = COALESCE(t."emailConfig", w."emailConfig"),
    "timeTrackingConfig" = COALESCE(t."timeTrackingConfig", w."timeTrackingConfig"),
    "approvalsConfig" = COALESCE(t."approvalsConfig", w."approvalsConfig")
FROM (SELECT * FROM "Workspace" ORDER BY "createdAt" ASC LIMIT 1) w
WHERE t."emailConfig" IS NULL
   OR t."timeTrackingConfig" IS NULL
   OR t."approvalsConfig" IS NULL;
