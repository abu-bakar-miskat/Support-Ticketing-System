import { NextRequest, NextResponse } from "next/server"
import { sweepSlaChecks } from "@/lib/sla-engine"
import { withSystemScope } from "@/lib/request-scope"

// Vercel Cron Jobs invoke routes via GET with an Authorization header.
// Cron job — no caller; runs cross-tenant under system scope. Proactively
// fires SLA-05 at-risk/breach notifications for tickets nobody currently has
// open (see sweepSlaChecks / checkAndNotifySla in lib/sla-engine.ts).
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

  const checked = await sweepSlaChecks()
  console.log(`[sla-check] checked ${checked} live SLA timers`)

  return NextResponse.json({ ok: true, checked })
}
