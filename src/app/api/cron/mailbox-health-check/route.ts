import { NextRequest, NextResponse } from "next/server"
import { sweepMailboxConnectionHealth } from "@/lib/mailbox-connection"
import { withSystemScope } from "@/lib/request-scope"

// Vercel Cron Jobs invoke routes via GET with an Authorization header.
// EM-07: surfaces mailbox connection failures within one polling cycle and
// retries with exponential backoff — see lib/mailbox-connection.ts.
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

  const result = await sweepMailboxConnectionHealth()
  console.log(`[mailbox-health-check] checked ${result.checked} connections`)

  return NextResponse.json({ ok: true, ...result })
}
