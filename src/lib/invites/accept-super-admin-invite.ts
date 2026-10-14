import "server-only";
import { getUnscopedPrisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit-log";
import { synchronizeLegacyRoleAssignments } from "@/lib/role-assignment";
import { runAsSystem } from "@/lib/request-scope";

export type AcceptSuperAdminInviteResult =
  | { ok: true }
  | {
      ok: false;
      code: "not_found" | "expired" | "revoked" | "email_mismatch";
      message: string;
      inviteEmail?: string;
      signedInEmail?: string;
    };

/** Read-only invite details for the landing page. */
export async function getSuperAdminInvitePreview(token: string) {
  return runAsSystem(async () => {
    const invite = await getUnscopedPrisma().superAdminInvite.findUnique({
      where: { token },
      select: {
        email: true,
        acceptedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (!invite) return null;
    const status = invite.revokedAt
      ? "revoked"
      : invite.acceptedAt
        ? "already_accepted"
        : invite.expiresAt.getTime() < Date.now()
          ? "expired"
          : "valid";
    return { email: invite.email, status } as const;
  });
}

/**
 * Mark a super-admin invite accepted and grant Profile.isSuperAdmin.
 * The Profile must already exist — it is created by sign-in during accept,
 * never when the invitation email is sent.
 */
export async function acceptSuperAdminInvite(
  token: string,
  profile: { id: string; email: string },
): Promise<AcceptSuperAdminInviteResult> {
  return runAsSystem(async () => {
    const db = getUnscopedPrisma();
    const invite = await db.superAdminInvite.findUnique({ where: { token } });

    if (!invite) {
      return { ok: false, code: "not_found", message: "This invitation link is invalid." };
    }
    if (invite.revokedAt) {
      return { ok: false, code: "revoked", message: "This invitation has been revoked." };
    }
    if (invite.email.toLowerCase() !== profile.email.toLowerCase()) {
      return {
        ok: false,
        code: "email_mismatch",
        message: "This invitation was sent to a different email address.",
        inviteEmail: invite.email,
        signedInEmail: profile.email,
      };
    }
    if (invite.expiresAt.getTime() < Date.now() && !invite.acceptedAt) {
      return { ok: false, code: "expired", message: "This invitation has expired." };
    }
    if (invite.acceptedAt) return { ok: true };

    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT "id" FROM "Profile" WHERE "id" = ${profile.id} FOR UPDATE`;
      await tx.profile.update({
        where: { id: profile.id },
        data: { isSuperAdmin: true, role: "admin", isActive: true },
      });
      await synchronizeLegacyRoleAssignments(tx, profile.id);
      await tx.superAdminInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      await recordAuditEvent({
        tenantId: null,
        actorId: invite.invitedBy,
        action: "SUPER_ADMIN_GRANTED",
        targetType: "Profile",
        targetId: profile.id,
        before: { isSuperAdmin: false },
        after: { isSuperAdmin: true },
        client: tx,
      });
    });

    return { ok: true };
  });
}
