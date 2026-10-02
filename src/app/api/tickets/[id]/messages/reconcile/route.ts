import { NextRequest, NextResponse } from "next/server"
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getResendClient, processInboundEmail } from "@/lib/process-inbound-email"
import { extractReplyToken } from "@/lib/customer-conversation"
import {
  extractReferencedIds,
  extractTicketReferenceFromSubject,
  messageIdLookupVariants,
  normalizeHeaderKeys,
} from "@/lib/inbound-email"
import { syncWorkTimerWithLatestConversation } from "@/lib/timer-conversation-sync"

// How far back to look for missed emails (7 days)
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * POST /api/tickets/[id]/messages/reconcile
 *
 * On-open reconciliation: fetches the last page of received emails from Resend,
 * finds any that belong to this ticket but aren't in the DB yet, and processes
 * them. Called when a user opens the Chat tab.
 *
 * Matches via intake reply-token, subject ticket ref (PREFIX-N), header
 * threading against existing messages, or mailbox address + subject for
 * mailbox-created tickets.
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
      ticketNumber: true,
      createdAt: true,
      subDepartmentId: true,
      assigneeId: true,
      tenantId: true,
      creatorId: true,
      deletedAt: true,
      assignees: { select: { userId: true } },
      subDepartment: { select: { departmentId: true, prefix: true } },
      intake: { select: { replyToken: true } },
    },
  })
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const accessError = await assertTicketAccess(profile, ticket, { forWrite: false })
  if (accessError) return accessError

  // Reconciliation also heals a timer event missed by this app instance. This
  // matters in local/shared-DB development where another instance may have
  // stored the inbound message before the local server was running.
  await syncWorkTimerWithLatestConversation(ticketId).catch((err) =>
    console.error("[reconcile] failed to sync conversation timer:", err),
  )

  const resend = getResendClient()
  if (!resend) {
    return NextResponse.json({ reconciled: 0 })
  }

  const replyToken = ticket.intake?.replyToken ?? null
  const humanRef = `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`.toUpperCase()

  const [mailboxRoutes, existingMessages] = await Promise.all([
    prisma.mailboxConnection.findMany({
      where: { subDepartmentId: ticket.subDepartmentId },
      select: { address: true },
    }),
    prisma.ticketMessage.findMany({
      where: { ticketId, providerMessageId: { not: null } },
      select: { providerMessageId: true },
    }),
  ])

  const mailboxAddresses = new Set(
    mailboxRoutes.map((r) => r.address.trim().toLowerCase()).filter(Boolean),
  )
  const knownMessageIds = new Set(
    existingMessages.flatMap((m) => messageIdLookupVariants(m.providerMessageId)),
  )

  // Nothing to match against and no reply token / mailbox — nothing to recover.
  if (!replyToken && mailboxAddresses.size === 0 && knownMessageIds.size === 0) {
    return NextResponse.json({ reconciled: 0 })
  }

  const { data: list, error: listError } = await resend.emails.receiving.list({ limit: 100 })
  if (listError || !list?.data) {
    console.error("[reconcile] failed to list received emails:", listError)
    return NextResponse.json({ reconciled: 0 })
  }

  const cutoff = Math.max(Date.now() - LOOKBACK_MS, ticket.createdAt.getTime() - 60_000)

  type Candidate = (typeof list.data)[number]
  const candidates: Candidate[] = []

  for (const email of list.data) {
    if (new Date(email.created_at).getTime() < cutoff) continue

    const toAddrs = email.to.map((a) => a.trim().toLowerCase())
    const tokenMatch =
      !!replyToken && toAddrs.some((addr) => extractReplyToken(addr) === replyToken)

    const subjectRef = extractTicketReferenceFromSubject(email.subject)
    const subjectMatch =
      !!subjectRef &&
      subjectRef.prefix === ticket.subDepartment.prefix.toUpperCase() &&
      subjectRef.number === ticket.ticketNumber

    const mailboxMatch = toAddrs.some((addr) => mailboxAddresses.has(addr))

    // Cheap filters first; header match needs a fetch and is done below.
    if (tokenMatch || subjectMatch || (mailboxMatch && (subjectMatch || knownMessageIds.size > 0))) {
      candidates.push(email)
      continue
    }

    // Mailbox-only without subject: still a candidate if we can prove header
    // threading after fetch — defer to the fetch loop below via a soft list.
    if (mailboxMatch && knownMessageIds.size > 0) {
      candidates.push(email)
    }
  }

  // Also consider mailbox mail whose subject contains the human id string
  // (covers clients that rephrase "Re: [SUP-42] …").
  for (const email of list.data) {
    if (candidates.includes(email)) continue
    if (new Date(email.created_at).getTime() < cutoff) continue
    const toAddrs = email.to.map((a) => a.trim().toLowerCase())
    if (!toAddrs.some((addr) => mailboxAddresses.has(addr))) continue
    if ((email.subject ?? "").toUpperCase().includes(humanRef)) {
      candidates.push(email)
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({ reconciled: 0 })
  }

  // Find which message_ids are already stored (any variant)
  const existing = await prisma.ticketMessage.findMany({
    where: {
      providerMessageId: {
        in: candidates.flatMap((e) => messageIdLookupVariants(e.message_id)),
      },
    },
    select: { providerMessageId: true },
  })
  const storedIds = new Set(existing.flatMap((m) => messageIdLookupVariants(m.providerMessageId)))

  const missing = candidates.filter(
    (e) => !messageIdLookupVariants(e.message_id).some((v) => storedIds.has(v)),
  )

  if (missing.length === 0) {
    return NextResponse.json({ reconciled: 0 })
  }

  console.log(`[reconcile] ticket ${ticketId}: found ${missing.length} candidate email(s), verifying`)

  let reconciled = 0
  for (const email of missing) {
    try {
      // For mailbox candidates without token/subject certainty, confirm via
      // headers before processing (avoids creating a sibling ticket).
      const toAddrs = email.to.map((a) => a.trim().toLowerCase())
      const tokenMatch =
        !!replyToken && toAddrs.some((addr) => extractReplyToken(addr) === replyToken)
      const subjectRef = extractTicketReferenceFromSubject(email.subject)
      const subjectMatch =
        !!subjectRef &&
        subjectRef.prefix === ticket.subDepartment.prefix.toUpperCase() &&
        subjectRef.number === ticket.ticketNumber
      const subjectIncludesRef = (email.subject ?? "").toUpperCase().includes(humanRef)

      let belongs = tokenMatch || subjectMatch || subjectIncludesRef

      if (!belongs && knownMessageIds.size > 0) {
        const { data: full } = await resend.emails.receiving.get(email.id)
        if (full?.headers) {
          const headers = normalizeHeaderKeys(full.headers as Record<string, string>)
          const refs = extractReferencedIds(
            headers["in-reply-to"] ?? null,
            headers["references"] ?? null,
          )
          belongs = messageIdLookupVariants(...refs).some((id) => knownMessageIds.has(id))
        }
      }

      if (!belongs) continue

      const stored = await processInboundEmail(email.id, email.message_id, email.to)
      if (stored) reconciled++
    } catch (err) {
      console.error("[reconcile] failed to process email:", email.id, err)
    }
  }

  console.log(`[reconcile] ticket ${ticketId}: reconciled ${reconciled} message(s)`)
  return NextResponse.json({ reconciled })
}
