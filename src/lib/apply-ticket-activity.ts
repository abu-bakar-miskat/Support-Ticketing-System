import type { TicketDetailProps, ActivityData, TimeEntrySummary } from "@/components/tickets/ticket-detail-page"
import { uiPriorityFromDb } from "@/components/board/board-types"
import type { TicketActivityEvent } from "@/lib/realtime"

/** Actions whose payload does not contain enough data to patch the UI fully. */
export const ACTIVITY_NEEDS_REFETCH = new Set([
  "ATTACHMENT_ADDED",
  "PROJECT_CHANGED",
  "TICKET_DELETED",
  "PERSONAL_ESTIMATE_CHANGED",
])

export function resolveActivityActorName(
  actorId: string,
  currentUserId: string,
  currentUserName: string,
  people: { id: string; name: string }[],
): string {
  if (actorId && actorId === currentUserId && currentUserName) return currentUserName
  const match = people.find((p) => p.id === actorId)
  return match?.name ?? "Someone"
}

export function activityEntryFromEvent(
  event: TicketActivityEvent,
  actorName: string,
): ActivityData {
  return {
    id: event.activityId || `${event.action}-${event.createdAt}-${event.actorId}`,
    action: event.action,
    actorName,
    createdAt: event.createdAt,
    metadata: event.payload ?? {},
  }
}

/** Patch time-entry summaries from TIMER_STARTED / TIMER_STOPPED broadcasts. */
export function applyTimerEventToEntries(
  entries: TimeEntrySummary[],
  event: TicketActivityEvent,
): TimeEntrySummary[] {
  const payload = event.payload ?? {}
  if (event.action === "TIMER_STARTED") {
    const userId = payload.userId as string | undefined
    const userName = (payload.userName as string | undefined) ?? "Someone"
    const avatarUrl = (payload.avatarUrl as string | null | undefined) ?? null
    const startedAt = payload.startedAt as string | undefined
    if (!userId || !startedAt) return entries
    const existing = entries.find((e) => e.userId === userId)
    if (existing) {
      return entries.map((e) =>
        e.userId === userId
          ? {
              ...e,
              isRunning: true,
              runningStartedAt: startedAt,
              sessions: [
                {
                  id: (payload.entryId as string) ?? `live-${startedAt}`,
                  startedAt,
                  endedAt: null,
                  durationSecs: null,
                },
                ...e.sessions,
              ],
            }
          : e,
      )
    }
    return [
      ...entries,
      {
        userId,
        userName,
        avatarUrl,
        totalSecs: 0,
        isRunning: true,
        runningStartedAt: startedAt,
        sessions: [
          {
            id: (payload.entryId as string) ?? `live-${startedAt}`,
            startedAt,
            endedAt: null,
            durationSecs: null,
          },
        ],
      },
    ]
  }

  if (event.action === "TIMER_STOPPED") {
    const userId = payload.userId as string | undefined
    const durationSecs = (payload.durationSecs as number | undefined) ?? 0
    const endedAt = payload.endedAt as string | undefined
    const entryId = payload.entryId as string | undefined
    if (!userId) return entries
    return entries.map((e) => {
      if (e.userId !== userId) return e
      return {
        ...e,
        isRunning: false,
        runningStartedAt: null,
        totalSecs: e.totalSecs + durationSecs,
        sessions: e.sessions.map((s) =>
          !s.endedAt || s.id === entryId
            ? {
                ...s,
                endedAt: endedAt ?? s.endedAt,
                durationSecs: s.durationSecs ?? durationSecs,
              }
            : s,
        ),
      }
    })
  }

  return entries
}

/**
 * Applies a ticket-activity broadcast to a TicketDetailProps snapshot.
 * Always returns a new object (at least with the activity row prepended).
 * Callers should soft-refetch when `ACTIVITY_NEEDS_REFETCH` contains the action.
 */
