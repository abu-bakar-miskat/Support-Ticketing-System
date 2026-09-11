import "server-only";
import { prisma } from "@/lib/db";
import { applyTenantMembership } from "@/lib/tenant-membership";
import { runAsSystem } from "@/lib/request-scope";
import type { Role } from "@/generated/prisma/enums";
import type { LoginCookie } from "@/lib/auth/complete-login";
import { ACTIVE_TENANT_COOKIE, TENANT_COOKIE_MAX_AGE } from "@/lib/tenant-scope";
import { DEPT_SLUG_COOKIE, SUBDEPT_SLUG_COOKIE, TENANT_SLUG_COOKIE } from "@/lib/tenant-path";

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
      code: "not_found" | "expired" | "revoked" | "already_accepted" | "email_mismatch";
      message: string;
      inviteEmail?: string;
      signedInEmail?: string;
    };

const DEPT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Dashboard path for an accepted tenant-invite role. */
export function tenantInviteLandingPath(role: Role): string {
  if (role === "admin") return "/departments";
  if (role === "manager") return "/manager";
  return "/";
}

/** Cookies that activate the invited tenant / department / sub-department. */
export function tenantInviteLandingCookies(
  result: Extract<AcceptTenantInviteResult, { ok: true }>,
): LoginCookie[] {
  const cookies: LoginCookie[] = [
    {
      name: ACTIVE_TENANT_COOKIE,
      value: result.tenantId,
      options: {
        httpOnly: true,
        path: "/",
        maxAge: TENANT_COOKIE_MAX_AGE,
        sameSite: "lax",
      },
    },
  ];
  if (result.tenantSlug) {
    cookies.push({
      name: TENANT_SLUG_COOKIE,
      value: result.tenantSlug,
      options: { path: "/", maxAge: TENANT_COOKIE_MAX_AGE, sameSite: "lax" },
    });
  }
  if (result.departmentId) {
    cookies.push({
      name: "pen_active_dept",
      value: result.departmentId,
      options: {
        httpOnly: true,
        path: "/",
        maxAge: DEPT_COOKIE_MAX_AGE,
        sameSite: "lax",
      },
    });
    cookies.push({
      name: DEPT_SLUG_COOKIE,
      value: result.departmentSlug ?? "",
      options: { path: "/", maxAge: DEPT_COOKIE_MAX_AGE, sameSite: "lax" },
    });
  }
  if (result.subDepartmentId) {
    cookies.push({
      name: "pen_active_team",
      value: result.subDepartmentId,
      options: {
        httpOnly: true,
        path: "/",
        maxAge: DEPT_COOKIE_MAX_AGE,
        sameSite: "lax",
      },
    });
    cookies.push({
      name: SUBDEPT_SLUG_COOKIE,
      value: result.subDepartmentSlug ?? "",
      options: { path: "/", maxAge: DEPT_COOKIE_MAX_AGE, sameSite: "lax" },
    });
  }
  return cookies;
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
    const sub = await prisma.subDepartment.findFirst({
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
    const dept = await prisma.department.findFirst({
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
    const invite = (await prisma.tenantInvite.findUnique({
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

    if (invite.acceptedAt) {
      return successFrom(invite, scope);
    }

    await applyTenantMembership(prisma, {
      tenantId: invite.tenantId,
      userId: profile.id,
      role: invite.role as "admin" | "manager" | "sub_manager" | "agent",
      departmentIds: scope.departmentIds,
      subDepartmentId: scope.subDepartmentId,
      actorId: invite.invitedBy,
      syncRoles: false,
    });

    await prisma.tenantInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    return successFrom(invite, scope);
  });
}

/** Read-only invite details for the landing page. */
export async function getTenantInvitePreview(token: string) {
  return runAsSystem(async () => {
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
  });
}
