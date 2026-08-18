import { NextRequest, NextResponse } from "next/server"
import { sweepStuckBulkReassignJobs } from "@/lib/bulk-reassign"
import { withSystemScope } from "@/lib/request-scope"

// Vercel Cron Jobs invoke routes via GET with an Authorization header.
// Resumes any bulk-reassign job whose `after()` kick-off never finished (see
// lib/bulk-reassign.ts) — C-05's idempotent-on-retry guarantee.
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

  const resumed = await sweepStuckBulkReassignJobs()
  console.log(`[bulk-reassign-sweep] resumed ${resumed} stuck jobs`)

  return NextResponse.json({ ok: true, resumed })
}
