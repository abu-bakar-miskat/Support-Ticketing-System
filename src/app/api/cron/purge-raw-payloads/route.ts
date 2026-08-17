import { NextRequest, NextResponse } from "next/server"
import { purgeRawPayloads } from "@/lib/raw-payload-purge"
import { withSystemScope } from "@/lib/request-scope"

// Vercel Cron Jobs invoke routes via GET with an Authorization header.
// Cron job — no caller; runs cross-tenant under system scope.
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

  const purged = await purgeRawPayloads()
  console.log(`[purge-raw-payloads] purged ${purged} records`)

  return NextResponse.json({ ok: true, purged })
}
