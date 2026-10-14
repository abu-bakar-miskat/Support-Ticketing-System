import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getProfile } from "@/lib/profile"
import { runAsSystem } from "@/lib/request-scope"
import { getPullMailProvider, MailProviderError, type OAuthMailboxCredentials } from "@/lib/mail-providers"
import { createMailboxConnection, encryptPullCredentials, replacePullCredentials } from "@/lib/mailbox-connection"
import { initialSyncCursor } from "@/lib/mailbox-sync"
import { findScopeMailbox } from "@/lib/mailbox-outbound"
import {
  MAILBOX_OAUTH_NONCE_COOKIE,
  OAUTH_AUTH_TYPE,
  exchangeAuthorizationCode,
  oauthRedirectUri,
  safeReturnPath,
  verifyOAuthState,
} from "@/lib/mailbox-oauth"

type Params = { params: Promise<{ provider: string }> }

/**
 * GET /api/admin/mailbox-oauth/[provider]/callback — the provider redirects
 * here after consent. Exchanges the code, confirms the granted account can
 * actually read the target mailbox, then creates (or re-authorizes) the
 * connection and sends the admin back to the mailbox page.
 *
 * Authorization was enforced by the start route and sealed into the signed
 * `state`; here we only confirm the same signed-in user and the nonce cookie.
 * The provider's redirect carries no same-origin Referer, so the request has
 * no tenant context — DB work runs as system with explicit ids from `state`.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { provider } = await params
  const search = request.nextUrl.searchParams
  const state = verifyOAuthState(search.get("state") ?? "")

  const finish = (outcome: { connected: string } | { error: string }) => {
    const url = new URL(safeReturnPath(state?.returnTo), request.nextUrl.origin)
    if ("connected" in outcome) url.searchParams.set("mailboxConnected", outcome.connected)
    else url.searchParams.set("mailboxError", outcome.error)
    const response = NextResponse.redirect(url)
    response.cookies.set(MAILBOX_OAUTH_NONCE_COOKIE, "", { path: "/api/admin/mailbox-oauth", maxAge: 0 })
    return response
  }

  if (!state || state.provider !== provider) {
    return finish({ error: "The sign-in link expired or was tampered with. Please try connecting again." })
  }
  if (request.cookies.get(MAILBOX_OAUTH_NONCE_COOKIE)?.value !== state.nonce) {
    return finish({ error: "The sign-in session didn't match this browser. Please try connecting again." })
  }

  const profile = await getProfile()
  if (!profile || profile.id !== state.actorId) {
    return finish({ error: "Sign in as the admin who started connecting this mailbox, then try again." })
  }

  const providerError = search.get("error")
  if (providerError) {
    const denied = providerError === "access_denied" || providerError === "consent_required"
    return finish({
      error: denied
        ? "Access wasn't granted, so the mailbox wasn't connected."
        : search.get("error_description") ?? `Sign-in failed (${providerError}).`,
    })
  }

  const code = search.get("code")
  if (!code) return finish({ error: "The provider didn't return an authorization code." })

  const authType = OAUTH_AUTH_TYPE[state.provider]
  const pull = getPullMailProvider(authType)!

  try {
    const credentials = await exchangeAuthorizationCode(
      state.provider,
      code,
      oauthRedirectUri(request.nextUrl.origin, state.provider),
    )

    // Microsoft can read a shared mailbox on the signed-in user's behalf.
    const target = state.mailbox ?? credentials.account
    const granted: OAuthMailboxCredentials = { ...credentials, ...(target !== credentials.account ? { mailbox: target } : {}) }

    // Prove the grant can read the target inbox before saving anything —
    // e.g. no Full Access permission on an M365 shared mailbox fails here.
    const ctx = { credentials: granted, saveCredentials: async (next: OAuthMailboxCredentials) => { Object.assign(granted, next) } }
    const health = await pull.checkHealth(ctx as never)
    if (!health.ok) {
      return finish({
        error: target !== credentials.account
          ? `${credentials.account} can't read ${target}: ${health.error}. Ask your Microsoft 365 admin to grant it Full Access to that mailbox.`
          : `Couldn't read the mailbox: ${health.error}`,
      })
    }
    const syncCursor = await initialSyncCursor(pull, ctx as never)

    return await runAsSystem(async () => {
      if (state.scopeType !== "TENANT") {
        const sub = await prisma.subDepartment.findFirst({
          where: { id: state.teamId ?? "", departmentId: state.departmentId ?? "", tenantId: state.tenantId },
          select: { id: true },
        })
        if (!sub) return finish({ error: "That sub-department no longer exists." })
      }

      if (state.connectionId) {
        const existing = await prisma.mailboxConnection.findUnique({
          where: { id: state.connectionId },
          select: { address: true, tenantId: true, scopeType: true, syncCursor: true },
        })
        if (!existing || existing.tenantId !== state.tenantId || existing.scopeType !== state.scopeType) {
          return finish({ error: "That mailbox connection no longer exists." })
        }
        if (existing.address !== target) {
          return finish({ error: `You signed in as ${credentials.account}, which can't reconnect ${existing.address}.` })
        }
        // Keep the existing cursor so mail that arrived while the grant was
        // broken is still picked up.
        await replacePullCredentials(state.connectionId, granted, state.actorId, existing.syncCursor === null ? syncCursor : undefined)
        return finish({ connected: target })
      }

      // Re-checked here: another admin may have connected one meanwhile.
      const taken = await findScopeMailbox(
        state.scopeType === "TENANT"
          ? { scopeType: "TENANT", tenantId: state.tenantId }
          : state.scopeType === "DEPARTMENT"
            ? { scopeType: "DEPARTMENT", departmentId: state.departmentId ?? "" }
            : { scopeType: "SUB_DEPARTMENT", subDepartmentId: state.teamId ?? "" },
      )
      if (taken) {
        return finish({ error: `A mailbox (${taken.address}) is already connected here. Disconnect it first to connect a different one.` })
      }

      const scope = {
        tenantId: state.tenantId,
        departmentId: state.scopeType === "TENANT" ? null : state.departmentId,
        subDepartmentId: state.scopeType === "TENANT" ? null : state.teamId,
        scopeType: state.scopeType,
      }

      // A legacy Resend forwarding mailbox may still hold this address (the
      // column is unique). Upgrade that row in place to the Microsoft 365
      // connection — it keeps its id, so its received-mail history stays linked.
      const legacy = await prisma.mailboxConnection.findUnique({
        where: { address: target },
        select: { id: true, authType: true, tenantId: true },
      })
      if (legacy && legacy.authType === "RESEND" && legacy.tenantId === state.tenantId) {
        await prisma.mailboxConnection.update({
          where: { id: legacy.id },
          data: {
            ...scope,
            authType,
            credentialsRef: encryptPullCredentials(granted),
            syncCursor: syncCursor as never,
            status: "ACTIVE",
            failureCount: 0,
            lastErrorAt: null,
            lastErrorMessage: null,
            nextCheckAt: null,
            assignmentMethod: null,
            manualAssigneeIds: [],
          },
        })
        return finish({ connected: target })
      }

      try {
        await createMailboxConnection({
          ...scope,
          address: target,
          authType,
          plaintextCredentials: JSON.stringify(granted),
          syncCursor,
          actorId: state.actorId,
        })
      } catch (err) {
        if (err instanceof Error && err.message.includes("Unique constraint")) {
          return finish({ error: `${target} is already connected.` })
        }
        throw err
      }
      return finish({ connected: target })
    })
  } catch (err) {
    console.error("[mailbox-oauth] callback failed:", err)
    return finish({
      error: err instanceof MailProviderError ? err.message : "Something went wrong connecting the mailbox. Please try again.",
    })
  }
}
