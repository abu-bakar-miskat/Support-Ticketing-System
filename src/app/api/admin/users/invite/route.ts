import { NextResponse } from "next/server"
import { sendLoginCode } from "@/lib/auth/send-login-code"
import { requireAdmin } from "../../_guard"

export async function POST(request: Request) {
  const { error } = await requireAdmin()
  if (error) return error

  const body = await request.json()
  const email = (body.email as string)?.trim().toLowerCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 })
  }

  // Use the same code-only flow as the login page. Calling signInWithOtp here
  // would render Supabase's hosted template, which may include a clickable
  // ConfirmationURL depending on the project's email configuration.
  const result = await sendLoginCode(email)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
