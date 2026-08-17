import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { safeNextPath } from "@/lib/auth-redirect"
import { acceptDepartmentInvite } from "@/lib/invites/accept-department-invite"
import { ACTIVE_TENANT_COOKIE, TENANT_COOKIE_MAX_AGE } from "@/lib/tenant-scope"
import { prisma } from "@/lib/db"

const AUTH_NEXT_COOKIE = "pen_auth_next"

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

function setTenantCookie(res: NextResponse, tenantId: string | null): NextResponse {
  if (tenantId) {
    res.cookies.set(ACTIVE_TENANT_COOKIE, tenantId, {
      httpOnly: true,
      path: "/",
      maxAge: TENANT_COOKIE_MAX_AGE,
      sameSite: "lax",
    })
  }
  return res
}

function inviteTokenFromNext(next: string): string | null {
  const match = /^\/invite\/([^/?#]+)/.exec(next)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

async function finishLoginRedirect(args: {
  origin: string
  next: string
  userId: string
  email: string
  tenantId: string | null
  clearNextCookie: (res: NextResponse) => NextResponse
}) {
  const { origin, next, userId, email, tenantId, clearNextCookie } = args
  const withTenant = (res: NextResponse) => setTenantCookie(res, tenantId)
  const inviteToken = inviteTokenFromNext(next)

  if (inviteToken) {
    const result = await acceptDepartmentInvite(inviteToken, { id: userId, email })
    if (result.ok) {
      const res = withTenant(clearNextCookie(NextResponse.redirect(`${origin}/`)))
      res.cookies.set("pen_active_dept", result.departmentId, {
        httpOnly: true,
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
      })
      return res
    }
    // Surface the accept error on the invite page instead of dumping into onboarding
    const res = clearNextCookie(
      NextResponse.redirect(
        `${origin}/invite/${encodeURIComponent(inviteToken)}?error=${encodeURIComponent(result.code)}`,
      ),
    )
    return res
  }

  return withTenant(clearNextCookie(NextResponse.redirect(`${origin}${next}`)))
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  // Prefer query param; fall back to cookie set at login for OAuth round-trips
  const cookieHeader = request.headers.get("cookie") ?? ""
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)pen_auth_next=([^;]*)/)
  const cookieNext = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null
  const next = safeNextPath(searchParams.get("next") ?? cookieNext)

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription ?? error)}`
    )
  }

  const supabase = await createClient()

  const clearNextCookie = (res: NextResponse) => {
    res.cookies.set(AUTH_NEXT_COOKIE, "", { path: "/", maxAge: 0 })
    return res
  }

  // PKCE flow — OAuth and magic link when PKCE is enabled (default with @supabase/ssr)
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      return clearNextCookie(
        NextResponse.redirect(
          `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`
        )
      )
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { reconcileProfileOnLogin } = await import("@/lib/reconcile-profile-on-login")
      await reconcileProfileOnLogin(user).catch((err) => {
        console.error("[auth/callback] profile reconcile failed:", err)
      })
      // Prefer DB profile email (source of truth after reconcile) for invite matching
      const profile = await prisma.profile.findUnique({
        where: { id: user.id },
        select: { id: true, email: true, isSuperAdmin: true },
      })
      if (profile) {
        const tenantId = await resolveLoginTenantId(profile.id, profile.isSuperAdmin)
        return finishLoginRedirect({
          origin,
          next,
          userId: profile.id,
          email: profile.email,
          tenantId,
          clearNextCookie,
        })
      }
    }
    return clearNextCookie(NextResponse.redirect(`${origin}${next}`))
  }

  // Token hash flow — magic link fallback when PKCE is not used
  if (tokenHash && type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (verifyError) {
      return clearNextCookie(
        NextResponse.redirect(
          `${origin}/login?error=${encodeURIComponent(verifyError.message)}`
        )
      )
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { reconcileProfileOnLogin } = await import("@/lib/reconcile-profile-on-login")
      await reconcileProfileOnLogin(user).catch((err) => {
        console.error("[auth/callback] profile reconcile failed:", err)
      })
      const profile = await prisma.profile.findUnique({
        where: { id: user.id },
        select: { id: true, email: true, isSuperAdmin: true },
      })
      if (profile) {
        const tenantId = await resolveLoginTenantId(profile.id, profile.isSuperAdmin)
        return finishLoginRedirect({
          origin,
          next,
          userId: profile.id,
          email: profile.email,
          tenantId,
          clearNextCookie,
        })
      }
    }
    return clearNextCookie(NextResponse.redirect(`${origin}${next}`))
  }

  return NextResponse.redirect(`${origin}/login`)
}
