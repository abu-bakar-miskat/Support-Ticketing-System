-- Tenant foundation (issue #89), step 2 of 2: backfill existing data into a
-- single seed tenant ("PEN"), then tighten tenantId to NOT NULL.
-- Run ONLY after 20260814120000_add_tenant_foundation is applied.
-- Idempotent: safe to re-run (uses ON CONFLICT / IS NULL guards).

-- ─── Seed tenant that owns all currently-existing data ───────────────────────
INSERT INTO "Tenant" ("id", "slug", "name", "status", "createdAt")
VALUES (gen_random_uuid()::text, 'pen', 'PEN', 'active', now())
ON CONFLICT ("slug") DO NOTHING;

-- ─── Point every existing row at the PEN tenant ──────────────────────────────
UPDATE "Department" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'pen') WHERE "tenantId" IS NULL;
UPDATE "Team"       SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'pen') WHERE "tenantId" IS NULL;
UPDATE "Project"    SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'pen') WHERE "tenantId" IS NULL;
UPDATE "Ticket"     SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'pen') WHERE "tenantId" IS NULL;

-- ─── Every existing profile becomes a PEN member, carrying its current role ───
INSERT INTO "TenantMembership" ("id", "tenantId", "userId", "role", "isActive", "createdAt")
SELECT gen_random_uuid()::text,
       (SELECT "id" FROM "Tenant" WHERE "slug" = 'pen'),
       p."id",
       p."role",
       true,
       now()
FROM "Profile" p
ON CONFLICT ("tenantId", "userId") DO NOTHING;

-- ─── Bootstrap the first platform super-admin ────────────────────────────────
-- CONFIRM THIS EMAIL before applying. Change it to whoever should hold
-- all-tenant control. Add more UPDATE lines for additional super-admins.
UPDATE "Profile" SET "isSuperAdmin" = true WHERE "email" = 'abu.bakar@penglobalbd.com';

-- ─── Guard: no row may be left without a tenant before the NOT NULL flip ──────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Department" WHERE "tenantId" IS NULL)
     OR EXISTS (SELECT 1 FROM "Team"    WHERE "tenantId" IS NULL)
     OR EXISTS (SELECT 1 FROM "Project" WHERE "tenantId" IS NULL)
     OR EXISTS (SELECT 1 FROM "Ticket"  WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'Backfill incomplete: NULL tenantId rows remain; aborting NOT NULL.';
  END IF;
END $$;

-- ─── Tighten to NOT NULL now that every row has a tenant ──────────────────────
ALTER TABLE "Department" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Team"       ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Project"    ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Ticket"     ALTER COLUMN "tenantId" SET NOT NULL;
