import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, assertDepartmentAdmin } from "@/lib/auth"
import { assertFeatureEnabled } from "@/lib/feature-flags"
import { findScopeMailbox } from "@/lib/mailbox-outbound"
import {
  OAUTH_AUTH_TYPE,
  buildAuthorizeUrl,
  createOAuthNonce,
  isOAuthProviderConfigured,
  MAILBOX_OAUTH_NONCE_COOKIE,
  oauthRedirectUri,
  safeReturnPath,
  signOAuthState,
  type OAuthProviderKey,
} from "@/lib/mailbox-oauth"

type Params = { params: Promise<{ provider: string }> }

/**
 * GET /api/admin/mailbox-oauth/[provider]/start — begins connecting (or, with
 * `connectionId`, re-authorizing) a Microsoft 365 mailbox. Browser
 * navigation, not fetch: it redirects to the provider's consent screen.
 *
 * Query: `teamId` (sub-department new tickets file into), `scopeType`
 * (DEPARTMENT | SUB_DEPARTMENT), optional `mailbox` (an M365 shared mailbox
 * the signing-in account can read), optional `connectionId`, `returnTo`.
 *
 * All authorization happens here; the callback trusts only what this route
 * signed into `state`, bound to the same user and a nonce cookie.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { provider: rawProvider } = await params
  if (rawProvider !== "microsoft") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 })
  }
  const provider: OAuthProviderKey = rawProvider
  const search = request.nextUrl.searchParams
  const returnTo = safeReturnPath(search.get("returnTo"))
  const fail = (message: string) => {
    const url = new URL(returnTo, request.nextUrl.origin)
    url.searchParams.set("mailboxError", message)
    return NextResponse.redirect(url)
  }

  const { profile: caller, error } = await requireAuth()
  if (error) return error

  if (!isOAuthProviderConfigured(provider)) {
    return fail("Microsoft 365 sign-in isn't set up on this server yet. Ask your platform administrator to configure it.")
  }

  const connectionId = search.get("connectionId") || undefined
  let teamId = search.get("teamId") ?? ""
  let scopeType = search.get("scopeType") ?? ""
  let mailbox = search.get("mailbox")?.trim().toLowerCase() || undefined
  let connectionTenantId: string | null = null

  if (connectionId) {
    const existing = await prisma.mailboxConnection.findUnique({
      where: { id: connectionId },
      select: { tenantId: true, subDepartmentId: true, scopeType: true, authType: true, address: true },
    })
    if (!existing || existing.authType !== OAUTH_AUTH_TYPE[provider]) return fail("That mailbox connection no longer exists.")
    teamId = existing.subDepartmentId ?? ""
    scopeType = existing.scopeType
    mailbox = existing.address
    connectionTenantId = existing.tenantId
  }

  if (scopeType !== "TENANT" && scopeType !== "DEPARTMENT" && scopeType !== "SUB_DEPARTMENT") return fail("Invalid mailbox scope.")
  if (mailbox && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox)) return fail("Enter a valid mailbox address.")

  let tenantId: string
  let departmentId: string | null = null
  let subDepartmentId: string | null = null
  if (scopeType === "TENANT") {
    // The organisation-wide mailbox is a tenant-admin setting.
    const target = connectionTenantId ?? caller!.activeTenantId
    if (!target) return fail("Choose an organisation first.")
    if (!caller!.isSuperAdmin && !(caller!.role === "admin" && caller!.activeTenantId === target)) {
      return NextResponse.json({ error: "Only an organisation admin can connect its mailbox." }, { status: 403 })
    }
    tenantId = target
  } else {
    const subDepartment = teamId
      ? await prisma.subDepartment.findUnique({ where: { id: teamId }, select: { id: true, departmentId: true, tenantId: true } })
      : null
    if (!subDepartment) return fail("Choose which sub-department this mailbox files into.")

    const scopeError = assertDepartmentAdmin(caller!, subDepartment.departmentId)
    if (scopeError) return scopeError
    tenantId = subDepartment.tenantId
    departmentId = subDepartment.departmentId
    subDepartmentId = subDepartment.id
  }

  // SA-04: a Super Admin can disable mailbox connections per tenant.
  const featureCheck = await assertFeatureEnabled(tenantId, "mailboxConnections")
  if (!featureCheck.ok) return fail(featureCheck.error)

  if (!connectionId) {
    const existing = await findScopeMailbox(
      scopeType === "TENANT"
        ? { scopeType, tenantId }
        : scopeType === "DEPARTMENT"
          ? { scopeType, departmentId: departmentId! }
          : { scopeType, subDepartmentId: subDepartmentId! },
    )
    if (existing) {
      const label = scopeType === "TENANT" ? "Your organisation" : scopeType === "DEPARTMENT" ? "This department" : "This sub-department"
      return fail(`${label} already has a connected mailbox (${existing.address}). Disconnect it first to connect a different one.`)
    }
  }

  const nonce = createOAuthNonce()
  const state = signOAuthState({
    provider,
    actorId: caller!.id,
    tenantId,
    departmentId,
    teamId: subDepartmentId,
    scopeType,
    mailbox,
    connectionId,
    returnTo,
    nonce,
  })

  const redirectUri = oauthRedirectUri(request.nextUrl.origin, provider)
  const response = NextResponse.redirect(buildAuthorizeUrl(provider, redirectUri, state))
  response.cookies.set(MAILBOX_OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    // Lax: the provider's redirect back is a top-level GET navigation.
    sameSite: "lax",
    path: "/api/admin/mailbox-oauth",
    maxAge: 10 * 60,
  })
  return response
}
