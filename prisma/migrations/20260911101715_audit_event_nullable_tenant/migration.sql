-- Platform-level audit events (e.g. granting/revoking Profile.isSuperAdmin)
-- belong to no tenant. Relax the NOT NULL so those rows can carry tenantId = NULL.
-- Additive and safe: existing rows already have non-null tenantId; the FK
-- (ON DELETE CASCADE) is unchanged and simply never matches a NULL.
ALTER TABLE "AuditEvent" ALTER COLUMN "tenantId" DROP NOT NULL;
