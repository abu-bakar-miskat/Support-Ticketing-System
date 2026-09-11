import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import {
  acceptTenantInvite,
  tenantInviteLandingCookies,
  tenantInviteLandingPath,
} from "@/lib/invites/accept-tenant-invite"

type Params = { params: Promise<{ token: string }> }

async function acceptAndRespond(request: NextRequest, token: string, asJson: boolean) {
  const { profile, error } = await requireAuth()
  if (error) {
    if (asJson) return error
    const login = new URL("/login", request.url)
    login.searchParams.set("next", `/tenant-invite/${token}`)
    return NextResponse.redirect(login)
  }

  const result = await acceptTenantInvite(token, { id: profile.id, email: profile.email })

  if (!result.ok) {
    if (asJson) {
      const status =
        result.code === "not_found"
          ? 404
          : result.code === "email_mismatch"
            ? 403
            : result.code === "already_accepted"
              ? 409
              : 410
      return NextResponse.json({ error: result.message, code: result.code }, { status })
    }
    const url = new URL(`/tenant-invite/${token}`, request.url)
    url.searchParams.set("error", result.code)
    return NextResponse.redirect(url)
  }

  const destination = tenantInviteLandingPath(result.role)

  if (asJson) {
    const res = NextResponse.json({
      ok: true,
      tenantId: result.tenantId,
      tenantName: result.tenantName,
      role: result.role,
      departmentId: result.departmentId,
      subDepartmentId: result.subDepartmentId,
      redirectPath: destination,
    })
    for (const c of tenantInviteLandingCookies(result)) {
      res.cookies.set(c.name, c.value, c.options)
    }
    return res
  }

  // 303 so refresh doesn't re-POST; never leave the browser on this API URL
  // (blank white page while the handler runs).
  const res = NextResponse.redirect(new URL(destination, request.url), 303)
  for (const c of tenantInviteLandingCookies(result)) {
    res.cookies.set(c.name, c.value, c.options)
  }
  return res
}

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params
  return acceptAndRespond(req, token, false)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params
  return acceptAndRespond(req, token, true)
}
