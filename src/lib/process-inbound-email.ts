import "server-only"
import { Resend } from "resend"
import type { InboundAttachment } from "resend"
import { prisma } from "@/lib/db"
import { createAdminClient } from "@/lib/supabase/admin"
import { extractReplyToken } from "@/lib/customer-conversation"
import { isAutoReply, pickBody, parseFromAddress, extractReferencedIds } from "@/lib/inbound-email"
import { notifyCustomerReply } from "@/lib/notify-customer-reply"
import { notifyQuarantinedReply } from "@/lib/notify-quarantined-reply"
import { classifyAttachment, INBOUND_MAX_BYTES } from "@/lib/message-attachments"
import { maybeReopenTicket } from "@/lib/customer-reopen"
import { isOverRateLimit } from "@/lib/inbound-rate-limit"

let resendClient: Resend | null = null

/** Lazily create the Resend client so missing API keys don't crash module load at build time. */
export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!resendClient) resendClient = new Resend(apiKey)
  return resendClient
}

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
  emailId: string,
  ticketId: string,
  messageDbId: string,
  uploaderProfileId: string,
  attachments: InboundAttachment[],
): Promise<StoredAttachment[]> {
  if (attachments.length === 0) return []
  console.log(`[inbound] storing ${attachments.length} attachment(s) for message ${messageDbId}`)

  // Must use service-role client — no user session in webhook/cron context.
  const supabase = createAdminClient()

  const results = await Promise.allSettled(
    attachments.map(async (att): Promise<StoredAttachment | null> => {
      const classification = classifyAttachment(att.content_type, att.size, att.filename)
      if (classification === "too_large") {
        console.log(`[inbound] attachment too large (${att.size} > ${INBOUND_MAX_BYTES}), skipping: ${att.filename}`)
        return null
      }

      const resend = getResendClient()
      if (!resend) return null

      const { data: attData, error: attError } = await resend.emails.receiving.attachments.get({
        emailId,
        id: att.id,
      })
      if (attError || !attData?.download_url) {
        console.error("[inbound] failed to get attachment download URL:", attError, "att.id:", att.id)
        return null
      }

      const response = await fetch(attData.download_url)
      if (!response.ok) {
        console.error("[inbound] failed to download attachment:", response.status, att.filename)
        return null
      }
      const buffer = await response.arrayBuffer()

      const safeName = (att.filename ?? "attachment").replace(/[^\w.\-()+ ]/g, "_").slice(0, 200)
      const storagePath = `${ticketId}/msg-${messageDbId}/${Date.now()}-${safeName}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(storagePath, buffer, { contentType: att.content_type, upsert: false })

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

  const resend = getResendClient()
  if (!resend) {
    console.error("[inbound] RESEND_API_KEY is not configured")
    return false
  }

  const { data: email, error } = await resend.emails.receiving.get(emailId)
  if (error || !email) {
    console.error("[inbound] failed to fetch email body:", error)
    return false
  }

  console.log("[inbound] email fetched — from:", email.from, "subject:", email.subject)

  const headers = email.headers ?? {}
  const isSystem = isAutoReply(headers)
  const { name: fromName, email: fromEmail } = parseFromAddress(email.from)

  let ticket: MatchedTicket | null = null
  let submitterEmail: string | null = null

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

  if (!ticket) {
    console.log("[inbound] no matching ticket, dropping message:", messageId)
    return false
  }

  const senderVerified = !submitterEmail || fromEmail === submitterEmail.toLowerCase()
  const messageStatus = isSystem ? "system" : (senderVerified ? "trusted" : "quarantined")
  const { bodyHtml, quoted } = pickBody(email.text, email.html)
  const throttled = !isSystem && await isOverRateLimit(ticket.id)

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
      ? await storeInboundAttachments(emailId, ticket.id, created.id, ticket.creatorId, email.attachments)
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

  if (isSystem || throttled) return true

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
