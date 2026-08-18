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
} from "@/lib/inbound-email"
import { notifyCustomerReply } from "@/lib/notify-customer-reply"
import { notifyQuarantinedReply } from "@/lib/notify-quarantined-reply"
import { classifyAttachment, INBOUND_MAX_BYTES } from "@/lib/message-attachments"
import { maybeReopenTicket } from "@/lib/customer-reopen"
import { isOverRateLimit } from "@/lib/inbound-rate-limit"
import { getMailProvider, type MailProvider, type NormalizedAttachment } from "@/lib/mail-providers"
import { findMailboxRouteForRecipients, logMailSuppression } from "@/lib/mailbox-connection"
import { createTicketFromInboundEmail } from "@/lib/mailbox-ticket-creation"

// Re-exported for existing call sites (webhook route, reconcile route) — the
// implementation lives in lib/resend-client.ts so lib/mail-providers/resend-provider.ts
// can depend on it without a module cycle back through this file.
export { getResendClient } from "@/lib/resend-client"

type MatchedTicket = {
  id: string
  title: string
  ticketNumber: number
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
  // Idempotency check
  const existing = await prisma.ticketMessage.findFirst({
    where: { providerMessageId: messageId },
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

  const headers = email.headers
  const isSystem = isAutoReply(headers)
  const { name: fromName, email: fromEmail } = parseFromAddress(email.from)

  let ticket: MatchedTicket | null = null
  let submitterEmail: string | null = null
  let isNewTicket = false

  const token = recipients.map(extractReplyToken).find(Boolean) ?? null
  if (token) {
    const intake = await prisma.intake.findUnique({
      where: { replyToken: token },
      select: {
        submitterEmail: true,
        ticket: {
          select: {
            id: true, title: true, ticketNumber: true,
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
    if (refIds.length > 0) {
      const prior = await prisma.ticketMessage.findFirst({
        where: { providerMessageId: { in: refIds } },
        select: {
          ticket: {
            select: {
              id: true, title: true, ticketNumber: true,
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
          id: true, title: true, ticketNumber: true,
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
    // EM-01/02/03: no existing conversation matched — check whether this
    // landed in a connected mailbox, and if so either suppress it (EM-06,
    // auto-generated mail never creates a ticket) or file a new one.
    const route = await findMailboxRouteForRecipients(recipients)
    if (!route) {
      console.log("[inbound] no matching ticket or mailbox route, dropping message:", messageId)
      return false
    }

    if (isSystem) {
      await logMailSuppression({
        tenantId: route.tenantId,
        mailboxConnectionId: route.id,
        providerMessageId: messageId,
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
      })
    } catch (err) {
      // DS-08: the department hasn't completed setup yet — drop the message
      // rather than fail the whole webhook. Not logged as a suppression
      // (that's specifically for auto-generated mail, EM-06); this is just
      // "not accepting tickets yet".
      console.log("[inbound] mailbox route's department isn't operational, dropping:", messageId, err)
      return false
    }
    ticket = {
      id: createdTicket.id,
      title: email.subject?.trim() || `Email from ${fromName || fromEmail}`,
      ticketNumber: createdTicket.ticketNumber,
      assigneeId: createdTicket.assigneeId,
      creatorId: createdTicket.creatorId,
      subDepartmentId: route.subDepartmentId,
      subDepartment: { prefix: createdTicket.teamPrefix },
    }
    isNewTicket = true
  }

  // A freshly-created ticket has no baseline submitter email to verify
  // against, so its first message is always "trusted" — never quarantined.
  const senderVerified = isNewTicket || !submitterEmail || fromEmail === submitterEmail.toLowerCase()
  const messageStatus = isSystem ? "system" : (senderVerified ? "trusted" : "quarantined")
  const { bodyHtml, quoted } = pickBody(email.text, email.html)
  const throttled = !isSystem && !isNewTicket && await isOverRateLimit(ticket.id)

  const created = await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      direction: "inbound",
      status: messageStatus,
      authorProfileId: null,
      fromName,
      fromEmail,
      bodyHtml,
      throttled,
      rawPayload: {
        from: email.from, to: email.to, subject: email.subject,
        text: email.text, html: email.html, headers, quotedText: quoted,
      },
      providerMessageId: messageId,
      inReplyTo: headers["in-reply-to"] ?? null,
    },
    select: { id: true, direction: true, status: true, bodyHtml: true, fromName: true, fromEmail: true, createdAt: true, throttled: true },
  })

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

  // The new-ticket path already fired an assignment/failure notification from
  // createTicketFromInboundEmail — a "customer replied"/reopen notification
  // for its own first message would be redundant (and reopen never applies
  // to a ticket that was just created).
  if (isSystem || throttled || isNewTicket) return true

  if (messageStatus === "trusted") {
    await maybeReopenTicket(ticket.id, ticket.subDepartmentId, ticket.creatorId)
  }

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
