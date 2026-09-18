-- Manual on/off switch for a mailbox connection (EM: pause ingestion without
-- deleting tickets). Additive, non-destructive: existing rows default to active.
ALTER TABLE "MailboxConnection" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
