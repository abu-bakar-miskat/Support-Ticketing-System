-- Stage 2 only. Unrelated IntakeFormConfig foreign-key drift was removed.
ALTER TABLE "MailboxConnection"
  ADD COLUMN "slaFirstResponseMins" INTEGER,
  ADD COLUMN "slaResolutionMins" INTEGER;
ALTER TABLE "SlaTimer" ADD COLUMN "mailboxConfig" JSONB;
