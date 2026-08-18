import { NextRequest, NextResponse } from "next/server"
import { sweepAgreementReminders } from "@/lib/agreements"
import { withSystemScope } from "@/lib/request-scope"

// Vercel Cron Jobs invoke routes via GET with an Authorization header.
// SA-06: notifies Super Admins as agreements approach their configured
// reminder windows (default 60/30/7 days before endDate) — see lib/agreements.ts.
export const GET = withSystemScope(handleGet)

async function handleGet(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }

  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const notified = await sweepAgreementReminders()
  console.log(`[agreement-reminder-sweep] fired ${notified} reminder(s)`)

  return NextResponse.json({ ok: true, notified })
}
