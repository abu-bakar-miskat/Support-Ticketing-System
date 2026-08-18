-- CreateEnum
CREATE TYPE "MailboxScopeType" AS ENUM ('DEPARTMENT', 'SUB_DEPARTMENT');

-- CreateEnum
CREATE TYPE "MailboxAuthType" AS ENUM ('RESEND', 'OAUTH_M365', 'OAUTH_GOOGLE', 'IMAP');

-- CreateEnum
CREATE TYPE "MailboxConnectionStatus" AS ENUM ('ACTIVE', 'AUTH_ERROR', 'UNREACHABLE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'mailbox_connection_failed';

-- CreateTable
CREATE TABLE "MailboxConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "scopeType" "MailboxScopeType" NOT NULL,
    "address" TEXT NOT NULL,
    "authType" "MailboxAuthType" NOT NULL DEFAULT 'RESEND',
    "credentialsRef" TEXT,
    "status" "MailboxConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "nextCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailSuppressionLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mailboxConnectionId" TEXT,
    "providerMessageId" TEXT,
    "fromEmail" TEXT,
    "toAddress" TEXT,
    "subject" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailSuppressionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailboxConnection_address_key" ON "MailboxConnection"("address");

-- CreateIndex
CREATE INDEX "MailboxConnection_tenantId_idx" ON "MailboxConnection"("tenantId");

-- CreateIndex
CREATE INDEX "MailboxConnection_departmentId_idx" ON "MailboxConnection"("departmentId");

-- CreateIndex
CREATE INDEX "MailboxConnection_teamId_idx" ON "MailboxConnection"("teamId");

-- CreateIndex
CREATE INDEX "MailboxConnection_status_idx" ON "MailboxConnection"("status");

-- CreateIndex
CREATE INDEX "MailSuppressionLog_tenantId_idx" ON "MailSuppressionLog"("tenantId");

-- CreateIndex
CREATE INDEX "MailSuppressionLog_createdAt_idx" ON "MailSuppressionLog"("createdAt");

-- AddForeignKey
ALTER TABLE "MailboxConnection" ADD CONSTRAINT "MailboxConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxConnection" ADD CONSTRAINT "MailboxConnection_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxConnection" ADD CONSTRAINT "MailboxConnection_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailSuppressionLog" ADD CONSTRAINT "MailSuppressionLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

