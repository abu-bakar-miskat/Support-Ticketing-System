import "server-only"
import { prisma } from "@/lib/db"

// ── Typed event payloads ───────────────────────────────────────────────────────
// Each action maps to a strongly-typed payload. The ActivityLog.metadata column
// stores this as JSON, so the types serve as a contract between writers (API
// routes) and readers (activity feed renderer, event projections).

export type TicketEventPayloads = {
  STATUS_CHANGED:         { from: string; to: string }
  ASSIGNED:               { toId: string | null; toName: string | null; fromId?: string | null; fromName?: string | null }
  CO_ASSIGNEE_ADDED:      { userId: string; userName: string }
  CO_ASSIGNEE_REMOVED:    { userId: string; userName: string }
  QA_ASSIGNEE_ADDED:      { userId: string; userName: string }
  QA_ASSIGNEE_REMOVED:    { userId: string; userName: string }
  COMMENT_ADDED:          { commentId: string; parentId?: string | null }
  ATTACHMENT_ADDED:       { fileName: string; attachmentId?: string }
  MENTION:                { mentionedId: string; mentionedName: string; commentId?: string }
  DATE_CHANGED:           { fromStart: string | null; fromEnd: string | null; toStart: string | null; toEnd: string | null }
  FORWARDED:              { to: string }
  TICKET_DELETED:         { humanId: string; title: string }
  TICKET_CREATED:         { humanId: string; title: string; status?: string }
  TITLE_CHANGED:          { from: string; to: string }
  PRIORITY_CHANGED:       { from: string; to: string }
  DESCRIPTION_CHANGED:    { hadDescription: boolean; to?: string | null }
  STORY_POINTS_CHANGED:   { from: number | null; to: number | null }
  ESTIMATED_TIME_CHANGED: { from: number | null; to: number | null }
  PERSONAL_ESTIMATE_CHANGED: { userId: string; userName: string; estimatedMinutes: number | null; targetDate: string | null }
  SPRINT_CHANGED:         { fromId: string | null; fromName: string | null; toId: string | null; toName: string | null }
  PROJECT_CHANGED:        { fromId: string | null; fromName: string | null; toId: string | null; toName: string | null }
  LABELS_CHANGED:         { added: string[]; removed: string[] }
  MODULE_CHANGED:         { fromId: string | null; fromName: string | null; toId: string | null; toName: string | null }
  SUBTICKET_ADDED:        { humanId: string; title: string; subTicketId: string }
  TIMER_RESET:            { clearedSecs: number; entryCount: number }
  QA_TIME_LOGGED:         { durationSecs: number; note?: string | null; entryId: string }
  /** Broadcast-only (no ActivityLog) — other ticket viewers see timers live */
  TIMER_STARTED:          { userId: string; userName: string; avatarUrl?: string | null; entryId: string; startedAt: string }
  TIMER_STOPPED:          { userId: string; userName: string; entryId: string; durationSecs: number; endedAt: string }
}

export type TicketAction = keyof TicketEventPayloads

// ── Broadcast payload sent to the ticket-activity channel ─────────────────────

export type TicketActivityEvent = {
  activityId: string
  ticketId: string
  action: TicketAction
  actorId: string
  payload: Record<string, unknown>
  createdAt: string
}

// ── Core writer ───────────────────────────────────────────────────────────────

/**
 * Appends an immutable event to ActivityLog, then broadcasts it to the
 * `ticket-activity:{ticketId}` Supabase Realtime channel so all subscribers
 * (ticket detail page, drawer, project overview) receive the update instantly
 * without polling.
 *
 * The broadcast is fire-and-forget — a delivery failure never fails the write.
 */
export async function appendTicketEvent<A extends TicketAction>(
  ticketId: string,
  actorId: string,
  action: A,
  payload: TicketEventPayloads[A],
): Promise<void> {
  const createdAt = new Date()
  // Stable client id so a later soft-reconcile can dedupe against ActivityLog rows
  const activityId = `${action}:${createdAt.toISOString()}:${actorId}`

  // Broadcast first so other viewers patch instantly — don't wait on ActivityLog.
  void broadcastTicketActivity(ticketId, {
    activityId,
    ticketId,
    action,
    actorId,
    payload: payload as Record<string, unknown>,
    createdAt: createdAt.toISOString(),
  }).catch(() => undefined)

  await prisma.activityLog.create({
    data: {
      ticketId,
      actorId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      action: action as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: payload as any,
      createdAt,
    },
    select: { id: true },
  })
}

// ── Supabase Realtime broadcast ───────────────────────────────────────────────

/**
 * Send a raw broadcast to `ticket-activity:{ticketId}` without writing an
 * ActivityLog row. Use this when the DB trigger already wrote the log (e.g.
 * STATUS_CHANGED) and you only need to push the real-time notification to all
 * viewers of the ticket.
 */
export async function broadcastTicketEvent(
  ticketId: string,
  action: TicketAction,
  actorId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  return broadcastTicketActivity(ticketId, {
    activityId: "",      // no specific log id — clients use action + payload
    ticketId,
    action,
    actorId,
    payload,
    createdAt: new Date().toISOString(),
  })
}

async function broadcastTicketActivity(
  ticketId: string,
  event: TicketActivityEvent,
): Promise<void> {
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
          topic: `ticket-activity:${ticketId}`,
          event: "activity_added",
          payload: event,
        },
      ],
    }),
  })
}
