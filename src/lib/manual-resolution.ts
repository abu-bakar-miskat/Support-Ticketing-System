import { getWorkCycleStart } from "@/lib/work-cycle"
import { prisma } from "@/lib/db"
import { entrySeconds } from "@/lib/time-data"
import { broadcastTimerChange } from "@/lib/timer-broadcast"
import { broadcastTicketEvent } from "@/lib/ticket-events"
import type { Prisma } from "@/generated/prisma/client"

// Mailbox creation has no Intake, so use its persisted origin as well.
export const manualTicketWhere = {
  intake: { is: null },
  activityLogs: { none: { action: "TICKET_CREATED", metadata: { path: ["source"], equals: "email" } } },
  NOT: { slaTimer: { is: { source: "mailbox" } } },
} satisfies Prisma.TicketWhereInput

export async function getManualResolutionTicket(ticketId: string) {
  return prisma.ticket.findFirst({
    where: { id: ticketId, deletedAt: null, isDraft: false, ...manualTicketWhere },
    select: {
      id: true, tenantId: true, estimatedTime: true, closedAt: true, inProgressStartedAt: true,
      estimateOverrunNotifiedAt: true, assigneeId: true,
      subDepartment: { select: { departmentId: true } },
    },
  })
}

export async function trackedWorkSeconds(ticketId: string, until: Date): Promise<number> {
  const cycleStart = await getWorkCycleStart(ticketId)
  const entries = await prisma.timeEntry.findMany({
    where: { ticketId, ...(cycleStart ? { startedAt: { gte: cycleStart } } : {}) },
    select: { startedAt: true, endedAt: true, durationSecs: true },
  })
  return entries.reduce((sum, entry) => {
    if (entry.startedAt >= until) return sum
    // A completion may arrive before the timer-stop side effect. Never count
    // work after that completion timestamp, including a late stop request.
    if (!entry.endedAt || entry.endedAt > until) {
      return sum + entrySeconds({ ...entry, endedAt: until, durationSecs: null }, until)
    }
    return sum + entrySeconds(entry, until)
  }, 0)
}

/** Freeze manual work at closedAt, across status, cascade, GitHub and MCP paths. */
export async function finalizeManualResolution(ticketId: string): Promise<void> {
  const ticket = await getManualResolutionTicket(ticketId)
  if (!ticket?.closedAt) return
  const until = ticket.closedAt
  await stopTicketWorkAt(ticketId, until)
  // Late dynamic import avoids a module cycle with the breach checker.
  const { checkAndNotifyEstimateOverrun } = await import("@/lib/time-estimate-notify")
  await checkAndNotifyEstimateOverrun(ticketId, until, true)
  const trackedSecs = await trackedWorkSeconds(ticketId, until)
  await prisma.ticket.updateMany({
    where: { id: ticketId, closedAt: until },
    data: {
      resolutionDurationMins: Math.round(trackedSecs / 60),
      resolvedWithinAllowed: ticket.estimatedTime == null || ticket.estimatedTime <= 0
        ? null : trackedSecs <= ticket.estimatedTime * 60,
    },
  })
}


/** Stop work at completion for every ticket source, including cascade/GitHub paths. */
export async function stopTicketWorkAt(ticketId: string, until: Date): Promise<void> {
  const running = await prisma.timeEntry.findMany({
    where: { ticketId, endedAt: null },
    select: { id: true, profileId: true, startedAt: true, profile: { select: { name: true } } },
  })
  for (const entry of running) {
    const durationSecs = entrySeconds({ ...entry, endedAt: until, durationSecs: null }, until)
    const stopped = await prisma.timeEntry.updateMany({
      where: { id: entry.id, endedAt: null },
      data: { endedAt: until, durationSecs },
    })
    if (!stopped.count) continue
    await Promise.all([
      broadcastTimerChange(entry.profileId).catch(() => undefined),
      broadcastTicketEvent(ticketId, "TIMER_STOPPED", entry.profileId, {
        userId: entry.profileId, userName: entry.profile.name, entryId: entry.id,
        durationSecs, endedAt: until.toISOString(),
      }).catch(() => undefined),
    ])
  }
}


export type ManualResolutionView = {
  estimatedMins: number
  trackedSecs: number
  overtimeSecs: number
  status: "ON_TRACK" | "BREACHED"
  runningCount: number
  asOf: string
  details?: {
    cycleStartedAt: string | null
    compliant: boolean | null
    firstWorkedAt: string | null
    resolvedAt: string | null
    breaches: { metric: "resolution"; targetMins: number; breachedAt: string }[]
  }
}

/** Read-only manual overview; no first-response or calendar clock is invented. */
export async function getManualResolutionView(
  ticketId: string, now: Date = new Date(), includeDetails = false,
): Promise<ManualResolutionView | null> {
  const ticket = await getManualResolutionTicket(ticketId)
  if (!ticket?.estimatedTime || ticket.estimatedTime <= 0) return null
  const until = ticket.closedAt ?? now
  const trackedSecs = await trackedWorkSeconds(ticketId, until)
  const cycleStart = await getWorkCycleStart(ticketId)
  const entries = await prisma.timeEntry.findMany({
    where: { ticketId, ...(cycleStart ? { startedAt: { gte: cycleStart } } : {}) }, select: { startedAt: true, endedAt: true },
    orderBy: { startedAt: "asc" },
  })
  const view: ManualResolutionView = {
    estimatedMins: ticket.estimatedTime, trackedSecs,
    overtimeSecs: Math.max(0, trackedSecs - ticket.estimatedTime * 60),
    status: trackedSecs > ticket.estimatedTime * 60 ? "BREACHED" : "ON_TRACK",
    runningCount: ticket.closedAt ? 0 : entries.filter((entry) => !entry.endedAt).length,
    asOf: now.toISOString(),
  }
  if (includeDetails) {
    const breaches = await prisma.slaBreach.findMany({
      where: { ticketId, metric: "resolution" }, orderBy: { breachedAt: "asc" },
      select: { targetMins: true, breachedAt: true },
    })
    view.details = {
      cycleStartedAt: cycleStart?.toISOString() ?? null,
      compliant: ticket.closedAt ? trackedSecs <= ticket.estimatedTime * 60 : null,
      firstWorkedAt: entries[0]?.startedAt.toISOString() ?? null,
      resolvedAt: ticket.closedAt?.toISOString() ?? null,
      breaches: breaches.map((breach) => ({
        metric: "resolution", targetMins: breach.targetMins, breachedAt: breach.breachedAt.toISOString(),
      })),
    }
  }
  return view
}
