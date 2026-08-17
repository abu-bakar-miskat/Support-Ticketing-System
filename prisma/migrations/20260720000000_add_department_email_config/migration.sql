-- Adds a per-department email template override store, mirroring Workspace.emailConfig.
ALTER TABLE "Department" ADD COLUMN "emailConfig" JSONB;
