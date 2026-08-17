-- Departments an invite grants on accept (JSON array of department ids).
ALTER TABLE "TenantInvite" ADD COLUMN "departmentIds" JSONB;
