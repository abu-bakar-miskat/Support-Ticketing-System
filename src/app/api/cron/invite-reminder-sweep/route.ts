import { NextRequest, NextResponse } from "next/server"
import { sweepInviteReminders } from "@/lib/invites/reminders"
import { withSystemScope } from "@/lib/request-scope"

// Vercel Cron Jobs invoke routes via GET with an Authorization header. Sends the
// one-time 24h reminder for invites (department + tenant) still unaccepted and
// not yet expired — see lib/invites/reminders.ts.
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

  const sent = await sweepInviteReminders()
  console.log(`[invite-reminder-sweep] sent ${sent} reminder(s)`)

  return NextResponse.json({ ok: true, sent })
}
