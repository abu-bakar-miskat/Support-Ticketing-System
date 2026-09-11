import "server-only";
import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { acceptDepartmentInvite } from "@/lib/invites/accept-department-invite";
import {
  ACTIVE_TENANT_COOKIE,
  TENANT_COOKIE_MAX_AGE,
} from "@/lib/tenant-scope";
import { TENANT_SLUG_COOKIE, DEPT_SLUG_COOKIE } from "@/lib/tenant-path";
import { loginBlockReason } from "@/lib/tenant-lifecycle";
import { resolvePostLoginLanding } from "@/lib/auth/post-login-redirect";

const AUTH_NEXT_COOKIE = "pen_auth_next";

export type LoginCookie = {
  name: string;
  value: string;
  options: {
    httpOnly?: boolean;
    path?: string;
    maxAge?: number;
    sameSite?: "lax" | "strict" | "none";
  };
};

/**
 * Result of finishing a login: the path to redirect to plus every cookie the
 * caller must set on its response (auth-next is always cleared here).
 */
export type CompleteLoginResult = {
  redirectPath: string;
  cookies: LoginCookie[];
};

const clearNextCookie: LoginCookie = {
  name: AUTH_NEXT_COOKIE,
  value: "",
  options: { path: "/", maxAge: 0 },
};

async function tenantCookie(tenantId: string | null): Promise<LoginCookie[]> {
  if (!tenantId) return [];
  const cookies: LoginCookie[] = [
    {
      name: ACTIVE_TENANT_COOKIE,
      value: tenantId,
      options: {
        httpOnly: true,
        path: "/",
        maxAge: TENANT_COOKIE_MAX_AGE,
        sameSite: "lax",
      },
    },
  ];
  // Mirror the slug so middleware can show the tenant in the URL without a lookup.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });
  if (tenant?.slug) {
    cookies.push({
      name: TENANT_SLUG_COOKIE,
      value: tenant.slug,
      options: { path: "/", maxAge: TENANT_COOKIE_MAX_AGE, sameSite: "lax" },
    });
  }
  return cookies;
}

/**
 * Resolve the tenant to make active on login: the user's first active
 * membership, or (for a super-admin with no membership) the oldest tenant so
 * they always land somewhere.
 */
async function resolveLoginTenantId(
  userId: string,
  isSuperAdmin: boolean,
): Promise<string | null> {
  // TenantMembership is scoped — without runAsSystem this triggers
  // resolveTicketScope → getProfile → RoleAssignment $transaction and
  // can hang OTP verify for minutes on the shared Supabase pooler.
  const { runAsSystem } = await import("@/lib/request-scope");
  const membership = await runAsSystem(() =>
    prisma.tenantMembership.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { tenantId: true },
    }),
  );
  if (membership) return membership.tenantId;
  if (!isSuperAdmin) return null;
  const first = await prisma.tenant.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

