import { NextRequest, NextResponse } from "next/server"
import { sweepMailboxSync } from "@/lib/mailbox-sync"
import { withSystemScope } from "@/lib/request-scope"

// EM-05: polls OAuth (Microsoft 365 / Google) and IMAP mailboxes for new mail
// and opens tickets from it — see lib/mailbox-sync.ts. Resend mailboxes are
// webhook-driven and not touched here.
export const maxDuration = 300

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

  const result = await sweepMailboxSync()
  console.log(`[mailbox-sync] synced ${result.mailboxes} mailbox(es), ${result.processed} message(s)`)

  return NextResponse.json({ ok: true, ...result })
}
