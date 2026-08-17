-- Tenant foundation (issue #89), step 1 of 2: additive DDL only.
-- New tables + NULLABLE tenantId columns + indexes + FKs. Nothing is dropped.
-- Backfill and the NOT NULL tightening happen in the next migration, so the
-- shared DB is never left with a required column the data cannot satisfy.

-- ─── New tables ──────────────────────────────────────────────────────────────
CREATE TABLE "Tenant" (
    "id"        TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "status"    TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

CREATE TABLE "TenantMembership" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "userId"    UUID NOT NULL,
    "role"      "Role" NOT NULL DEFAULT 'staff',
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");
CREATE INDEX "TenantMembership_tenantId_idx" ON "TenantMembership"("tenantId");
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");

CREATE TABLE "TenantInvite" (
    "id"         TEXT NOT NULL,
    "token"      TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "role"       "Role" NOT NULL DEFAULT 'staff',
    "message"    TEXT,
    "invitedBy"  UUID NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt"  TIMESTAMP(3),
    CONSTRAINT "TenantInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantInvite_token_key" ON "TenantInvite"("token");
CREATE INDEX "TenantInvite_tenantId_idx" ON "TenantInvite"("tenantId");
CREATE INDEX "TenantInvite_email_idx" ON "TenantInvite"("email");
CREATE INDEX "TenantInvite_expiresAt_idx" ON "TenantInvite"("expiresAt");

-- ─── Additive columns on existing tables (NULLABLE for now) ───────────────────
ALTER TABLE "Department" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Team"       ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Project"    ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Ticket"     ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Profile"    ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Department_tenantId_idx" ON "Department"("tenantId");
CREATE INDEX "Team_tenantId_idx"       ON "Team"("tenantId");
CREATE INDEX "Project_tenantId_idx"    ON "Project"("tenantId");
CREATE INDEX "Ticket_tenantId_idx"     ON "Ticket"("tenantId");

-- ─── Foreign keys ────────────────────────────────────────────────────────────
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey"   FOREIGN KEY ("userId")   REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantInvite"     ADD CONSTRAINT "TenantInvite_tenantId_fkey"     FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantInvite"     ADD CONSTRAINT "TenantInvite_invitedBy_fkey"    FOREIGN KEY ("invitedBy") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Department"       ADD CONSTRAINT "Department_tenantId_fkey"       FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Team"             ADD CONSTRAINT "Team_tenantId_fkey"             FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project"          ADD CONSTRAINT "Project_tenantId_fkey"          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket"           ADD CONSTRAINT "Ticket_tenantId_fkey"           FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
