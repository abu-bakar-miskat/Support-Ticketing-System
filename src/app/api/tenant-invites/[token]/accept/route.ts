import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/db"
import {
  acceptTenantInvite,
  tenantInviteLandingCookies,
  tenantInviteLandingPath,
} from "@/lib/invites/accept-tenant-invite"

type Params = { params: Promise<{ token: string }> }

async function acceptAndRespond(request: NextRequest, token: string, asJson: boolean) {
  const started = Date.now()
  // Lightweight auth — avoid requireAuth/getProfile here. That path can stall
  // on a busy pooler and leave the browser on a blank accept URL for minutes.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    if (asJson) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const login = new URL("/login", request.url)
    login.searchParams.set("next", `/tenant-invite/${token}`)
    return NextResponse.redirect(login)
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, email: true },
  })
  if (!profile) {
    if (asJson) {
      return NextResponse.json({ error: "Profile not found" }, { status: 401 })
    }
    const login = new URL("/login", request.url)
    login.searchParams.set("next", `/tenant-invite/${token}`)
    return NextResponse.redirect(login)
  }

  const tAccept = Date.now()
  const result = await acceptTenantInvite(token, {
    id: profile.id,
    email: profile.email,
  })
  console.info(
    `[tenant-invite/accept] acceptTenantInvite ${Date.now() - tAccept}ms (total ${Date.now() - started}ms)`,
  )

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

  const destination = tenantInviteLandingPath(result)

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

  // 303 so refresh doesn't re-POST; destination is the role dashboard.
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
