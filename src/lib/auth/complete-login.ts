import "server-only"
import type { User } from "@supabase/supabase-js"
import type { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/db"
import { acceptDepartmentInvite } from "@/lib/invites/accept-department-invite"
import { ACTIVE_TENANT_COOKIE, TENANT_COOKIE_MAX_AGE } from "@/lib/tenant-scope"
import { TENANT_SLUG_COOKIE, DEPT_SLUG_COOKIE } from "@/lib/tenant-path"
import { loginBlockReason } from "@/lib/tenant-lifecycle"
import { resolvePostLoginLanding } from "@/lib/auth/post-login-redirect"

const AUTH_NEXT_COOKIE = "pen_auth_next"

export type LoginCookie = {
  name: string
  value: string
  options: {
    httpOnly?: boolean
    path?: string
    maxAge?: number
    sameSite?: "lax" | "strict" | "none"
  }
}

/**
 * Result of finishing a login: the path to redirect to plus every cookie the
 * caller must set on its response (auth-next is always cleared here).
 */
export type CompleteLoginResult = {
  redirectPath: string
  cookies: LoginCookie[]
}

const clearNextCookie: LoginCookie = {
  name: AUTH_NEXT_COOKIE,
  value: "",
  options: { path: "/", maxAge: 0 },
}

async function tenantCookie(tenantId: string | null): Promise<LoginCookie[]> {
  if (!tenantId) return []
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
  ]
  // Mirror the slug so middleware can show the tenant in the URL without a lookup.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  })
  if (tenant?.slug) {
    cookies.push({
      name: TENANT_SLUG_COOKIE,
      value: tenant.slug,
      options: { path: "/", maxAge: TENANT_COOKIE_MAX_AGE, sameSite: "lax" },
    })
  }
  return cookies
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
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { tenantId: true },
  })
  if (membership) return membership.tenantId
  if (!isSuperAdmin) return null
  const first = await prisma.tenant.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })
  return first?.id ?? null
}

function inviteTokenFromNext(next: string): string | null {
  const match = /^\/invite\/([^/?#]+)/.exec(next)
  return match?.[1] ? decodeURIComponent(match[1]) : null
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
  supabase: Awaited<ReturnType<typeof createClient>>
  user: User
  next: string
}): Promise<CompleteLoginResult> {
  const { supabase, user, next } = args

  const { reconcileProfileOnLogin } = await import(
    "@/lib/reconcile-profile-on-login"
  )
  await reconcileProfileOnLogin(user).catch((err) => {
    console.error("[completeLogin] profile reconcile failed:", err)
  })

  // Prefer DB profile email (source of truth after reconcile) for invite matching
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, isSuperAdmin: true },
  })
  if (!profile) {
    return { redirectPath: next, cookies: [clearNextCookie] }
  }

  // SA-01/SA-03: reject sign-in when the user is individually restricted or
  // their tenant is suspended/soft-deleted — and sign the fresh session back
  // out so it doesn't linger client-side.
  const reason = await loginBlockReason(profile.id)
  if (reason) {
    await supabase.auth.signOut()
    return {
      redirectPath: `/login?error=${encodeURIComponent(reason)}`,
      cookies: [clearNextCookie],
    }
  }

  const tenantId = await resolveLoginTenantId(profile.id, profile.isSuperAdmin)
  const inviteToken = inviteTokenFromNext(next)

  if (inviteToken) {
    const result = await acceptDepartmentInvite(inviteToken, {
      id: profile.id,
      email: profile.email,
    })
    if (result.ok) {
      const invitedDept = await prisma.department.findUnique({
        where: { id: result.departmentId },
        select: { slug: true },
      })
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
      }
    }
    // Surface the accept error on the invite page instead of dumping into onboarding
    return {
      redirectPath: `/invite/${encodeURIComponent(inviteToken)}?error=${encodeURIComponent(result.code)}`,
      cookies: [clearNextCookie],
    }
  }

  // No specific deep link: land by role (role-hierarchy.md) — Super Admin to the
  // platform console, tenant admin to the org console, manager/agent to their
  // department board, unassigned to onboarding. A deep link still wins.
  if (next === "/") {
    const landing = await resolvePostLoginLanding(profile.id, profile.isSuperAdmin)
    return {
      redirectPath: landing.redirectPath,
      cookies: [clearNextCookie, ...(await tenantCookie(tenantId)), ...landing.cookies],
    }
  }

  return {
    redirectPath: next,
    cookies: [clearNextCookie, ...(await tenantCookie(tenantId))],
  }
}
