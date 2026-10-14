-- Tenant-level (send-only) Microsoft 365 mailboxes. Non-destructive: adds an
-- enum value and relaxes two NOT NULL constraints; existing rows are untouched.

-- AlterEnum
ALTER TYPE "MailboxScopeType" ADD VALUE 'TENANT';

-- AlterTable
ALTER TABLE "MailboxConnection" ALTER COLUMN "departmentId" DROP NOT NULL,
ALTER COLUMN "teamId" DROP NOT NULL;
