-- Pending super-admin invitations. The auth user and Profile are created
-- only when the invitee accepts, not when this row is inserted.

CREATE TABLE "SuperAdminInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),

    CONSTRAINT "SuperAdminInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SuperAdminInvite_token_key" ON "SuperAdminInvite"("token");

CREATE INDEX "SuperAdminInvite_email_idx" ON "SuperAdminInvite"("email");

CREATE INDEX "SuperAdminInvite_expiresAt_idx" ON "SuperAdminInvite"("expiresAt");

ALTER TABLE "SuperAdminInvite" ADD CONSTRAINT "SuperAdminInvite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
