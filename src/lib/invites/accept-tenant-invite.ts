import "server-only";
import { getUnscopedPrisma } from "@/lib/db";
import {
  applyTenantMembership,
  findOtherTenantAdminConflict,
  TENANT_ADMIN_EXCLUSIVE_ERROR,
} from "@/lib/tenant-membership";
import { synchronizeLegacyRoleAssignments } from "@/lib/role-assignment";
import { runAsSystem } from "@/lib/request-scope";
import type { Role } from "@/generated/prisma/enums";
import type { LoginCookie } from "@/lib/auth/complete-login";
import { inviteLandingCookies, inviteLandingPath } from "@/lib/invites/invite-landing";

export type AcceptTenantInviteResult =
  | {
      ok: true;
      tenantId: string;
      tenantName: string;
      tenantSlug: string | null;
      role: Role;
      departmentId: string | null;
      departmentSlug: string | null;
      subDepartmentId: string | null;
      subDepartmentSlug: string | null;
    }
  | {
      ok: false;
      code:
        | "not_found"
        | "expired"
        | "revoked"
        | "already_accepted"
        | "email_mismatch"
        | "tenant_admin_exclusive";
      message: string;
      inviteEmail?: string;
      signedInEmail?: string;
    };

/** Dashboard path for an accepted tenant-invite role. */
export function tenantInviteLandingPath(
  result: Extract<AcceptTenantInviteResult, { ok: true }>,
): string {
  return inviteLandingPath(result.role, result);
}

/** Cookies that activate the invited tenant / department / sub-department. */
export function tenantInviteLandingCookies(
  result: Extract<AcceptTenantInviteResult, { ok: true }>,
): LoginCookie[] {
  return inviteLandingCookies(result);
}

type InviteRow = {
  id: string;
  email: string;
  role: Role;
  tenantId: string;
  departmentIds: unknown;
  subDepartmentId: string | null;
  invitedBy: string;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  tenant: { id: string; name: string; slug: string };
};

async function resolveInviteScope(invite: InviteRow): Promise<{
  departmentIds: string[];
  departmentId: string | null;
  departmentSlug: string | null;
  subDepartmentId: string | null;
  subDepartmentSlug: string | null;
}> {
  const departmentIds = Array.isArray(invite.departmentIds)
    ? (invite.departmentIds as unknown[]).filter((d): d is string => typeof d === "string")
    : [];

  let departmentId: string | null = null;
  let departmentSlug: string | null = null;
  let subDepartmentId: string | null = invite.subDepartmentId ?? null;
  let subDepartmentSlug: string | null = null;

  if (subDepartmentId) {
    const db = getUnscopedPrisma();
    const sub = await db.subDepartment.findFirst({
      where: { id: subDepartmentId, tenantId: invite.tenantId },
      select: {
        id: true,
        slug: true,
        departmentId: true,
        department: { select: { slug: true } },
      },
    });
    if (sub) {
      departmentId = sub.departmentId;
      departmentSlug = sub.department.slug;
      subDepartmentSlug = sub.slug;
    } else {
      subDepartmentId = null;
    }
  } else if (departmentIds[0]) {
    const db = getUnscopedPrisma();
    const dept = await db.department.findFirst({
      where: { id: departmentIds[0], tenantId: invite.tenantId },
      select: { id: true, slug: true },
    });
    if (dept) {
      departmentId = dept.id;
      departmentSlug = dept.slug;
    }
  }

  return { departmentIds, departmentId, departmentSlug, subDepartmentId, subDepartmentSlug };
}

function successFrom(
  invite: InviteRow,
  scope: Awaited<ReturnType<typeof resolveInviteScope>>,
): Extract<AcceptTenantInviteResult, { ok: true }> {
  return {
    ok: true,
    tenantId: invite.tenant.id,
    tenantName: invite.tenant.name,
    tenantSlug: invite.tenant.slug,
    role: invite.role,
    departmentId: scope.departmentId,
    departmentSlug: scope.departmentSlug,
    subDepartmentId: scope.subDepartmentId,
    subDepartmentSlug: scope.subDepartmentSlug,
  };
}

/**
 * Accept a tenant invite and attach the signed-in user with the invited role
 * + department / sub-department scope.
 *
 * All DB work runs under `runAsSystem`. Without that, every query on
 * TenantInvite / TenantMembership / SubDepartment hits the Prisma scope
 * extension → getProfile → RoleAssignment interactive $transaction, which
 * deadlocks the Supabase pooler and hangs OTP verify for minutes.
 */
export async function acceptTenantInvite(
  token: string,
  profile: { id: string; email: string },
): Promise<AcceptTenantInviteResult> {
  return runAsSystem(async () => {
    const t0 = Date.now();
    console.info("[acceptTenantInvite] start");
    const db = getUnscopedPrisma();
    const invite = (await db.tenantInvite.findUnique({
      where: { token },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    })) as InviteRow | null;

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

    const scope = await resolveInviteScope(invite);
    console.info(`[acceptTenantInvite] loaded+scoped ${Date.now() - t0}ms`);

    if (invite.acceptedAt) {
      return successFrom(invite, scope);
    }

    if (invite.role === "admin") {
      const conflict = await findOtherTenantAdminConflict(db, profile.id, invite.tenantId);
      if (conflict) {
        return {
          ok: false,
          code: "tenant_admin_exclusive",
          message: TENANT_ADMIN_EXCLUSIVE_ERROR,
        };
      }
    }

    // One transaction = one connection checkout for the whole accept. As
    // separate top-level calls, each of the ~8 writes below re-queued for a free
    // connection, so two or three concurrent dashboard renders were enough to
    // stretch accept past two minutes and stall OTP verify behind it.
    //
    // Syncing RoleAssignment in here (instead of leaving it to a follow-up
    // syncUserRoleAssignments) also means every entry point — the login callback
    // and /api/tenant-invites/[token]/accept alike — leaves the invitee with
    // populated scope rows, and costs no extra FOR UPDATE transaction.
    await db.$transaction(async (tx) => {
      // Serialize against a concurrent resolveUserScope rebuild for this user;
      // it deletes and recreates these same rows, which races to P2002.
      await tx.$executeRaw`SELECT "id" FROM "Profile" WHERE "id" = ${profile.id} FOR UPDATE`;

      await applyTenantMembership(tx, {
        tenantId: invite.tenantId,
        userId: profile.id,
        role: invite.role as "admin" | "manager" | "sub_manager" | "agent",
        departmentIds: scope.departmentIds,
        subDepartmentId: scope.subDepartmentId,
        actorId: invite.invitedBy,
        // Sync explicitly below rather than letting applyTenantMembership pick a
        // strategy from `"$connect" in db` — on a transaction client that guess
        // must land on the in-transaction variant, because the alternative opens
        // a second transaction needing a second connection while this one is
        // pinned, which is the deadlock this whole function exists to avoid.
        syncRoles: false,
      });
      await synchronizeLegacyRoleAssignments(tx, profile.id);

      await tx.tenantInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
    });
    console.info(`[acceptTenantInvite] committed ${Date.now() - t0}ms`);

    return successFrom(invite, scope);
  });
}

/** Read-only invite details for the landing page. */
export async function getTenantInvitePreview(token: string) {
  return runAsSystem(async () => {
    const invite = await getUnscopedPrisma().tenantInvite.findUnique({
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
  });
}
