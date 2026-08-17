import { NextRequest, NextResponse } from "next/server"
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getResendClient, processInboundEmail } from "@/lib/process-inbound-email"
import { extractReplyToken } from "@/lib/customer-conversation"

// How far back to look for missed emails (7 days)
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * POST /api/tickets/[id]/messages/reconcile
 *
 * On-open reconciliation: fetches the last page of received emails from Resend,
 * finds any that belong to this ticket but aren't in the DB yet, and processes
 * them. Called when a user opens the Chat tab.
 *
 * Returns { reconciled: number } — how many new messages were recovered.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: ticketId } = await params

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      teamId: true,
      assigneeId: true,
      tenantId: true,
      creatorId: true,
      deletedAt: true,
      assignees: { select: { userId: true } },
      team: { select: { departmentId: true } },
      intake: { select: { replyToken: true } },
    },
  })
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const accessError = await assertTicketAccess(profile, ticket, { forWrite: false })
  if (accessError) return accessError

  // Tickets without an intake (no reply token) have no email thread to reconcile
  if (!ticket.intake?.replyToken) {
    return NextResponse.json({ reconciled: 0 })
  }

  const resend = getResendClient()
  if (!resend) {
    return NextResponse.json({ reconciled: 0 })
  }

  const replyToken = ticket.intake.replyToken

  // Fetch the most recent page of received emails from Resend
  const { data: list, error: listError } = await resend.emails.receiving.list({ limit: 100 })
  if (listError || !list?.data) {
    console.error("[reconcile] failed to list received emails:", listError)
    return NextResponse.json({ reconciled: 0 })
  }

  const cutoff = Date.now() - LOOKBACK_MS

  // Filter to emails that:
  //   • are within the lookback window
  //   • have a recipient address containing this ticket's reply token
  const candidates = list.data.filter((email) => {
    if (new Date(email.created_at).getTime() < cutoff) return false
    return email.to.some((addr) => extractReplyToken(addr) === replyToken)
  })

  if (candidates.length === 0) {
    return NextResponse.json({ reconciled: 0 })
  }

  // Find which message_ids are already stored
  const existing = await prisma.ticketMessage.findMany({
    where: { providerMessageId: { in: candidates.map((e) => e.message_id) } },
    select: { providerMessageId: true },
  })
  const storedIds = new Set(existing.map((m) => m.providerMessageId))

  const missing = candidates.filter((e) => !storedIds.has(e.message_id))

  if (missing.length === 0) {
    return NextResponse.json({ reconciled: 0 })
  }

  console.log(`[reconcile] ticket ${ticketId}: found ${missing.length} missing email(s), processing`)

  // Process sequentially to avoid race conditions on rate-limit counters
  let reconciled = 0
  for (const email of missing) {
    try {
      const stored = await processInboundEmail(email.id, email.message_id, email.to)
      if (stored) reconciled++
    } catch (err) {
      console.error("[reconcile] failed to process email:", email.id, err)
    }
  }

  console.log(`[reconcile] ticket ${ticketId}: reconciled ${reconciled} message(s)`)
  return NextResponse.json({ reconciled })
}
