import { NextRequest, NextResponse } from "next/server"
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { RESEND_RECEIVING_ENABLED, getEmailConfig } from "@/lib/email-config"
import { sendCustomerReplyEmail } from "@/lib/email"
import { sanitizeInboundHtml } from "@/lib/inbound-email"
import { OUTBOUND_MAX_TOTAL_BYTES } from "@/lib/message-attachments"
import { normalizeStatus } from "@/components/board/board-types"

// GET /api/tickets/[id]/messages — fetch all messages for the chat tab (realtime refresh)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: ticketId } = await params

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, tenantId: true, subDepartmentId: true, assigneeId: true, creatorId: true, deletedAt: true, assignees: { select: { userId: true } }, subDepartment: { select: { departmentId: true } } },
  })
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })

  const accessError = await assertTicketAccess(profile, ticket, { forWrite: false })
  if (accessError) return accessError

  const messages = await prisma.ticketMessage.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      attachments: { select: { id: true, storageUrl: true, fileName: true, fileSize: true } },
    },
  })

  return NextResponse.json(
    messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      status: m.status,
      throttled: m.throttled,
      body: m.bodyHtml,
      fromName: m.fromName,
      fromEmail: m.fromEmail,
      authorId: m.author?.id ?? null,
      authorName: m.author?.name ?? null,
      authorAvatarUrl: m.author?.avatarUrl ?? null,
      createdAt: m.createdAt.toISOString(),
      attachments: m.attachments.map((a) => ({
        id: a.id,
        storageUrl: a.storageUrl,
        fileName: a.fileName,
        fileSize: a.fileSize,
      })),
    })),
  )
}

