-- Ticket #23 (D-02, C-01): RLS hardening — non-owner role + per-request GUC.
-- Defense-in-depth alongside the mandatory Prisma scope extension
-- (lib/prisma-scope.ts, ticket #02) — this does NOT replace it.
--
-- The app continues connecting as the `postgres` owner role, which bypasses
-- RLS by default (Postgres exempts table owners/superusers unless FORCE ROW
-- LEVEL SECURITY is added — deliberately NOT added here). So this migration
-- has ZERO effect on the running app or any teammate's session; it only
-- takes effect once a deliberate future cutover switches the connection to
-- app_rls_user. See lib/rls-guc.ts for the per-request GUC helper.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls_user') THEN
    CREATE ROLE app_rls_user NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_rls_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "TenantMembership",
  "TenantInvite",
  "Department",
  "Team",
  "BoardColumn",
  "Project",
  "Ticket",
  "MailboxConnection",
  "MailSuppressionLog",
  "SlaPolicy",
  "AssignmentRule",
  "BulkReassignJob",
  "ReportExportJob",
  "FeatureFlag",
  "AuditEvent",
  "Agreement",
  "SlaTimer",
  "SlaBreach"
TO app_rls_user;

-- Per table: enable RLS + a tenant-keyed policy. current_setting(_, true)
-- returns NULL when the GUC hasn't been set, so an un-guarded connection
-- (no app.tenant_id) sees zero rows from app_rls_user — fail-closed by
-- construction. The app.is_platform_admin escape hatch mirrors the
-- app-layer super-admin bypass already in lib/role-assignment.ts.

ALTER TABLE "TenantMembership" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantMembership"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "TenantInvite" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantInvite"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Department"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Team"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "BoardColumn" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BoardColumn"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Project"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Ticket"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "MailboxConnection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MailboxConnection"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "MailSuppressionLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MailSuppressionLog"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "SlaPolicy" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SlaPolicy"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "AssignmentRule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AssignmentRule"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "BulkReassignJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BulkReassignJob"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "ReportExportJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ReportExportJob"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "FeatureFlag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeatureFlag"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditEvent"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "Agreement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Agreement"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "SlaTimer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SlaTimer"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "SlaBreach" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SlaBreach"
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.is_platform_admin', true) = 'true');
