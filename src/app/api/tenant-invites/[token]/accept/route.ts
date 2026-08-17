import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { acceptTenantInvite } from "@/lib/invites/accept-tenant-invite"
import { ACTIVE_TENANT_COOKIE, TENANT_COOKIE_MAX_AGE } from "@/lib/tenant-scope"

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

  // Accepting makes the new tenant active. Reset the active department cookie so
  // it never points into the previous tenant.
  const setCookies = (res: NextResponse) => {
    res.cookies.set(ACTIVE_TENANT_COOKIE, result.tenantId, {
      httpOnly: true,
      path: "/",
      maxAge: TENANT_COOKIE_MAX_AGE,
      sameSite: "lax",
    })
    res.cookies.set("pen_active_dept", "", { path: "/", maxAge: 0 })
    return res
  }

  if (asJson) {
    return setCookies(
      NextResponse.json({ ok: true, tenantId: result.tenantId, tenantName: result.tenantName, role: result.role }),
    )
  }
  return setCookies(NextResponse.redirect(new URL("/", request.url)))
}

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params
  return acceptAndRespond(req, token, false)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params
  return acceptAndRespond(req, token, true)
}
