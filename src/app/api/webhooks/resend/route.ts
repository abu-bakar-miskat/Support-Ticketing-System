import { after } from "next/server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getResendClient, processInboundEmail } from "@/lib/process-inbound-email"
import { withSystemScope } from "@/lib/request-scope"

type ReceivedEmailEventData = {
  email_id: string
  message_id: string
  to: string[]
}

// Anonymous inbound-email webhook — runs under system scope so cross-tenant
// ticket/message writes don't trip the fail-closed tenant extension.
export const POST = withSystemScope(handlePost)

async function handlePost(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }

  const resend = getResendClient()
  if (!resend) {
    return NextResponse.json({ error: "Email not configured" }, { status: 503 })
  }

  const rawBody = await request.text()

  let event
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    })
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  if (event.type !== "email.received") {
    const deliveryTypes = new Set(["email.bounced", "email.failed", "email.complained"])
    if (deliveryTypes.has(event.type)) {
      await recordDeliveryFailure(event.type, event.data as unknown as Record<string, unknown>)
      return NextResponse.json({ ok: true, delivery: event.type })
    }
    return NextResponse.json({ ok: true, skipped: event.type })
  }

  const data = event.data as ReceivedEmailEventData
  const { email_id: emailId, message_id: messageId } = data

  // Idempotency: skip immediately if already stored
  const existing = await prisma.ticketMessage.findFirst({
    where: { providerMessageId: messageId },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  console.log("[inbound] event received — email_id:", emailId, "message_id:", messageId, "to:", data.to)

  after(async () => {
    try {
      await processInboundEmail(emailId, messageId, data.to)
    } catch (err) {
      console.error("[inbound] processInboundEmail failed:", err)
    }
  })

  return NextResponse.json({ ok: true })
}

async function recordDeliveryFailure(eventType: string, data: Record<string, unknown>) {
  const emailId = typeof data.email_id === "string" ? data.email_id : null
  if (!emailId) return

  const message = await prisma.ticketMessage.findFirst({
    where: { providerMessageId: emailId },
    select: { id: true, ticketId: true, ticket: { select: { creatorId: true } } },
  })
  if (!message) return

  const status =
    eventType === "email.bounced" ? "bounced" : eventType === "email.complained" ? "complained" : "failed"
  const bounce = data.bounce && typeof data.bounce === "object" ? (data.bounce as Record<string, unknown>) : null
  const error =
    (typeof data.error === "string" && data.error) ||
    (typeof bounce?.message === "string" && bounce.message) ||
    eventType

  await prisma.ticketMessage.update({
    where: { id: message.id },
    data: {
      deliveryStatus: status,
      deliveryError: String(error).slice(0, 500),
      deliveryStatusAt: new Date(),
    },
  })

  await prisma.activityLog.create({
    data: {
      ticketId: message.ticketId,
      actorId: message.ticket.creatorId,
      action: "FIELD_CHANGED",
      metadata: { field: "emailDelivery", status, error },
    },
  }).catch(() => undefined)
}
