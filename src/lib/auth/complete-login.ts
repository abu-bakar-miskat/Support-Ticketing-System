import "server-only";
import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { prisma, getUnscopedPrisma } from "@/lib/db";
import {
  acceptDepartmentInvite,
  departmentInviteLandingCookies,
  departmentInviteLandingPath,
} from "@/lib/invites/accept-department-invite";
import {
  acceptTenantInvite,
  tenantInviteLandingCookies,
  tenantInviteLandingPath,
} from "@/lib/invites/accept-tenant-invite";
import { acceptSuperAdminInvite } from "@/lib/invites/accept-super-admin-invite";
import {
  ACTIVE_TENANT_COOKIE,
  TENANT_COOKIE_MAX_AGE,
} from "@/lib/tenant-scope";
import { TENANT_SLUG_COOKIE } from "@/lib/tenant-path";
import { loginBlockReason } from "@/lib/tenant-lifecycle";
import { recordAuditEvent } from "@/lib/audit-log";
import { resolvePostLoginLanding } from "@/lib/auth/post-login-redirect";
import { isGenericLandingPath } from "@/lib/auth-redirect";

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

const clearDeptCookie: LoginCookie = {
  name: "pen_active_dept",
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

function superAdminInviteTokenFromNext(next: string): string | null {
  const match = /^\/super-admin-invite\/([^/?#]+)/.exec(next);
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
  const superAdminInviteToken = superAdminInviteTokenFromNext(next);
  const isInviteLogin = Boolean(tenantInviteToken || inviteToken || superAdminInviteToken);

  const { reconcileProfileOnLogin } =
    await import("@/lib/reconcile-profile-on-login");
  await reconcileProfileOnLogin(user, {
    // Invite signup attaches the real tenant; seeding "pen" first just adds
    // extra scoped writes that used to hang verify. Super-admin invites have
    // no tenant at all — the account is this sign-in, and the role is granted
    // by accepting the invite below.
    skipDefaultTenant: isInviteLogin,
  }).catch((err) => {
    console.error("[completeLogin] profile reconcile failed:", err);
  });
  console.info(`[completeLogin] reconcile ${Date.now() - t0}ms`);

  // Prefer DB profile email (source of truth after reconcile) for invite matching.
  // Invite logins use the dedicated auth pool so this lookup cannot queue behind
  // a 15s /departments render on the shared dashboard pool.
  const profileDb = isInviteLogin ? getUnscopedPrisma() : prisma;
  const profile = await profileDb.profile.findUnique({
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

  // For invite deep-links, complete the accept now and redirect straight to the
  // target dashboard. All invite reads/writes use the dedicated auth DB client,
  // so this avoids the intermediate "Accepting invitation..." page.
  if (tenantInviteToken) {
    const result = await acceptTenantInvite(tenantInviteToken, {
      id: profile.id,
      email: profile.email,
    });
    if (!result.ok) {
      return {
        redirectPath: `/tenant-invite/${encodeURIComponent(tenantInviteToken)}?error=${encodeURIComponent(result.code)}`,
        cookies: [clearNextCookie],
      };
    }
    return {
      redirectPath: tenantInviteLandingPath(result),
      cookies: [clearNextCookie, ...tenantInviteLandingCookies(result)],
    };
  }

  if (superAdminInviteToken) {
    const result = await acceptSuperAdminInvite(superAdminInviteToken, {
      id: profile.id,
      email: profile.email,
    });
    if (!result.ok) {
      return {
        redirectPath: `/super-admin-invite/${encodeURIComponent(superAdminInviteToken)}?error=${encodeURIComponent(result.code)}`,
        cookies: [clearNextCookie],
      };
    }
    return {
      redirectPath: "/platform",
      cookies: [clearNextCookie, clearDeptCookie],
    };
  }

  if (inviteToken) {
    const result = await acceptDepartmentInvite(inviteToken, {
      id: profile.id,
      email: profile.email,
    });
    if (!result.ok) {
      return {
        redirectPath: `/invite/${encodeURIComponent(inviteToken)}?error=${encodeURIComponent(result.code)}`,
        cookies: [clearNextCookie],
      };
    }
    return {
      redirectPath: departmentInviteLandingPath(result),
      cookies: [clearNextCookie, ...departmentInviteLandingCookies(result)],
    };
  }

  const tTenant = Date.now();
  const tenantId = await resolveLoginTenantId(profile.id, profile.isSuperAdmin);
  console.info(`[completeLogin] resolveLoginTenantId ${Date.now() - tTenant}ms`);

  // Audit the successful sign-in. Best-effort — a failed audit write must never
  // block or slow login, so swallow errors and never throw.
  await recordAuditEvent({
    tenantId,
    actorId: profile.id,
    action: "USER_LOGGED_IN",
    targetType: "Profile",
    targetId: profile.id,
    after: { email: profile.email },
  }).catch((err) => console.error("[completeLogin] audit login failed:", err));

  // No explicit /invite/<token> deep link: still consume any pending invite
  // addressed to this email so an invited user becomes a member however they
  // signed in — typing their email directly, an already-open session, or a mail
  // gateway (Safe Links) that mangled the invite link. Without this they land on
  // /onboarding despite holding a valid invite.
  if (!inviteToken && !tenantInviteToken && !superAdminInviteToken) {
    const pendingDb = getUnscopedPrisma();
    const pendingTenant = await pendingDb.tenantInvite.findFirst({
      where: {
        email: { equals: profile.email, mode: "insensitive" },
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { token: true },
    });
    if (pendingTenant) {
      const result = await acceptTenantInvite(pendingTenant.token, {
        id: profile.id,
        email: profile.email,
      }).catch((err) => {
        console.error(
          "[completeLogin] pending tenant invite auto-accept failed:",
          err,
        );
        return null;
      });
      if (result?.ok) {
        return {
          redirectPath: tenantInviteLandingPath(result),
          cookies: [clearNextCookie, ...tenantInviteLandingCookies(result)],
        };
      }
    }

    const pending = await pendingDb.departmentInvite.findFirst({
      where: {
        email: { equals: profile.email, mode: "insensitive" },
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { token: true },
    });
    const pendingSuperAdmin = await pendingDb.superAdminInvite.findFirst({
      where: {
        email: { equals: profile.email, mode: "insensitive" },
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { token: true },
    });
    if (pendingSuperAdmin) {
      const result = await acceptSuperAdminInvite(pendingSuperAdmin.token, {
        id: profile.id,
        email: profile.email,
      }).catch((err) => {
        console.error(
          "[completeLogin] pending super-admin invite auto-accept failed:",
          err,
        );
        return null;
      });
      if (result?.ok) {
        return {
          redirectPath: "/platform",
          cookies: [clearNextCookie, clearDeptCookie],
        };
      }
    }

    if (pending) {
      const result = await acceptDepartmentInvite(pending.token, {
        id: profile.id,
        email: profile.email,
      }).catch((err) => {
        console.error(
          "[completeLogin] pending invite auto-accept failed:",
          err,
        );
        return null;
      });
      if (result?.ok) {
        return {
          redirectPath: departmentInviteLandingPath(result),
          cookies: [clearNextCookie, ...departmentInviteLandingCookies(result)],
        };
      }
    }
  }

  // Department home (`/{tenant}/{dept}`) is not a deep link — it's the rewrite
  // of `/`. Dispatch by role so managers land on /manager, not agent Home.
  if (isGenericLandingPath(next)) {
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