export function patchTicketDetailFromActivity(
  detail: TicketDetailProps,
  event: TicketActivityEvent,
  actorName: string,
): TicketDetailProps {
  const payload = event.payload ?? {}
  const entry = activityEntryFromEvent(event, actorName)
  const activity = detail.activity.some((a) => a.id === entry.id)
    ? detail.activity
    : [entry, ...detail.activity]

  switch (event.action) {
    case "STATUS_CHANGED": {
      const to = payload.to as string | undefined
      if (!to) return { ...detail, activity }
      return { ...detail, activity, status: to }
    }
    case "ASSIGNED": {
      const toId = (payload.toId as string | null | undefined) ?? null
      const toName = (payload.toName as string | null | undefined) ?? null
      const member = toId
        ? detail.subDepartmentMembers.find((m) => m.id === toId)
        : undefined
      return {
        ...detail,
        activity,
        assigneeId: toId,
        assigneeName: toName,
        assigneeAvatarUrl: member?.avatarUrl ?? null,
      }
    }
    case "CO_ASSIGNEE_ADDED": {
      const userId = payload.userId as string | undefined
      const userName = (payload.userName as string | undefined) ?? "Unknown"
      if (!userId) return { ...detail, activity }
      const coAssignees = detail.coAssignees ?? []
      if (coAssignees.some((c) => c.id === userId)) return { ...detail, activity }
      const member = detail.subDepartmentMembers.find((m) => m.id === userId)
      return {
        ...detail,
        activity,
        coAssignees: [
          ...coAssignees,
          {
            id: userId,
            name: userName,
            avatarUrl: member?.avatarUrl ?? null,
          },
        ],
      }
    }
    case "CO_ASSIGNEE_REMOVED": {
      const userId = payload.userId as string | undefined
      if (!userId) return { ...detail, activity }
      return {
        ...detail,
        activity,
        coAssignees: (detail.coAssignees ?? []).filter((c) => c.id !== userId),
      }
    }
    case "TITLE_CHANGED": {
      const to = payload.to as string | undefined
      if (!to) return { ...detail, activity }
      return { ...detail, activity, title: to }
    }
    case "PRIORITY_CHANGED": {
      const to = payload.to as string | undefined
      if (!to) return { ...detail, activity }
      return { ...detail, activity, priority: uiPriorityFromDb(to) }
    }
    case "STORY_POINTS_CHANGED": {
      const to = (payload.to as number | null | undefined) ?? null
      return { ...detail, activity, storyPoints: to }
    }
    case "ESTIMATED_TIME_CHANGED": {
      const to = (payload.to as number | null | undefined) ?? null
      return { ...detail, activity, estimatedTime: to }
    }
    case "DATE_CHANGED": {
      const toStart = (payload.toStart as string | null | undefined) ?? null
      const toEnd = (payload.toEnd as string | null | undefined) ?? null
      return {
        ...detail,
        activity,
        startDateIso: toStart,
        dueDateIso: toEnd,
        dueDate: toEnd,
      }
    }
    case "SPRINT_CHANGED": {
      return {
        ...detail,
        activity,
        sprintId: (payload.toId as string | null | undefined) ?? null,
        sprintName: (payload.toName as string | null | undefined) ?? null,
      }
    }
    case "MODULE_CHANGED": {
      return {
        ...detail,
        activity,
        moduleId: (payload.toId as string | null | undefined) ?? null,
        moduleName: (payload.toName as string | null | undefined) ?? null,
      }
    }
    case "LABELS_CHANGED": {
      const added = (payload.added as string[] | undefined) ?? []
      const removed = new Set((payload.removed as string[] | undefined) ?? [])
      const next = [
        ...detail.labels.filter((l) => !removed.has(l)),
        ...added.filter((l) => !detail.labels.includes(l)),
      ]
      return { ...detail, activity, labels: next }
    }
    case "DESCRIPTION_CHANGED": {
      if (!("to" in payload)) return { ...detail, activity }
      return {
        ...detail,
        activity,
        description: (payload.to as string | null | undefined) ?? null,
      }
    }
    case "TIMER_STARTED":
    case "TIMER_STOPPED": {
      // Timers are noisy — do not prepend to the activity feed
      const timerKind = payload.kind === "QA" ? "QA" : "DEVELOPMENT"
      if (timerKind === "QA") {
        return {
          ...detail,
          qaTimeEntries: applyTimerEventToEntries(detail.qaTimeEntries ?? [], event),
        }
      }
      return {
        ...detail,
        timeEntries: applyTimerEventToEntries(detail.timeEntries ?? [], event),
      }
    }
    case "TIMER_RESET": {
      const actorId = event.actorId
      return {
        ...detail,
        activity,
        timeEntries: actorId
          ? (detail.timeEntries ?? []).filter((e) => e.userId !== actorId)
          : detail.timeEntries,
      }
    }
    case "QA_TIME_LOGGED": {
      const durationSecs = (payload.durationSecs as number | undefined) ?? 0
      const entryId = (payload.entryId as string | undefined) ?? `qa-${event.createdAt}`
      const actorId = event.actorId
      if (!actorId || durationSecs <= 0) return { ...detail, activity }
      const nowIso = event.createdAt
      const startedAt = new Date(
        new Date(nowIso).getTime() - durationSecs * 1000,
      ).toISOString()
      const session = {
        id: entryId,
        startedAt,
        endedAt: nowIso,
        durationSecs,
      }
      const qaTimeEntries = detail.qaTimeEntries ?? []
      const existing = qaTimeEntries.find((e) => e.userId === actorId)
      const nextQa = existing
        ? qaTimeEntries.map((e) =>
            e.userId === actorId
              ? {
                  ...e,
                  totalSecs: e.totalSecs + durationSecs,
                  sessions: [session, ...e.sessions],
                }
              : e,
          )
        : [
            ...qaTimeEntries,
            {
              userId: actorId,
              userName: actorName,
              avatarUrl: null,
              totalSecs: durationSecs,
              isRunning: false,
              runningStartedAt: null,
              sessions: [session],
            },
          ]
      return { ...detail, activity, qaTimeEntries: nextQa }
    }
    case "COMMENT_ADDED":
    case "MENTION":
      // Comment body is fetched separately; only activity row is patched here.
      return { ...detail, activity }
    case "ATTACHMENT_ADDED":
    case "PROJECT_CHANGED":
    case "TICKET_DELETED":
      // Still prepend activity so the feed updates instantly; caller soft-refetches
      // for fields the payload cannot supply.
      return { ...detail, activity }
    case "PERSONAL_ESTIMATE_CHANGED": {
      const userId = payload.userId as string | undefined
      if (!userId) return { ...detail, activity }
      const estimatedMinutes =
        (payload.estimatedMinutes as number | null | undefined) ?? null
      const targetDateRaw =
        (payload.targetDate as string | null | undefined) ?? null
      const targetDateIso = targetDateRaw ? targetDateRaw.slice(0, 10) : null
      const prev = detail.personalEstimates ?? []
      const cleared = estimatedMinutes == null && targetDateIso == null
      const next = cleared
        ? prev.filter((e) => e.userId !== userId)
        : prev.some((e) => e.userId === userId)
          ? prev.map((e) =>
              e.userId === userId ? { userId, estimatedMinutes, targetDateIso } : e,
            )
          : [...prev, { userId, estimatedMinutes, targetDateIso }]
      const rollup = next.reduce((s, e) => s + (e.estimatedMinutes ?? 0), 0)
      return {
        ...detail,
        activity,
        personalEstimates: next,
        estimatedTime: rollup > 0 ? rollup : null,
      }
    }
    default:
      return { ...detail, activity }
  }
}