function inviteTokenFromNext(next: string): string | null {
  const match = /^\/invite\/([^/?#]+)/.exec(next);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function tenantInviteTokenFromNext(next: string): string | null {
  const match = /^\/tenant-invite\/([^/?#]+)/.exec(next);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Shared post-verification login flow used by the OAuth and magic-link
 * callback round-trips. Reconciles the profile, rejects
 * blocked/suspended accounts, resolves the active tenant, accepts a pending
 * department invite, and returns the destination plus the cookies to set.
 *
 * Callers must apply `result.cookies` to whatever response mechanism they use
 * (NextResponse in a route handler, or the cookie store in a server action).
 */
export async function completeLogin(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  next: string;
}): Promise<CompleteLoginResult> {
  const { supabase, user, next } = args;
  const t0 = Date.now();
  const tenantInviteToken = tenantInviteTokenFromNext(next);
  const inviteToken = inviteTokenFromNext(next);

  const { reconcileProfileOnLogin } =
    await import("@/lib/reconcile-profile-on-login");
  await reconcileProfileOnLogin(user, {
    // Invite signup attaches the real tenant; seeding "pen" first just adds
    // extra scoped writes that used to hang verify.
    skipDefaultTenant: Boolean(tenantInviteToken || inviteToken),
  }).catch((err) => {
    console.error("[completeLogin] profile reconcile failed:", err);
  });
  console.info(`[completeLogin] reconcile ${Date.now() - t0}ms`);

  // Prefer DB profile email (source of truth after reconcile) for invite matching
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, isSuperAdmin: true },
  });
  if (!profile) {
    return { redirectPath: next, cookies: [clearNextCookie] };
  }

  // SA-01/SA-03: reject sign-in when the user is individually restricted or
  // their tenant is suspended/soft-deleted — and sign the fresh session back
  // out so it doesn't linger client-side.
  const tBlock = Date.now();
  const reason = await loginBlockReason(profile.id);
  console.info(`[completeLogin] loginBlockReason ${Date.now() - tBlock}ms`);
  if (reason) {
    await supabase.auth.signOut();
    return {
      redirectPath: `/login?error=${encodeURIComponent(reason)}`,
      cookies: [clearNextCookie],
    };
  }

  const tTenant = Date.now();
  const tenantId = await resolveLoginTenantId(profile.id, profile.isSuperAdmin);
  console.info(`[completeLogin] resolveLoginTenantId ${Date.now() - tTenant}ms`);

  if (inviteToken) {
    const { runAsSystem } = await import("@/lib/request-scope");
    const result = await runAsSystem(() =>
      acceptDepartmentInvite(inviteToken, {
        id: profile.id,
        email: profile.email,
      }),
    );
    if (result.ok) {
      const invitedDept = await runAsSystem(() =>
        prisma.department.findUnique({
          where: { id: result.departmentId },
          select: { slug: true },
        }),
      );
      return {
        redirectPath: "/",
        cookies: [
          clearNextCookie,
          ...(await tenantCookie(tenantId)),
          {
            name: "pen_active_dept",
            value: result.departmentId,
            options: {
              httpOnly: true,
              path: "/",
              maxAge: 60 * 60 * 24 * 30,
              sameSite: "lax",
            },
          },
          {
            name: DEPT_SLUG_COOKIE,
            value: invitedDept?.slug ?? "",
            options: { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" },
          },
        ],
      };
    }
    // Surface the accept error on the invite page instead of dumping into onboarding
    return {
      redirectPath: `/invite/${encodeURIComponent(inviteToken)}?error=${encodeURIComponent(result.code)}`,
      cookies: [clearNextCookie],
    };
  }

  if (tenantInviteToken) {
    const tAccept = Date.now();
    const {
      acceptTenantInvite,
      tenantInviteLandingCookies,
      tenantInviteLandingPath,
    } = await import("@/lib/invites/accept-tenant-invite");
    const result = await acceptTenantInvite(tenantInviteToken, {
      id: profile.id,
      email: profile.email,
    });
    console.info(`[completeLogin] acceptTenantInvite ${Date.now() - tAccept}ms`);
    if (result.ok) {
      // Warm RoleAssignment before the dashboard's first getProfile → resolveUserScope
      // so the soft-nav / hard-nav destination doesn't open a long interactive
      // $transaction on a contended pooler.
      const { syncUserRoleAssignments } = await import("@/lib/role-assignment");
      const tSync = Date.now();
      await syncUserRoleAssignments(profile.id).catch((err) => {
        console.error("[completeLogin] role sync after tenant invite failed:", err);
      });
      console.info(`[completeLogin] syncUserRoleAssignments ${Date.now() - tSync}ms`);
      return {
        redirectPath: tenantInviteLandingPath(result.role),
        cookies: [clearNextCookie, ...tenantInviteLandingCookies(result)],
      };
    }
    return {
      redirectPath: `/tenant-invite/${encodeURIComponent(tenantInviteToken)}?error=${encodeURIComponent(result.code)}`,
      cookies: [clearNextCookie],
    };
  }

  // No explicit /invite/<token> deep link: still consume any pending invite
  // addressed to this email so an invited user becomes a member however they
  // signed in — typing their email directly, an already-open session, or a mail
  // gateway (Safe Links) that mangled the invite link. Without this they land on
  // /onboarding despite holding a valid invite. Accepting here means the landing
  // resolution below finds the fresh sub-department membership and routes to the
  // board. Best-effort: a failed accept just falls through to normal landing.
  if (!inviteToken && !tenantInviteToken) {
    const pending = await prisma.departmentInvite.findFirst({
      where: {
        email: { equals: profile.email, mode: "insensitive" },
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { token: true },
    });
    if (pending) {
      const { runAsSystem } = await import("@/lib/request-scope");
      await runAsSystem(() =>
        acceptDepartmentInvite(pending.token, {
          id: profile.id,
          email: profile.email,
        }),
      ).catch((err) => {
        console.error(
          "[completeLogin] pending invite auto-accept failed:",
          err,
        );
      });
    }
  }

  // No specific deep link: land by role (role-hierarchy.md) — Super Admin to the
  // platform console, tenant admin to the org console, manager/agent to their
  // department board, unassigned to onboarding. A deep link still wins.
  if (next === "/") {
    const landing = await resolvePostLoginLanding(
      profile.id,
      profile.isSuperAdmin,
    );
    return {
      redirectPath: landing.redirectPath,
      cookies: [
        clearNextCookie,
        ...(await tenantCookie(tenantId)),
        ...landing.cookies,
      ],
    };
  }

  return {
    redirectPath: next,
    cookies: [clearNextCookie, ...(await tenantCookie(tenantId))],
  };
}
