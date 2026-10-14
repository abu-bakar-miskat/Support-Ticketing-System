import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUnscopedPrisma } from "@/lib/db"
import { acceptSuperAdminInvite } from "@/lib/invites/accept-super-admin-invite"

type Params = { params: Promise<{ token: string }> }

const clearDeptCookie = {
  name: "pen_active_dept",
  value: "",
  options: { path: "/", maxAge: 0 },
} as const

async function acceptAndRespond(request: NextRequest, token: string, asJson: boolean) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    if (asJson) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const login = new URL("/login", request.url)
    login.searchParams.set("next", `/super-admin-invite/${token}`)
    return NextResponse.redirect(login)
  }

  const profile = await getUnscopedPrisma().profile.findUnique({
    where: { id: user.id },
    select: { id: true, email: true },
  })
  if (!profile) {
    if (asJson) {
      return NextResponse.json({ error: "Profile not found" }, { status: 401 })
    }
    const login = new URL("/login", request.url)
    login.searchParams.set("next", `/super-admin-invite/${token}`)
    return NextResponse.redirect(login)
  }

  const result = await acceptSuperAdminInvite(token, {
    id: profile.id,
    email: profile.email,
  })

  if (!result.ok) {
    if (asJson) {
      const status =
        result.code === "not_found" ? 404 : result.code === "email_mismatch" ? 403 : 410
      return NextResponse.json({ error: result.message, code: result.code }, { status })
    }
    const url = new URL(`/super-admin-invite/${token}`, request.url)
    url.searchParams.set("error", result.code)
    return NextResponse.redirect(url)
  }

  if (asJson) {
    const res = NextResponse.json({ ok: true, redirectPath: "/platform" })
    res.cookies.set(clearDeptCookie.name, clearDeptCookie.value, clearDeptCookie.options)
    return res
  }

  const res = NextResponse.redirect(new URL("/platform", request.url), 303)
  res.cookies.set(clearDeptCookie.name, clearDeptCookie.value, clearDeptCookie.options)
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
