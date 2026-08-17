import "server-only";
import { prisma } from "@/lib/db";
import { applyTenantMembership } from "@/lib/tenant-membership";
import type { Role } from "@/generated/prisma/enums";

export type AcceptTenantInviteResult =
  | { ok: true; tenantId: string; tenantName: string; role: Role }
  | {
      ok: false;
      code: "not_found" | "expired" | "revoked" | "already_accepted" | "email_mismatch";
      message: string;
      inviteEmail?: string;
      signedInEmail?: string;
    };

/**
 * Accept a tenant invite: validate the token, then attach the signed-in user to
 * the tenant with the invited role (idempotent membership upsert). Mirrors
 * acceptDepartmentInvite one level up.
 */
export async function acceptTenantInvite(
  token: string,
  profile: { id: string; email: string },
): Promise<AcceptTenantInviteResult> {
  const invite = await prisma.tenantInvite.findUnique({
    where: { token },
    include: { tenant: { select: { id: true, name: true } } },
  });

  if (!invite) {
    return { ok: false, code: "not_found", message: "This invitation link is invalid." };
  }
  if (invite.revokedAt) {
    return { ok: false, code: "revoked", message: "This invitation has been revoked." };
  }
  if (invite.acceptedAt) {
    return { ok: false, code: "already_accepted", message: "This invitation has already been used." };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, code: "expired", message: "This invitation has expired." };
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

  const departmentIds = Array.isArray(invite.departmentIds)
    ? (invite.departmentIds as unknown[]).filter((d): d is string => typeof d === "string")
    : [];

  await prisma.$transaction(async (tx) => {
    // Grant the tenant role + department scope the invite specified. The
    // inviter is recorded as the actor for the department assignments.
    await applyTenantMembership(tx, {
      tenantId: invite.tenantId,
      userId: profile.id,
      role: invite.role as "admin" | "manager" | "lead" | "staff",
      departmentIds,
      actorId: invite.invitedBy,
    });
    await tx.tenantInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
  });

  return {
    ok: true,
    tenantId: invite.tenant.id,
    tenantName: invite.tenant.name,
    role: invite.role,
  };
}

/** Read-only invite details for the landing page (null when the link is unusable). */
export async function getTenantInvitePreview(token: string) {
  const invite = await prisma.tenantInvite.findUnique({
    where: { token },
    select: {
      email: true,
      role: true,
      acceptedAt: true,
      revokedAt: true,
      expiresAt: true,
      tenant: { select: { name: true } },
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
  return {
    tenantName: invite.tenant.name,
    email: invite.email,
    role: invite.role,
    status,
  } as const;
}
