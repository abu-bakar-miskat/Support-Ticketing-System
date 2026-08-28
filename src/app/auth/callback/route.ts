import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { safeNextPath } from "@/lib/auth-redirect"
import { completeLogin } from "@/lib/auth/complete-login"

const AUTH_NEXT_COOKIE = "pen_auth_next"

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

  const finish = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return clearNextCookie(NextResponse.redirect(`${origin}${next}`))
    }
    const { redirectPath, cookies } = await completeLogin({ supabase, user, next })
    const res = NextResponse.redirect(`${origin}${redirectPath}`)
    for (const c of cookies) res.cookies.set(c.name, c.value, c.options)
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
    return finish()
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
    return finish()
  }

  return NextResponse.redirect(`${origin}/login`)
}
