import { prisma } from "@/lib/db"

/**
 * Lazy Resend delivery-status tracking for screening invites. No webhook to
 * configure: the queue page refreshes statuses in an `after()` hook, so each
 * render shows the state as of the previous poll (the queue auto-refreshes
 * every 30s, so updates surface within a cycle). Lookups are throttled per
 * session and stop once the status can no longer change or stops mattering
 * (candidate opened the link and started recording).
 */

/** Resend events after which the status can only change via a webhook we don't have. */
const TERMINAL_EVENTS = new Set(["bounced", "complained", "failed", "cancelled"])

export const EMAIL_STATUS_REFRESH_MS = 60_000

export type EmailTrackedSession = {
  id: string
  status: string
  resendEmailId: string | null
  emailStatus: string | null
  emailStatusAt: Date | null
}

/** Only poll invites the candidate hasn't acted on yet, at most once a minute. */
export function needsEmailStatusRefresh(s: EmailTrackedSession, now: Date = new Date()): boolean {
  if (!s.resendEmailId) return false
  if (s.status !== "sent") return false
  if (s.emailStatus && TERMINAL_EVENTS.has(s.emailStatus)) return false
  if (s.emailStatusAt && now.getTime() - s.emailStatusAt.getTime() < EMAIL_STATUS_REFRESH_MS) return false
  return true
}

/** Fetch last_event from Resend for each due session and persist it. */
export async function refreshEmailStatuses(sessions: EmailTrackedSession[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  const due = sessions.filter((s) => needsEmailStatusRefresh(s))
  await Promise.allSettled(
    due.map(async (s) => {
      const res = await fetch(`https://api.resend.com/emails/${s.resendEmailId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) return
      const data = (await res.json()) as { last_event?: string }
      await prisma.screeningSession.update({
        where: { id: s.id },
        data: {
          emailStatus: data.last_event ?? s.emailStatus,
          emailStatusAt: new Date(),
        },
      })
    }),
  )
}

export const EMAIL_STATUS_META: Record<string, { label: string; className: string }> = {
  queued: { label: "Email queued", className: "text-muted-foreground" },
  scheduled: { label: "Email queued", className: "text-muted-foreground" },
  sent: { label: "Email sent", className: "text-muted-foreground" },
  delivered: { label: "Delivered", className: "text-sky-500" },
  delivery_delayed: { label: "Delivery delayed", className: "text-amber-500" },
  opened: { label: "Opened", className: "text-emerald-500" },
  clicked: { label: "Link clicked", className: "text-emerald-500" },
  bounced: { label: "Bounced", className: "text-destructive" },
  complained: { label: "Marked spam", className: "text-destructive" },
  failed: { label: "Send failed", className: "text-destructive" },
  cancelled: { label: "Cancelled", className: "text-destructive" },
}
