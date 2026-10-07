import "server-only"
import { prisma } from "@/lib/db"
import { createAdminClient } from "@/lib/supabase/admin"
import { extractReplyToken } from "@/lib/customer-conversation"
import {
  isAutoReply,
  pickBody,
  parseFromAddress,
  extractReferencedIds,
  extractTicketReferenceFromSubject,
  normalizeHeaderKeys,
  normalizeMessageId,
  messageIdLookupVariants,
} from "@/lib/inbound-email"
import { notifyCustomerReply } from "@/lib/notify-customer-reply"
import { notifyQuarantinedReply } from "@/lib/notify-quarantined-reply"
import { classifyAttachment, INBOUND_MAX_BYTES } from "@/lib/message-attachments"
import { maybeReopenTicket } from "@/lib/customer-reopen"
import { isOverRateLimit } from "@/lib/inbound-rate-limit"
import { syncWorkTimerWithConversation } from "@/lib/timer-conversation-sync"
import { getMailProvider, type MailProvider, type NormalizedAttachment } from "@/lib/mail-providers"
import { findMailboxConnectionForRecipients, logMailSuppression } from "@/lib/mailbox-connection"
import { broadcastMailboxMail } from "@/lib/realtime-broadcast"
import {
  createTicketFromInboundEmail,
  DuplicateInboundEmailError,
  MailboxInactiveError,
} from "@/lib/mailbox-ticket-creation"
import { DepartmentNotOperationalError } from "@/lib/department-setup"
import { normalizeStatus } from "@/components/board/board-types"

// Re-exported for existing call sites (webhook route, reconcile route) — the
// implementation lives in lib/resend-client.ts so lib/mail-providers/resend-provider.ts
// can depend on it without a module cycle back through this file.
export { getResendClient } from "@/lib/resend-client"

type MatchedTicket = {
  id: string
  title: string
  ticketNumber: number
  status: string
  assigneeId: string | null
  creatorId: string
  subDepartmentId: string
  subDepartment: { prefix: string }
}

/** Display shape returned to the realtime broadcast (mirrors MessageData.attachments). */
type StoredAttachment = { id: string; storageUrl: string; fileName: string; fileSize: number }

async function storeInboundAttachments(
  provider: MailProvider,
  emailId: string,
  ticketId: string,
  messageDbId: string,
  uploaderProfileId: string,
  attachments: NormalizedAttachment[],
): Promise<StoredAttachment[]> {
  if (attachments.length === 0) return []
  console.log(`[inbound] storing ${attachments.length} attachment(s) for message ${messageDbId}`)

  // Must use service-role client — no user session in webhook/cron context.
  const supabase = createAdminClient()

  const results = await Promise.allSettled(
    attachments.map(async (att): Promise<StoredAttachment | null> => {
      const classification = classifyAttachment(att.contentType, att.size, att.filename)
      if (classification === "too_large") {
        console.log(`[inbound] attachment too large (${att.size} > ${INBOUND_MAX_BYTES}), skipping: ${att.filename}`)
        return null
      }

      const downloadUrl = await provider.fetchAttachmentUrl(emailId, att.id)
      if (!downloadUrl) {
        console.error("[inbound] failed to get attachment download URL, att.id:", att.id)
        return null
      }

      const response = await fetch(downloadUrl)
      if (!response.ok) {
        console.error("[inbound] failed to download attachment:", response.status, att.filename)
        return null
      }
      const buffer = await response.arrayBuffer()

      const safeName = (att.filename ?? "attachment").replace(/[^\w.\-()+ ]/g, "_").slice(0, 200)
      const storagePath = `${ticketId}/msg-${messageDbId}/${Date.now()}-${safeName}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(storagePath, buffer, { contentType: att.contentType, upsert: false })

      if (uploadError) {
        console.error("[inbound] supabase upload failed:", uploadError.message, "path:", storagePath)
        return null
      }

      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(uploadData.path)

      const created = await prisma.attachment.create({
        data: {
          ticketId,
          messageId: messageDbId,
          uploaderProfileId,
          storageUrl: publicUrl,
          fileName: att.filename ?? "attachment",
          fileSize: att.size,
          status: classification === "blocked_type" ? "blocked_type" : "attached",
        },
        select: { id: true, storageUrl: true, fileName: true, fileSize: true },
      })
      console.log(`[inbound] stored attachment: ${att.filename} → ${publicUrl}`)
      return created
    }),
  )

  const stored: StoredAttachment[] = []
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[inbound] attachment[${i}] (${attachments[i]?.filename}) failed:`, r.reason)
    } else if (r.value) {
      stored.push(r.value)
    }
  })
  return stored
}

export async function broadcastChatMessage(
  ticketId: string,
  message: Record<string, unknown>,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return
  await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      messages: [{
        topic: `ticket-chat:${ticketId}`,
        event: "new_message",
        payload: message,
        private: false,
      }],
    }),
  })
}

