-- Canonical authorization model (SRS D-06), slice 01.
-- Additive: new enum + table + backfill from the existing role sources.
-- No existing rows are modified; access is unchanged for current users.

CREATE TYPE "RoleScopeType" AS ENUM ('PLATFORM', 'TENANT', 'DEPARTMENT', 'SUB_DEPARTMENT');

CREATE TABLE "RoleAssignment" (
    "id"        TEXT NOT NULL,
    "userId"    UUID NOT NULL,
    "role"      "Role" NOT NULL,
    "scopeType" "RoleScopeType" NOT NULL,
    "scopeId"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoleAssignment_userId_role_scopeType_scopeId_key"
    ON "RoleAssignment"("userId", "role", "scopeType", "scopeId");
CREATE INDEX "RoleAssignment_userId_idx" ON "RoleAssignment"("userId");
CREATE INDEX "RoleAssignment_scopeType_scopeId_idx" ON "RoleAssignment"("scopeType", "scopeId");
ALTER TABLE "RoleAssignment"
    ADD CONSTRAINT "RoleAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Backfill (idempotent: ON CONFLICT DO NOTHING) ────────────────────────────

-- Super admins → admin @ PLATFORM
INSERT INTO "RoleAssignment" ("id", "userId", "role", "scopeType", "scopeId")
SELECT gen_random_uuid()::text, p."id", 'admin'::"Role", 'PLATFORM'::"RoleScopeType", NULL
FROM "Profile" p WHERE p."isSuperAdmin" = true
ON CONFLICT DO NOTHING;

-- Tenant memberships → role @ TENANT
INSERT INTO "RoleAssignment" ("id", "userId", "role", "scopeType", "scopeId")
SELECT gen_random_uuid()::text, tm."userId", tm."role", 'TENANT'::"RoleScopeType", tm."tenantId"
FROM "TenantMembership" tm WHERE tm."isActive" = true
ON CONFLICT DO NOTHING;

-- Department managers → manager @ DEPARTMENT
INSERT INTO "RoleAssignment" ("id", "userId", "role", "scopeType", "scopeId")
SELECT gen_random_uuid()::text, dm."userId", 'manager'::"Role", 'DEPARTMENT'::"RoleScopeType", dm."departmentId"
FROM "DepartmentManager" dm
ON CONFLICT DO NOTHING;

-- Direct department members → staff @ DEPARTMENT
INSERT INTO "RoleAssignment" ("id", "userId", "role", "scopeType", "scopeId")
SELECT gen_random_uuid()::text, d."userId", 'staff'::"Role", 'DEPARTMENT'::"RoleScopeType", d."departmentId"
FROM "DepartmentMember" d
ON CONFLICT DO NOTHING;

-- Non-expired cross-department access grants → staff @ DEPARTMENT (guest)
INSERT INTO "RoleAssignment" ("id", "userId", "role", "scopeType", "scopeId")
SELECT gen_random_uuid()::text, a."userId", 'staff'::"Role", 'DEPARTMENT'::"RoleScopeType", a."departmentId"
FROM "DepartmentAccess" a WHERE a."expiresAt" IS NULL OR a."expiresAt" > now()
ON CONFLICT DO NOTHING;

-- Team memberships → role @ SUB_DEPARTMENT (team acts as the sub-department)
INSERT INTO "RoleAssignment" ("id", "userId", "role", "scopeType", "scopeId")
SELECT gen_random_uuid()::text, t."userId", t."role", 'SUB_DEPARTMENT'::"RoleScopeType", t."teamId"
FROM "TeamMembership" t WHERE t."isActive" = true
ON CONFLICT DO NOTHING;
