-- Tenant-level SLA defaults: a SlaPolicy with a null departmentId is a
-- tenant-wide default; departments with their own policies override it.
ALTER TABLE "SlaPolicy" ALTER COLUMN "departmentId" DROP NOT NULL;