// POST /api/tickets/[id]/messages — staff sends an email reply to the intake
// submitter (issue 009). Persists an outbound TicketMessage.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: ticketId } = await params

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      title: true,
      ticketNumber: true,
      subDepartmentId: true,
      status: true,
      assigneeId: true,
      tenantId: true,
      creatorId: true,
      deletedAt: true,
      assignees: { select: { userId: true } },
      subDepartment: { select: { departmentId: true, prefix: true } },
      intake: {
        select: {
          submitterName: true,
          submitterEmail: true,
          replyToken: true,
          formConfig: { select: { allowCustomerReplies: true } },
        },
      },
    },
  })
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  const accessError = await assertTicketAccess(profile, ticket, { forWrite: true })
  if (accessError) return accessError

  // Customer replies require: receiving configured, an intake origin with a
  // token, and the form permitting replies.
  if (!RESEND_RECEIVING_ENABLED) {
    return NextResponse.json(
      { error: "Customer replies are not enabled in this environment" },
      { status: 409 },
    )
  }
  if (!ticket.intake || !ticket.intake.replyToken) {
    return NextResponse.json(
      { error: "This ticket did not originate from a support form" },
      { status: 409 },
    )
  }
  if (!ticket.intake.formConfig.allowCustomerReplies) {
    return NextResponse.json(
      { error: "This form does not allow customer replies" },
      { status: 409 },
    )
  }

  const body = await request.json().catch(() => ({}))
  // The composer sends rich-text HTML. Sanitize it before it is stored, emailed,
  // and later re-rendered with dangerouslySetInnerHTML in the chat timeline.
  const messageHtml =
    typeof body.body === "string" ? sanitizeInboundHtml(body.body).trim() : ""
  // Require real content, not empty markup like "<p></p>".
  const messageTextContent = messageHtml.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim()
  if (!messageTextContent) {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 })
  }

  const attachmentIds: string[] =
    Array.isArray(body.attachmentIds)
      ? body.attachmentIds.filter((id: unknown) => typeof id === "string")
      : []

  // Fetch and validate outbound attachments.
  // Uploaded files are created with ticketId=null, status="temporary" until they
  // are linked to a message — so we filter only by id + uploader to prevent
  // one user stealing another's uploads.
  let outboundAttachments: Array<{ id: string; storageUrl: string; fileName: string; fileSize: number }> = []
  if (attachmentIds.length > 0) {
    outboundAttachments = await prisma.attachment.findMany({
      where: {
        id: { in: attachmentIds },
        uploaderProfileId: profile.id,
        messageId: null,
        status: "temporary",
      },
      select: { id: true, storageUrl: true, fileName: true, fileSize: true },
    })

    const totalSize = outboundAttachments.reduce((sum, a) => sum + a.fileSize, 0)
    if (totalSize > OUTBOUND_MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: `Attachments exceed the ${OUTBOUND_MAX_TOTAL_BYTES / 1024 / 1024} MB total size limit` },
        { status: 413 },
      )
    }
  }

  // Resolve the In Progress status early (runs concurrently with other setup)
  // so the DB update is ready to await before we respond.
  const inProgressStatusPromise = normalizeStatus(ticket.status) === "To Do"
    ? prisma.subDepartmentStatus.findFirst({
        where: { subDepartmentId: ticket.subDepartmentId, isComplete: false },
        orderBy: { order: "asc" },
        skip: 1,
      })
    : Promise.resolve(null)

  const humanId = `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`
  const config = await getEmailConfig()

  // Thread this send onto the conversation's most recent message so the
  // customer's mail client chains it (In-Reply-To/References).
  const lastMessage = await prisma.ticketMessage.findFirst({
    where: { ticketId, providerMessageId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { providerMessageId: true },
  })

  // Download attachment contents so Resend receives the actual bytes rather
  // than a URL it may not be able to fetch (storage bucket may not be public).
  const emailAttachments = (
    await Promise.all(
      outboundAttachments.map(async (a) => {
        try {
          const res = await fetch(a.storageUrl)
          if (!res.ok) {
            console.error("[messages] failed to download attachment for email:", a.fileName, res.status)
            return null
          }
          const buf = Buffer.from(await res.arrayBuffer()) as Buffer
          return { content: buf, filename: a.fileName }
        } catch (err) {
          console.error("[messages] error downloading attachment:", a.fileName, err)
          return null
        }
      }),
    )
  ).filter((a): a is { content: Buffer; filename: string } => a !== null)

  let providerMessageId: string | null = null
  try {
    providerMessageId = await sendCustomerReplyEmail({
      to: ticket.intake.submitterEmail,
      submitterName: ticket.intake.submitterName,
      agentName: profile.name,
      agentId: profile.id,
      humanId,
      ticketTitle: ticket.title,
      messageText: messageHtml,
      replyToken: ticket.intake.replyToken,
      inReplyTo: lastMessage?.providerMessageId ?? null,
      attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
      departmentId: ticket.subDepartment.departmentId,
    })
  } catch (err) {
    console.error("[messages] send failed:", err)
    return NextResponse.json({ error: "Failed to send reply" }, { status: 502 })
  }

  const message = await prisma.ticketMessage.create({
    data: {
      ticketId,
      direction: "outbound",
      status: "trusted",
      authorProfileId: profile.id,
      fromName: profile.name,
      fromEmail: config.fromEmail,
      bodyHtml: messageHtml,
      providerMessageId,
    },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  })

  // Link uploaded attachments to this message
  if (outboundAttachments.length > 0) {
    await prisma.attachment.updateMany({
      where: { id: { in: outboundAttachments.map((a) => a.id) } },
      data: { ticketId, messageId: message.id, status: "attached" },
    })
  }

  // Auto-move to In Progress — awaited before responding so the DB change is
  // committed before the response is sent, ensuring postgres_changes picks it up.
  const inProgressStatus = await inProgressStatusPromise
  if (inProgressStatus) {
    // Attribute the reopen to the agent who replied (via the GUC the
    // ActivityLog trigger reads) rather than falling back to the creator.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${profile.id}, true)`
      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: inProgressStatus.label },
      })
    }).catch(() => undefined)
  } else {
    // Touch the ticket row so the existing Ticket-UPDATE realtime subscription
    // fires even when no status change occurs — that's what refreshes the
    // "Waiting for customer/assignee" badge on the task list and board views.
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { updatedAt: new Date() },
    }).catch(() => undefined)
  }

  const serialized = {
    id: message.id,
    direction: message.direction,
    status: message.status,
    body: message.bodyHtml,
    fromName: message.fromName,
    fromEmail: message.fromEmail,
    authorId: message.author?.id ?? null,
    authorName: message.author?.name ?? null,
    authorAvatarUrl: message.author?.avatarUrl ?? null,
    createdAt: message.createdAt.toISOString(),
    attachments: outboundAttachments.map((a) => ({ id: a.id, storageUrl: a.storageUrl, fileName: a.fileName, fileSize: a.fileSize })),
  }

  // Broadcast full message data so clients append it instantly without a follow-up fetch
  broadcastChatMessage(ticketId, serialized).catch(() => undefined)

  return NextResponse.json(serialized, { status: 201 })
}

async function broadcastChatMessage(ticketId: string, message: Record<string, unknown>) {
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
