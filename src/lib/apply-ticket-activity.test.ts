import { describe, expect, it } from "vitest"
import {
  activityEntryFromEvent,
  patchTicketDetailFromActivity,
  resolveActivityActorName,
} from "./apply-ticket-activity"
import type { TicketDetailProps } from "@/components/tickets/ticket-detail-page"
import type { TicketActivityEvent } from "./realtime"

function baseDetail(overrides: Partial<TicketDetailProps> = {}): TicketDetailProps {
  return {
    dbId: "t1",
    ticketId: "WEB-1",
    projectId: "p1",
    teamId: "team1",
    projectName: "Web",
    projectColor: "#000",
    title: "Old title",
    description: null,
    status: "To Do",
    priority: "medium",
    labels: ["bug"],
    openedBy: "A",
    openedDaysAgo: 1,
    createdAtIso: null,
    creatorName: "Alice",
    creatorAvatarUrl: null,
    assigneeId: null,
    assigneeName: null,
    assigneeAvatarUrl: null,
    coAssignees: [],
    startDateIso: null,
    dueDateIso: null,
    dueDate: null,
    closedAtIso: null,
    dueOverdue: false,
    canEditDates: true,
    teamMembers: [{ id: "u2", name: "Bob", avatarUrl: null }],
    mentionableUsers: [],
    teamStatuses: [],
    subTickets: [],
    comments: [],
    activity: [],
    ...overrides,
  }
}

function event(
  action: string,
  payload: Record<string, unknown>,
  extras: Partial<TicketActivityEvent> = {},
): TicketActivityEvent {
  return {
    activityId: "a1",
    ticketId: "t1",
    action,
    actorId: "u1",
    payload,
    createdAt: "2026-07-16T10:00:00.000Z",
    ...extras,
  }
}

describe("resolveActivityActorName", () => {
  it("prefers the current user name", () => {
    expect(
      resolveActivityActorName("me", "me", "Me", [{ id: "me", name: "Other" }]),
    ).toBe("Me")
  })

  it("falls back to people list then Someone", () => {
    expect(resolveActivityActorName("u2", "me", "Me", [{ id: "u2", name: "Bob" }])).toBe("Bob")
    expect(resolveActivityActorName("x", "me", "Me", [])).toBe("Someone")
  })
})

describe("patchTicketDetailFromActivity", () => {
  it("patches status and prepends activity", () => {
    const next = patchTicketDetailFromActivity(
      baseDetail(),
      event("STATUS_CHANGED", { from: "To Do", to: "In Progress" }),
      "Alice",
    )
    expect(next?.status).toBe("In Progress")
    expect(next?.activity[0]?.action).toBe("STATUS_CHANGED")
  })

  it("patches priority from DB enum", () => {
    const next = patchTicketDetailFromActivity(
      baseDetail(),
      event("PRIORITY_CHANGED", { from: "Medium", to: "Urgent" }),
      "Alice",
    )
    expect(next?.priority).toBe("urgent")
  })

  it("applies label add/remove", () => {
    const next = patchTicketDetailFromActivity(
      baseDetail({ labels: ["bug", "old"] }),
      event("LABELS_CHANGED", { added: ["new"], removed: ["old"] }),
      "Alice",
    )
    expect(next?.labels).toEqual(["bug", "new"])
  })

  it("still prepends activity for description changes that need a refetch", () => {
    const next = patchTicketDetailFromActivity(
      baseDetail(),
      event("DESCRIPTION_CHANGED", { hadDescription: true }),
      "Alice",
    )
    expect(next.activity).toHaveLength(1)
    expect(next.activity[0]?.action).toBe("DESCRIPTION_CHANGED")
    expect(next.description).toBeNull()
  })

  it("applies description body when payload includes to", () => {
    const next = patchTicketDetailFromActivity(
      baseDetail(),
      event("DESCRIPTION_CHANGED", { hadDescription: true, to: "<p>Hi</p>" }),
      "Alice",
    )
    expect(next.description).toBe("<p>Hi</p>")
  })

  it("applies timer start/stop to timeEntries without activity noise", () => {
    const started = patchTicketDetailFromActivity(
      baseDetail({ timeEntries: [] }),
      event("TIMER_STARTED", {
        userId: "u2",
        userName: "Bob",
        entryId: "e1",
        startedAt: "2026-07-16T10:00:00.000Z",
      }),
      "Bob",
    )
    expect(started.activity).toHaveLength(0)
    expect(started.timeEntries?.[0]?.isRunning).toBe(true)

    const stopped = patchTicketDetailFromActivity(
      started,
      event("TIMER_STOPPED", {
        userId: "u2",
        userName: "Bob",
        entryId: "e1",
        durationSecs: 60,
        endedAt: "2026-07-16T10:01:00.000Z",
      }),
      "Bob",
    )
    expect(stopped.timeEntries?.[0]?.isRunning).toBe(false)
    expect(stopped.timeEntries?.[0]?.totalSecs).toBe(60)
  })

  it("builds a stable activity entry when activityId is empty", () => {
    const entry = activityEntryFromEvent(
      event("STATUS_CHANGED", { from: "A", to: "B" }, { activityId: "" }),
      "Alice",
    )
    expect(entry.id).toContain("STATUS_CHANGED")
    expect(entry.actorName).toBe("Alice")
  })
})
