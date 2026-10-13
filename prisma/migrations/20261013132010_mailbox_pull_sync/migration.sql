-- Pull-provider sync state for OAUTH_M365 / OAUTH_GOOGLE / IMAP mailboxes.
-- Additive, nullable columns only — existing RESEND connections are unaffected.

-- AlterTable
ALTER TABLE "MailboxConnection" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "syncCursor" JSONB,
ADD COLUMN     "syncLockedUntil" TIMESTAMP(3);
