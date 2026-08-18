import { NextRequest, NextResponse } from "next/server"
import { sweepAgentUnavailableFlags } from "@/lib/agent-unavailable"
import { withSystemScope } from "@/lib/request-scope"

// Vercel Cron Jobs invoke routes via GET with an Authorization header.
// Cron job — no caller; runs cross-tenant under system scope. Catches the
// passive availability transitions (working-hours window edges, holiday
// start/end) that no request triggers — see lib/agent-unavailable.ts (WH-04).
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

  const result = await sweepAgentUnavailableFlags()
  console.log(`[availability-sweep] checked ${result.checked} assignees, flagged ${result.flagged}, cleared ${result.cleared}`)

  return NextResponse.json({ ok: true, ...result })
}
