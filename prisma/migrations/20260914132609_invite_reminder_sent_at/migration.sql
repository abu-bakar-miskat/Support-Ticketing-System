-- Additive, nullable columns tracking when the 24h "invite still pending"
-- reminder email was sent, so the reminder sweep fires exactly once per invite.
ALTER TABLE "TenantInvite" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
ALTER TABLE "DepartmentInvite" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
