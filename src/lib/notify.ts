import webpush from "web-push"
import { prisma } from "@/lib/db"
import type { NotificationType } from "@/generated/prisma/enums"

// Configure VAPID once at module load — safe to call multiple times (idempotent)
if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_EMAIL) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.replace(/=+$/, ""),
    process.env.VAPID_PRIVATE_KEY.replace(/=+$/, ""),
  )
}

// Maps notification type → the in-app preference key stored in notificationPrefs.
// Types not in this map are always delivered (join requests, access grants, etc.)
const IN_APP_PREF_KEY: Partial<Record<NotificationType, string>> = {
  mention:              "mentions",
  assignment:           "assignments",
  qa_assignment:        "assignments",
  comment:              "comments",
  status_change:        "statusChanges",
  intake_manager_alert: "intakeManagerAlert",
}

async function isInAppEnabled(recipientId: string, type: NotificationType): Promise<boolean> {
  const key = IN_APP_PREF_KEY[type]
  if (!key) return true // types without a pref are always on
  const profile = await prisma.profile.findUnique({
    where: { id: recipientId },
    select: { notificationPrefs: true },
  })
  const prefs = profile?.notificationPrefs
  if (typeof prefs !== "object" || prefs === null || Array.isArray(prefs)) return true
  const stored = prefs as Record<string, unknown>
  return typeof stored[key] === "boolean" ? stored[key] : true
}

export async function createNotification({
  recipientId,
  actorId,
  type,
  ticketId,
  commentId,
  joinRequestId,
  message,
}: {
  recipientId: string
  actorId?: string | null
  type: NotificationType
  ticketId?: string
  commentId?: string
  joinRequestId?: string
  message?: string
}) {
  if (actorId && actorId === recipientId) return
  try {
    const enabled = await isInAppEnabled(recipientId, type)
    if (!enabled) return
    const notification = await prisma.notification.create({
      data: { recipientId, actorId: actorId ?? null, type, ticketId, commentId, joinRequestId, message },
    })
    // Fire-and-forget — build rich payload then broadcast
    buildAndBroadcast(
      notification.id,
      type,
      actorId ?? null,
      ticketId,
      commentId,
      message,
      recipientId,
      joinRequestId,
    )
      .catch(() => undefined)
  } catch {
    // best-effort
  }
}

async function buildAndBroadcast(
  notifId: string,
  type: NotificationType,
  actorId: string | null,
  ticketId: string | undefined,
  commentId: string | undefined,
  message: string | undefined,
  recipientId: string,
  joinRequestId: string | undefined,
) {
  // Fetch everything we need in parallel — this is fire-and-forget so it
  // never affects the primary API response time.
  const [actor, ticket, comment] = await Promise.all([
    actorId
      ? prisma.profile.findUnique({ where: { id: actorId }, select: { name: true } })
      : null,
    ticketId
      ? prisma.ticket.findUnique({
          where: { id: ticketId },
          select: {
            title: true,
            ticketNumber: true,
            subDepartment: { select: { prefix: true } },
            project: { select: { name: true } },
            parent: {
              select: {
                ticketNumber: true,
                subDepartment: { select: { prefix: true } },
              },
            },
          },
        })
      : null,
    commentId
      ? prisma.comment.findUnique({ where: { id: commentId }, select: { body: true } })
      : null,
  ])

  const actorName  = actor?.name ?? "Someone"
  const ticketRef  = ticket ? `${ticket.subDepartment.prefix}-${ticket.ticketNumber}` : null
  const ticketName = ticket?.title ?? null
  const project    = ticket?.project?.name ?? null

  // Build a human-readable title and optional body for each notification type
  let title = "New notification"
  let body: string | null = null

  const ticketLabel = ticketName
    ? ticketRef
      ? `"${ticketName}" (${ticketRef})`
      : `"${ticketName}"`
    : "a ticket"

  const projectSuffix = project ? ` · ${project}` : ""

  switch (type) {
    case "comment":
      title = `${actorName} commented on ${ticketLabel}${projectSuffix}`
      body  = comment?.body
        ? comment.body.length > 100
          ? `${comment.body.slice(0, 97)}…`
          : comment.body
        : message ?? null
      break

    case "mention":
      title = `${actorName} mentioned you in ${ticketLabel}${projectSuffix}`
      body  = comment?.body
        ? comment.body.length > 100
          ? `${comment.body.slice(0, 97)}…`
          : comment.body
        : message ?? null
      break

    case "assignment": {
      const parentRef = ticket?.parent
        ? ` (subtask of ${ticket.parent.subDepartment.prefix}-${ticket.parent.ticketNumber})`
        : ""
      title = `${actorName} assigned you to ${ticketLabel}${parentRef}${projectSuffix}`
      break
    }

    case "qa_assignment": {
      const parentRef = ticket?.parent
        ? ` (subtask of ${ticket.parent.subDepartment.prefix}-${ticket.parent.ticketNumber})`
        : ""
      title = `${actorName} assigned you to QA ${ticketLabel}${parentRef}${projectSuffix}`
      break
    }

    case "status_change":
      title = `${actorName} updated ${ticketLabel}${projectSuffix}`
      body  = message ?? null
      break

    case "review_request":
      title = `${actorName} requested your review on ${ticketLabel}${projectSuffix}`
      break

    case "join_request":
      title = `${actorName} sent a join request`
      body  = message ?? null
      break

    case "access_granted":
      title = `${actorName} granted you cross-department access`
      body  = message ?? null
      break

    case "ticket_deleted":
      title = `${actorName} deleted ${ticketLabel}${projectSuffix}`
      body  = message ?? null
      break

    case "customer_reply":
      title = `Submitter replied to ${ticketLabel}${projectSuffix}`
      body  = message ?? null
      break

    case "customer_reply_review":
      title = `Unverified submitter replied to ${ticketLabel}${projectSuffix} — needs review`
      body  = message ?? null
      break

    case "intake_manager_alert":
      title = `New intake ticket ${ticketLabel}${projectSuffix}`
      body  = message ?? null
      break

    case "agreement_expiring":
      title = "Tenant agreement expiring soon"
      body  = message ?? null
      break

    default:
      title = message ? `${actorName} — ${message}` : `${actorName} sent a notification`
  }

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
      messages: [
        {
          topic: `user-notifs:${recipientId}`,
          event: "new_notification",
          payload: {
            id: notifId,
            type,
            title,
            body,
            ticketDbId: ticketId ?? null,
            joinRequestId: joinRequestId ?? null,
          },
          private: false,
        },
      ],
    }),
  })

  // Send Web Push to any registered devices/browsers (works even when browser is closed)
  await sendWebPush(recipientId, title, body)
}

async function sendWebPush(recipientId: string, title: string, body: string | null) {
  if (!process.env.VAPID_PRIVATE_KEY) return

  const subs = await prisma.pushSubscription.findMany({ where: { userId: recipientId } })
  if (subs.length === 0) return

  const payload = JSON.stringify({ title, body, url: "/inbox" })

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
      } catch (err: unknown) {
        // 404/410 = expired; 401/403 = wrong VAPID key / unauthorized — drop stale rows
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410 || status === 401 || status === 403) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined)
        } else {
          console.error("[push] send failed:", status ?? err)
        }
      }
    }),
  )
}
