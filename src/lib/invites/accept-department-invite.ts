import "server-only";
import { getUnscopedPrisma } from "@/lib/db";
import { synchronizeLegacyRoleAssignments } from "@/lib/role-assignment";
import { runAsSystem } from "@/lib/request-scope";
import type { Role } from "@/generated/prisma/enums";
import type { LoginCookie } from "@/lib/auth/complete-login";
import { inviteLandingCookies, inviteLandingPath } from "@/lib/invites/invite-landing";

export type AcceptInviteResult =
  | {
      ok: true;
      tenantId: string;
      tenantSlug: string | null;
      departmentId: string;
      departmentName: string;
      departmentSlug: string | null;
      subDepartmentId: string;
      subDepartmentName: string;
      subDepartmentSlug: string | null;
      role: Role;
    }
  | {
      ok: false;
      code:
        | "not_found"
        | "expired"
        | "revoked"
        | "already_accepted"
        | "email_mismatch";
      message: string;
      inviteEmail?: string;
      signedInEmail?: string;
    };

/**
 * Dashboard path for an accepted department-invite role. Department invites
 * only carry `agent` / `sub_manager`; both land on the ticket board with the
 * active department/sub-department cookies set below.
 */
export function departmentInviteLandingPath(
  result: Extract<AcceptInviteResult, { ok: true }>,
): string {
  return inviteLandingPath(result.role, result);
}

/** Cookies that activate the invited tenant / department / sub-department. */
export function departmentInviteLandingCookies(
  result: Extract<AcceptInviteResult, { ok: true }>,
): LoginCookie[] {
  return inviteLandingCookies(result);
}

export async function acceptDepartmentInvite(
  token: string,
  profile: { id: string; email: string },
): Promise<AcceptInviteResult> {
  // Self-scoping (rather than trusting each caller to wrap the call) so the
  // route handler and the login callback behave identically: without a system
  // scope the reads below would resolve scope via getProfile, whose
  // RoleAssignment rebuild contends for the same small connection pool.
  return runAsSystem(() => acceptDepartmentInviteInner(token, profile));
}

async function acceptDepartmentInviteInner(
  token: string,
  profile: { id: string; email: string },
): Promise<AcceptInviteResult> {
  const db = getUnscopedPrisma();
  const invite = await db.departmentInvite.findUnique({
    where: { token },
    include: {
      department: {
        select: {
          id: true,
          name: true,
          slug: true,
          tenantId: true,
          tenant: { select: { slug: true } },
        },
      },
      subDepartment: {
        select: { id: true, name: true, slug: true, departmentId: true },
      },
    },
  });

  if (!invite) {
    return { ok: false, code: "not_found", message: "This invitation link is invalid." };
  }
  if (invite.revokedAt) {
    return { ok: false, code: "revoked", message: "This invitation has been revoked." };
  }

  const signedInEmail = profile.email.trim().toLowerCase();
  const inviteEmail = invite.email.trim().toLowerCase();
  if (signedInEmail !== inviteEmail) {
    return {
      ok: false,
      code: "email_mismatch",
      message: `You're signed in as ${profile.email}, but this invitation was sent to ${invite.email}.`,
      inviteEmail: invite.email,
      signedInEmail: profile.email,
    };
  }
  if (invite.expiresAt.getTime() < Date.now() && !invite.acceptedAt) {
    return { ok: false, code: "expired", message: "This invitation has expired." };
  }

  if (invite.acceptedAt) {
    return {
      ok: true,
      tenantId: invite.department.tenantId,
      tenantSlug: invite.department.tenant.slug,
      departmentId: invite.department.id,
      departmentName: invite.department.name,
      departmentSlug: invite.department.slug,
      subDepartmentId: invite.subDepartment.id,
      subDepartmentName: invite.subDepartment.name,
      subDepartmentSlug: invite.subDepartment.slug,
      role: invite.role,
    };
  }

  if (invite.subDepartment.departmentId !== invite.departmentId) {
    return { ok: false, code: "not_found", message: "This invitation link is invalid." };
  }

  await db.$transaction(async (tx) => {
    // Take the per-user Profile lock up front, the same order
    // rebuildUserRoleAssignments uses, so this transaction and a concurrent
    // scope rebuild can never grab these rows in opposite orders.
    await tx.$executeRaw`SELECT "id" FROM "Profile" WHERE "id" = ${profile.id} FOR UPDATE`;

    // Scope the user to the department's tenant so activeTenantId resolves and
    // every tenant-scoped query returns their data. Baseline role is `agent`;
    // their real power comes from the department/sub-department scope below.
    // Never downgrade an existing membership — only reactivate it.
    await tx.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: invite.department.tenantId, userId: profile.id } },
      create: {
        tenantId: invite.department.tenantId,
        userId: profile.id,
        role: "agent",
        isActive: true,
      },
      update: { isActive: true },
    });

    // Membership is sub-department-scoped. Whole-department access is for managers only.

    await (tx.subDepartmentMembership as any).upsert({
      where: { userId_subDepartmentId: { userId: profile.id, subDepartmentId: invite.subDepartmentId } },
      create: {
        userId: profile.id,
        subDepartmentId: invite.subDepartmentId,
        role: invite.role,
        isActive: true,
      },
      update: { role: invite.role, isActive: true },
    });

    await tx.profile.updateMany({
      where: { id: profile.id, subDepartmentId: null },
      data: { subDepartmentId: invite.subDepartmentId },
    });

    await tx.departmentInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    // Close any pending join requests for this user targeting the same subDepartment or department
    await tx.joinRequest.updateMany({
      where: {
        userId: profile.id,
        status: "pending",
        OR: [{ subDepartmentId: invite.subDepartmentId }, { departmentId: invite.departmentId }],
      },
      data: {
        status: "approved",
        processedAt: new Date(),
        processedBy: invite.invitedBy,
      },
    });

    // Rebuild the invitee's canonical scope rows from the memberships just
    // written, in this same transaction. Left to the first dashboard render it
    // runs as its own interactive transaction (via resolveUserScope) that has to
    // win a second connection from an already-contended pool.
    await synchronizeLegacyRoleAssignments(tx, profile.id);
  });

  return {
    ok: true,
    tenantId: invite.department.tenantId,
    tenantSlug: invite.department.tenant.slug,
    departmentId: invite.department.id,
    departmentName: invite.department.name,
    departmentSlug: invite.department.slug,
    subDepartmentId: invite.subDepartment.id,
    subDepartmentName: invite.subDepartment.name,
    subDepartmentSlug: invite.subDepartment.slug,
    role: invite.role,
  };
}

export async function getInvitePreview(token: string) {
  const invite = await getUnscopedPrisma().departmentInvite.findUnique({
    where: { token },
    select: {
      email: true,
      role: true,
      message: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      department: { select: { id: true, name: true } },
      subDepartment: { select: { id: true, name: true } },
      inviter: { select: { name: true } },
    },
  });
  return invite;
}