/**
 * Fetch a received email from Resend, match it to a ticket, persist it, and
 * fire notifications. Idempotent — call safely on duplicates.
 *
 * Returns true if a new message was stored, false if skipped.
 */
export async function processInboundEmail(
  emailId: string,
  messageId: string,
  recipients: string[],
): Promise<boolean> {
  const normalizedMessageId = normalizeMessageId(messageId) || messageId
  const idVariants = messageIdLookupVariants(messageId)

  // Idempotency check (normalized + legacy bracketed / bare forms)
  const existing = await prisma.ticketMessage.findFirst({
    where: { providerMessageId: { in: idVariants } },
    select: { id: true },
  })
  if (existing) return false

  console.log("[inbound] processInboundEmail start — emailId:", emailId, "recipients:", recipients)

  const provider = getMailProvider("RESEND")
  if (!provider) {
    console.error("[inbound] RESEND_API_KEY is not configured")
    return false
  }

  const email = await provider.fetchMessage(emailId)
  if (!email) {
    console.error("[inbound] failed to fetch email body")
    return false
  }

  console.log("[inbound] email fetched — from:", email.from, "subject:", email.subject)

  const headers = normalizeHeaderKeys(email.headers)
  const isSystem = isAutoReply(headers)
  const { name: fromName, email: fromEmail } = parseFromAddress(email.from)
  const { bodyHtml, quoted } = pickBody(email.text, email.html)

  let ticket: MatchedTicket | null = null
  let submitterEmail: string | null = null
  let isNewTicket = false
  let mailboxConnectionId: string | null = null
  // Set when the new-ticket path already stored this email as the ticket's
  // first message (atomically with the ticket).
  let newTicketMessage: Awaited<ReturnType<typeof createTicketFromInboundEmail>>["message"] | null = null

  const messageData = (status: "trusted" | "quarantined" | "system", throttled: boolean) => ({
    direction: "inbound" as const,
    status,
    authorProfileId: null,
    fromName,
    fromEmail,
    bodyHtml,
    throttled,
    rawPayload: {
      from: email.from, to: email.to, subject: email.subject,
      text: email.text, html: email.html, headers, quotedText: quoted,
      resendEmailId: emailId,
      // The webhook envelope is the source used to route direct mail. Keep
      // it separately from the provider's fetched `to` field, which can be
      // rewritten during forwarding. The resolved connection makes mailbox
      // filtering unambiguous and excludes ordinary ticket replies.
      envelopeTo: recipients,
      mailboxConnectionId,
    },
    providerMessageId: normalizedMessageId,
    inReplyTo: headers["in-reply-to"] ?? null,
  })

  const token = recipients.map(extractReplyToken).find(Boolean) ?? null
  if (token) {
    const intake = await prisma.intake.findUnique({
      where: { replyToken: token },
      select: {
        submitterEmail: true,
        ticket: {
          select: {
            id: true, title: true, ticketNumber: true, status: true,
            assigneeId: true, creatorId: true, subDepartmentId: true,
            subDepartment: { select: { prefix: true } },
          },
        },
      },
    })
    if (intake?.ticket) {
      ticket = intake.ticket
      submitterEmail = intake.submitterEmail
    }
  }

  if (!ticket) {
    const refIds = extractReferencedIds(
      headers["in-reply-to"] ?? null,
      headers["references"] ?? null,
    )
    const lookupIds = messageIdLookupVariants(...refIds)
    if (lookupIds.length > 0) {
      const prior = await prisma.ticketMessage.findFirst({
        where: { providerMessageId: { in: lookupIds } },
        select: {
          ticket: {
            select: {
              id: true, title: true, ticketNumber: true, status: true,
              assigneeId: true, creatorId: true, subDepartmentId: true,
              subDepartment: { select: { prefix: true } },
              intake: { select: { submitterEmail: true } },
            },
          },
        },
      })
      if (prior?.ticket) {
        ticket = prior.ticket
        submitterEmail = prior.ticket.intake?.submitterEmail ?? null
      }
    }
  }

  // EM-04 last-resort fallback: a human ticket reference (e.g. "SUP-42") in
  // the subject line, for clients that drop custom headers on reply.
  if (!ticket) {
    const ref = extractTicketReferenceFromSubject(email.subject)
    if (ref) {
      const bySubject = await prisma.ticket.findFirst({
        where: {
          ticketNumber: ref.number,
          deletedAt: null,
          subDepartment: { prefix: { equals: ref.prefix, mode: "insensitive" } },
        },
        select: {
          id: true, title: true, ticketNumber: true, status: true,
          assigneeId: true, creatorId: true, subDepartmentId: true,
          subDepartment: { select: { prefix: true } },
          intake: { select: { submitterEmail: true } },
        },
      })
      if (bySubject) {
        ticket = bySubject
        submitterEmail = bySubject.intake?.submitterEmail ?? null
      }
    }
  }

  if (!ticket) {
    // Always resolve the configured mailbox first. Its on/off state controls
    // ticket creation only; it must never control whether the provider's email
    // is received and recorded in the application's mailbox view.
    const mailbox = await findMailboxConnectionForRecipients(recipients)
    if (!mailbox) {
      console.log("[inbound] no matching mailbox route, dropping message:", messageId)
      return false
    }

    if (!mailbox.isActive) {
        await logMailSuppression({
          tenantId: mailbox.tenantId,
          mailboxConnectionId: mailbox.id,
          providerMessageId: normalizedMessageId,
          fromEmail,
          toAddress: mailbox.address,
          subject: email.subject,
          reason: "mailbox_paused",
        })
        broadcastMailboxMail(mailbox.departmentId, mailbox.subDepartmentId)
          .catch((err) => console.error("[inbound] failed to broadcast paused mailbox mail:", err))
        console.log("[inbound] received email at paused mailbox without creating a ticket:", messageId)
        return false
    }

    const route = mailbox
    mailboxConnectionId = route.id

    if (isSystem) {
      await logMailSuppression({
        tenantId: route.tenantId,
        mailboxConnectionId: route.id,
        providerMessageId: normalizedMessageId,
        fromEmail,
        toAddress: route.address,
        subject: email.subject,
        reason: "auto_generated",
      })
      console.log("[inbound] suppressed auto-generated mail at connected mailbox:", route.address, messageId)
      return false
    }

    let createdTicket
    try {
      createdTicket = await createTicketFromInboundEmail({
        departmentId: route.departmentId,
        teamId: route.subDepartmentId,
        fromEmail,
        fromName,
        subject: email.subject,
        description: bodyHtml,
        mailboxConnectionId: route.id,
        // A freshly-created ticket has no baseline submitter email to verify
        // against, so its first message is always "trusted" — never quarantined.
        inboundMessage: { providerMessageIds: idVariants, data: messageData("trusted", false) },
      })
    } catch (err) {
      // A concurrent run of this same email already created its ticket.
      if (err instanceof DuplicateInboundEmailError) {
        console.log("[inbound] duplicate inbound email skipped at ticket creation:", normalizedMessageId)
        return false
      }
      // DS-08: the department hasn't completed setup yet — drop the message
      // rather than fail the whole webhook. Not logged as a suppression
      // (that's specifically for auto-generated mail, EM-06); this is just
      // "not accepting tickets yet".
      if (err instanceof DepartmentNotOperationalError) {
        console.log("[inbound] mailbox route's department isn't operational yet, dropping:", messageId)
        return false
      }
      // The mailbox can be turned off after route resolution but before the
      // creation transaction takes its row lock. That is an intentional drop;
      // retrying it would keep reopening tickets while the mailbox is paused.
      if (err instanceof MailboxInactiveError) {
        await logMailSuppression({
          tenantId: route.tenantId,
          mailboxConnectionId: route.id,
          providerMessageId: normalizedMessageId,
          fromEmail,
          toAddress: route.address,
          subject: email.subject,
          reason: "mailbox_paused",
        })
        broadcastMailboxMail(route.departmentId, route.subDepartmentId)
          .catch((broadcastErr) => console.error("[inbound] failed to broadcast paused mailbox mail:", broadcastErr))
        console.log("[inbound] mailbox was turned off before ticket creation, dropping:", messageId)
        return false
      }
      // Any other failure is unexpected — do NOT silently drop the customer's
      // email. Re-throw so the webhook returns 500 and Resend retries, and the
      // error is visible in logs. createTicketFromInboundEmail only throws
      // before it commits the ticket (all post-commit work is best-effort), so
      // a retry re-runs cleanly without duplicating a ticket.
      console.error("[inbound] createTicketFromInboundEmail failed unexpectedly, will retry:", messageId, err)
      throw err
    }
    ticket = {
      id: createdTicket.id,
      title: email.subject?.trim() || `Email from ${fromName || fromEmail}`,
      ticketNumber: createdTicket.ticketNumber,
      status: "OPEN",
      assigneeId: createdTicket.assigneeId,
      creatorId: createdTicket.creatorId,
      subDepartmentId: route.subDepartmentId,
      subDepartment: { prefix: createdTicket.subDepartmentPrefix },
    }
    isNewTicket = true
    newTicketMessage = createdTicket.message
  }

  // A freshly-created ticket has no baseline submitter email to verify
  // against, so its first message is always "trusted" — never quarantined.
  const senderVerified = isNewTicket || !submitterEmail || fromEmail === submitterEmail.toLowerCase()
  const messageStatus = isSystem ? "system" : (senderVerified ? "trusted" : "quarantined")
  const throttled = !isSystem && !isNewTicket && await isOverRateLimit(ticket.id)

  // Create atomically under a per-message-id advisory lock. The top-of-function
  // idempotency check is only a fast path — it is not atomic with the insert, so
  // two runs of the same inbound email (Resend's at-least-once webhook delivery,
  // or the webhook racing the on-open reconcile) can both pass it and both
  // insert, surfacing the reply twice on the ticket. A transaction-scoped
  // advisory lock serializes those runs across connections/instances (a session
  // lock wouldn't survive the transaction pooler), and the re-check inside the
  // lock skips the insert when a concurrent run already committed it.
  const created = newTicketMessage ?? await prisma.$transaction(async (tx) => {
    // $executeRaw (not $queryRaw): pg_advisory_xact_lock returns SQL `void`, which
    // the driver adapter can't deserialize as a result column. We only need the
    // lock's side effect, so execute without reading the result set.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${normalizedMessageId}))`
    const dup = await tx.ticketMessage.findFirst({
      where: { providerMessageId: { in: idVariants } },
      select: { id: true },
    })
    if (dup) return null
    return tx.ticketMessage.create({
      data: { ...messageData(messageStatus, throttled), ticketId: ticket.id },
      select: { id: true, direction: true, status: true, bodyHtml: true, fromName: true, fromEmail: true, createdAt: true, throttled: true },
    })
  })

  // A concurrent run already stored this email — don't double-store attachments,
  // re-broadcast, or re-notify.
  if (!created) {
    console.log("[inbound] duplicate inbound email skipped at create:", normalizedMessageId)
    return false
  }

  // Resume work immediately after the inbound message commits. Keep this ahead
  // of attachment downloads, mailbox broadcasts, and notifications so those
  // slower side effects cannot delay the assignee's timer.
  if (!isSystem && !isNewTicket && messageStatus === "trusted") {
    if (!throttled && normalizeStatus(ticket.status) !== "In Progress") {
      await maybeReopenTicket(ticket.id, ticket.subDepartmentId, ticket.creatorId)
    }
    await syncWorkTimerWithConversation(ticket.id, "inbound").catch((err) =>
      console.error("[inbound] failed to resume work timer:", err),
    )
  }

  // Store attachments before broadcasting so the realtime payload carries them —
  // the client appends the broadcast directly with no refetch, so an empty list
  // here would hide inbound images until a manual reload.
  const storedAttachments =
    email.attachments.length > 0
      ? await storeInboundAttachments(provider, emailId, ticket.id, created.id, ticket.creatorId, email.attachments)
      : []

  broadcastChatMessage(ticket.id, {
    id: created.id,
    direction: created.direction,
    status: created.status,
    body: created.bodyHtml,
    fromName: created.fromName,
    fromEmail: created.fromEmail,
    throttled: created.throttled,
    authorId: null,
    authorName: null,
    authorAvatarUrl: null,
    createdAt: created.createdAt.toISOString(),
    attachments: storedAttachments,
  }).catch(() => undefined)

  // Touch the ticket row so the existing Ticket-UPDATE realtime subscription
  // fires even when no status change occurs — that's what refreshes the
  // "Waiting for customer/assignee" badge on the task list and board views.
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { updatedAt: new Date() },
  }).catch((err) => console.error("[inbound] failed to touch ticket for realtime badge:", err))

  // Refresh any open Received-mail panel (department + sub-department scoped) so
  // this newly arrived email shows up without a manual reload. Covers both new
  // tickets and replies threaded onto an existing one.
  await prisma.subDepartment
    .findUnique({ where: { id: ticket.subDepartmentId }, select: { departmentId: true } })
    .then((sd) => {
      if (sd) return broadcastMailboxMail(sd.departmentId, ticket.subDepartmentId)
    })
    .catch((err) => console.error("[inbound] failed to broadcast mailbox mail:", err))

  // The new-ticket path already fired an assignment/failure notification from
  // createTicketFromInboundEmail — a "customer replied"/reopen notification
  // for its own first message would be redundant (and reopen never applies
  // to a ticket that was just created).
  if (isSystem || isNewTicket) return true

  if (throttled) return true

  if (messageStatus === "quarantined") {
    await notifyQuarantinedReply({
      ticketId: ticket.id, ticketTitle: ticket.title,
      subDepartmentId: ticket.subDepartmentId, assigneeId: ticket.assigneeId, creatorId: ticket.creatorId,
    })
    return true
  }

  await notifyCustomerReply({
    ticketId: ticket.id, ticketTitle: ticket.title,
    subDepartmentId: ticket.subDepartmentId, assigneeId: ticket.assigneeId, creatorId: ticket.creatorId,
  })

  return true
}
