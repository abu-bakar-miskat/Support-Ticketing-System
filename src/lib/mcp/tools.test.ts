import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: {
    team: { findMany: vi.fn(), findFirst: vi.fn() },
    project: { findMany: vi.fn(), findFirst: vi.fn() },
    ticket: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    profile: { findFirst: vi.fn() },
    teamStatus: { findFirst: vi.fn(), findMany: vi.fn() },
    sprint: { findFirst: vi.fn() },
    projectModule: { findFirst: vi.fn() },
    comment: { create: vi.fn() },
    activityLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/email", () => ({
  sendAssignmentEmail: vi.fn().mockResolvedValue(undefined),
  sendResolutionEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/misc-project", () => ({ resolveMiscProjectForTeam: vi.fn() }))
vi.mock("@/lib/ticket-events", () => ({
  appendTicketEvent: vi.fn().mockResolvedValue(undefined),
  broadcastTicketEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/ensure-project-members", () => ({ ensureProjectMembers: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/mentions", () => ({
  resolveMentionedProfiles: vi.fn().mockResolvedValue([]),
  processMentions: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/ticket-completion-notify", () => ({ notifyTicketCompletion: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/ticket-cascade", () => ({ cascadeCompleteToSubtickets: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/timer-autostop", () => ({ stopRunningTimersOnStatusChange: vi.fn().mockResolvedValue(undefined) }))

import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"
import { sendAssignmentEmail, sendResolutionEmail } from "@/lib/email"
import { resolveMiscProjectForTeam } from "@/lib/misc-project"
import { appendTicketEvent, broadcastTicketEvent } from "@/lib/ticket-events"
import { ensureProjectMembers } from "@/lib/ensure-project-members"
import { resolveMentionedProfiles, processMentions } from "@/lib/mentions"
import { notifyTicketCompletion } from "@/lib/ticket-completion-notify"
import { cascadeCompleteToSubtickets } from "@/lib/ticket-cascade"
import { stopRunningTimersOnStatusChange } from "@/lib/timer-autostop"
import { listTeams, searchTickets, getTicket, createTicket, updateTicket, addComment, deleteTicket } from "./tools"
import type { ApiKeyContext } from "@/lib/api-key-auth"

const mockTeamFindMany = vi.mocked(prisma.team.findMany)
const mockTeamFindFirst = vi.mocked(prisma.team.findFirst)
const mockTicketFindMany = vi.mocked(prisma.ticket.findMany)
const mockTicketFindFirst = vi.mocked(prisma.ticket.findFirst)
const mockTicketCreate = vi.mocked(prisma.ticket.create)
const mockTicketUpdate = vi.mocked(prisma.ticket.update)
const mockProfileFindFirst = vi.mocked(prisma.profile.findFirst)
const mockStatusFindFirst = vi.mocked(prisma.teamStatus.findFirst)
const mockStatusFindMany = vi.mocked(prisma.teamStatus.findMany)
const mockProjectFindFirst = vi.mocked(prisma.project.findFirst)
const mockSprintFindFirst = vi.mocked(prisma.sprint.findFirst)
const mockModuleFindFirst = vi.mocked(prisma.projectModule.findFirst)
const mockCommentCreate = vi.mocked(prisma.comment.create)
const mockActivityLogCreate = vi.mocked(prisma.activityLog.create)
const mockMisc = vi.mocked(resolveMiscProjectForTeam)

const writeCtx: ApiKeyContext = {
  keyId: "key-1",
  departmentId: null,
  tenantId: null,
  scope: "read_write",
  createdById: "user-1",
  creatorName: "Dumitru",
}
const readCtx: ApiKeyContext = { ...writeCtx, scope: "read" }
const deptCtx: ApiKeyContext = { ...writeCtx, departmentId: "dept-1" }

const webTeam = {
  id: "team-web",
  name: "Web Developers",
  prefix: "WEB",
  departmentId: "dept-1",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listTeams", () => {
  it("filters by the key's department when scoped", async () => {
    mockTeamFindMany.mockResolvedValue([] as never)
    await listTeams(deptCtx)
    expect(mockTeamFindMany.mock.calls[0][0]?.where).toEqual({ departmentId: "dept-1" })
  })

  it("returns all teams for unscoped keys", async () => {
    mockTeamFindMany.mockResolvedValue([] as never)
    await listTeams(writeCtx)
    expect(mockTeamFindMany.mock.calls[0][0]?.where).toEqual({})
  })
})

describe("searchTickets", () => {
  it("builds a dept-scoped, non-deleted, title-contains query", async () => {
    mockTicketFindMany.mockResolvedValue([] as never)
    const res = await searchTickets(deptCtx, { query: "login", limit: 10 })
    expect(res.ok).toBe(true)
    const where = mockTicketFindMany.mock.calls[0][0]?.where as Record<string, unknown>
    expect(where.deletedAt).toBeNull()
    expect(where.title).toEqual({ contains: "login", mode: "insensitive" })
    expect(where.team).toEqual({ departmentId: "dept-1" })
  })

  it("caps limit at 50", async () => {
    mockTicketFindMany.mockResolvedValue([] as never)
    await searchTickets(writeCtx, { limit: 500 })
    expect(mockTicketFindMany.mock.calls[0][0]?.take).toBe(50)
  })
})

describe("getTicket", () => {
  it("errors on an unparseable ref", async () => {
    const res = await getTicket(writeCtx, { ref: "nonsense" })
    expect(res).toEqual({ ok: false, message: 'Could not parse "nonsense" — expected a ticket reference like WEB-123' })
  })

  it("errors when the ticket does not exist", async () => {
    mockTicketFindFirst.mockResolvedValue(null as never)
    const res = await getTicket(writeCtx, { ref: "WEB-999" })
    expect(res.ok).toBe(false)
  })
})

describe("createTicket", () => {
  const input = {
    title: "Fix login",
    type: "Bug" as const,
    priority: "High" as const,
    teamPrefix: "WEB",
  }

  it("rejects read-scope keys", async () => {
    const res = await createTicket(readCtx, input)
    expect(res).toEqual({
      ok: false,
      message: "This API key is read-only — ticket creation requires a read_write key",
    })
    expect(mockTicketCreate).not.toHaveBeenCalled()
  })

  it("errors when the team prefix is unknown or out of the key's department", async () => {
    mockTeamFindFirst.mockResolvedValue(null as never)
    const res = await createTicket(writeCtx, input)
    expect(res.ok).toBe(false)
    expect(mockTicketCreate).not.toHaveBeenCalled()
  })

  it("errors when assigneeEmail matches nobody", async () => {
    mockTeamFindFirst.mockResolvedValue(webTeam as never)
    mockProfileFindFirst.mockResolvedValue(null as never)
    const res = await createTicket(writeCtx, { ...input, assigneeEmail: "ghost@pen.com" })
    expect(res.ok).toBe(false)
    expect(mockTicketCreate).not.toHaveBeenCalled()
  })

  it("creates with trigger-stamped numbering, first team status, and the key owner as creator", async () => {
    mockTeamFindFirst.mockResolvedValue(webTeam as never)
    mockStatusFindFirst.mockResolvedValue({ label: "To Do" } as never)
    mockMisc.mockResolvedValue("proj-misc")
    mockTicketCreate.mockResolvedValue({
      id: "t-1",
      ticketNumber: 241,
      title: "Fix login",
      team: { prefix: "WEB" },
      assignee: null,
    } as never)

    const res = await createTicket(writeCtx, input)

    expect(res.ok).toBe(true)
    expect((res as { ok: true; data: { humanId: string } }).data.humanId).toBe("WEB-241")
    const data = mockTicketCreate.mock.calls[0][0]?.data as Record<string, unknown>
    expect(data.ticketNumber).toBe(0)
    expect(data.status).toBe("To Do")
    expect(data.creator).toEqual({ connect: { id: "user-1" } })
    expect(data.project).toEqual({ connect: { id: "proj-misc" } })
  })

  it("notifies and emails an assignee who is not the creator", async () => {
    mockTeamFindFirst.mockResolvedValue(webTeam as never)
    mockStatusFindFirst.mockResolvedValue({ label: "To Do" } as never)
    mockMisc.mockResolvedValue("proj-misc")
    mockProfileFindFirst.mockResolvedValue({ id: "user-2", name: "Nur", email: "nur@pen.com" } as never)
    mockTicketCreate.mockResolvedValue({
      id: "t-2",
      ticketNumber: 242,
      title: "Fix login",
      team: { prefix: "WEB" },
      assignee: { id: "user-2", name: "Nur", email: "nur@pen.com" },
    } as never)

    const res = await createTicket(writeCtx, { ...input, assigneeEmail: "nur@pen.com" })

    expect(res.ok).toBe(true)
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "user-2", actorId: "user-1", type: "assignment" }),
    )
    expect(sendAssignmentEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "nur@pen.com", humanId: "WEB-242" }),
    )
  })
})

const baseTicketRow = {
  id: "t-1",
  title: "Old title",
  description: null,
  type: "Bug",
  priority: "Low",
  status: "Backlog",
  labels: [],
  closedAt: null,
  ticketNumber: 7,
  teamId: "team-web",
  projectId: "p-1",
  sprintId: null,
  moduleId: null,
  assigneeId: null,
  creatorId: "user-9",
  team: { prefix: "WEB", departmentId: "dept-1" },
  assignee: null,
  sprint: null,
  module: null,
  project: { id: "p-1", name: "Misc" },
  intake: null,
}

describe("updateTicket", () => {
  it("rejects read-scope keys", async () => {
    const res = await updateTicket(readCtx, { ref: "WEB-1", title: "New" })
    expect(res).toEqual({
      ok: false,
      message: "This API key is read-only — ticket updates require a read_write key",
    })
  })

  it("errors when the ticket is not found", async () => {
    mockTicketFindFirst.mockResolvedValue(null as never)
    const res = await updateTicket(writeCtx, { ref: "WEB-999", title: "New" })
    expect(res).toEqual({
      ok: false,
      message: "Ticket WEB-999 not found (or outside this key's department)",
    })
  })

  it("updates simple fields and emits one event per changed field", async () => {
    mockTicketFindFirst.mockResolvedValue(baseTicketRow as never)
    mockTicketUpdate.mockResolvedValue({} as never)

    const res = await updateTicket(writeCtx, { ref: "WEB-7", title: "New title", priority: "High" })

    expect(res.ok).toBe(true)
    expect(mockTicketUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "t-1" },
      data: { title: "New title", priority: "High" },
    })
    expect(vi.mocked(appendTicketEvent)).toHaveBeenCalledWith("t-1", "user-1", "TITLE_CHANGED", {
      from: "Old title", to: "New title",
    })
    expect(vi.mocked(appendTicketEvent)).toHaveBeenCalledWith("t-1", "user-1", "PRIORITY_CHANGED", {
      from: "Low", to: "High",
    })
    expect((res as { ok: true; data: { changed: Record<string, unknown> } }).data.changed).toEqual({
      title: { from: "Old title", to: "New title" },
      priority: { from: "Low", to: "High" },
    })
  })

  it("returns ok with empty changed when no provided field differs", async () => {
    mockTicketFindFirst.mockResolvedValue({ ...baseTicketRow, title: "Same" } as never)
    const res = await updateTicket(writeCtx, { ref: "WEB-7", title: "Same" })
    expect(res.ok).toBe(true)
    expect(mockTicketUpdate).not.toHaveBeenCalled()
    expect((res as { ok: true; data: { changed: Record<string, unknown> } }).data.changed).toEqual({})
  })

  it("assigns by email, notifies and emails the new assignee", async () => {
    mockTicketFindFirst.mockResolvedValue({ ...baseTicketRow, title: "Fix login" } as never)
    mockProfileFindFirst.mockResolvedValue({ id: "user-2", name: "Abu", email: "abu@pen.org" } as never)
    mockTicketUpdate.mockResolvedValue({} as never)

    const res = await updateTicket(writeCtx, { ref: "WEB-7", assigneeEmail: "abu@pen.org" })

    expect(res.ok).toBe(true)
    expect(mockTicketUpdate.mock.calls[0][0]).toMatchObject({ data: { assigneeId: "user-2" } })
    expect(vi.mocked(appendTicketEvent)).toHaveBeenCalledWith("t-1", "user-1", "ASSIGNED", {
      fromId: null, fromName: null, toId: "user-2", toName: "Abu",
    })
    expect(vi.mocked(createNotification)).toHaveBeenCalledWith({
      recipientId: "user-2", actorId: "user-1", type: "assignment", ticketId: "t-1", message: "Fix login",
    })
    expect(vi.mocked(sendAssignmentEmail)).toHaveBeenCalledWith(expect.objectContaining({
      to: "abu@pen.org", humanId: "WEB-7", assignedByName: "Dumitru",
    }))
    expect(vi.mocked(ensureProjectMembers)).toHaveBeenCalledWith("p-1", ["user-2"])
  })

  it("errors when assignee email is unknown", async () => {
    mockTicketFindFirst.mockResolvedValue(baseTicketRow as never)
    mockProfileFindFirst.mockResolvedValue(null as never)
    const res = await updateTicket(writeCtx, { ref: "WEB-7", assigneeEmail: "ghost@pen.org" })
    expect(res).toEqual({ ok: false, message: "No user found with email ghost@pen.org" })
    expect(mockTicketUpdate).not.toHaveBeenCalled()
  })

  it("moves project after validating it, and errors on unknown sprint", async () => {
    mockTicketFindFirst.mockResolvedValue(baseTicketRow as never)
    mockProjectFindFirst.mockResolvedValue({ id: "p-2", kind: "normal", name: "Portal" } as never)
    mockTicketUpdate.mockResolvedValue({} as never)
    const ok = await updateTicket(writeCtx, { ref: "WEB-7", projectId: "p-2" })
    expect(ok.ok).toBe(true)
    expect(vi.mocked(appendTicketEvent)).toHaveBeenCalledWith("t-1", "user-1", "PROJECT_CHANGED", {
      fromId: "p-1", fromName: "Misc", toId: "p-2", toName: "Portal",
    })

    vi.clearAllMocks()
    mockTicketFindFirst.mockResolvedValue(baseTicketRow as never)
    mockSprintFindFirst.mockResolvedValue(null as never)
    const bad = await updateTicket(writeCtx, { ref: "WEB-7", sprintId: "s-404" })
    expect(bad).toEqual({ ok: false, message: "Sprint not found: s-404" })
  })

  it("sets any valid status, stamps the trigger actor, and fires completion side-effects", async () => {
    mockTicketFindFirst.mockResolvedValue({
      ...baseTicketRow,
      title: "Fix login",
      status: "In Progress",
      assigneeId: "user-2",
      assignee: { id: "user-2", name: "Abu" },
      intake: { submitterName: "Jo", submitterEmail: "jo@x.org", formConfig: { name: "Support" } },
    } as never)
    mockStatusFindMany.mockResolvedValue([
      { label: "Backlog", isComplete: false },
      { label: "In Progress", isComplete: false },
      { label: "Live", isComplete: true },
    ] as never)
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      ticket: { update: vi.fn().mockResolvedValue(undefined) },
    }
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => (fn as (t: typeof tx) => unknown)(tx))

    const res = await updateTicket(writeCtx, { ref: "WEB-7", status: "Live" })

    expect(res.ok).toBe(true)
    expect(tx.$executeRaw).toHaveBeenCalled()
    expect(tx.ticket.update.mock.calls[0][0].data).toMatchObject({ status: "Live" })
    expect(tx.ticket.update.mock.calls[0][0].data.closedAt).toBeInstanceOf(Date)
    expect(vi.mocked(broadcastTicketEvent)).toHaveBeenCalledWith("t-1", "STATUS_CHANGED", "user-1", {
      from: "In Progress", to: "Live",
    })
    expect(vi.mocked(stopRunningTimersOnStatusChange)).toHaveBeenCalledWith("t-1", "Live")
    expect(vi.mocked(notifyTicketCompletion)).toHaveBeenCalledWith(expect.objectContaining({
      ticketId: "t-1", humanId: "WEB-7", actorId: "user-1", actorName: "Dumitru",
    }))
    expect(vi.mocked(cascadeCompleteToSubtickets)).toHaveBeenCalledWith("t-1")
    expect(vi.mocked(sendResolutionEmail)).toHaveBeenCalledWith(expect.objectContaining({ to: "jo@x.org" }))
  })

  it("rejects a status label outside the team's workflow", async () => {
    mockTicketFindFirst.mockResolvedValue(baseTicketRow as never)
    mockStatusFindMany.mockResolvedValue([
      { label: "Backlog", isComplete: false },
      { label: "Live", isComplete: true },
    ] as never)
    const res = await updateTicket(writeCtx, { ref: "WEB-7", status: "Bogus" })
    expect(res).toEqual({
      ok: false,
      message: 'Invalid status "Bogus" for this team — valid: Backlog, Live',
    })
  })
})

describe("addComment", () => {
  const ticketRow = {
    id: "t-1", title: "Fix login", creatorId: "user-9", assigneeId: "user-2",
    assignees: [{ userId: "user-3" }],
    team: { prefix: "WEB" },
  }

  it("rejects read-scope keys", async () => {
    const res = await addComment(readCtx, { ref: "WEB-7", body: "hi" })
    expect(res).toEqual({
      ok: false,
      message: "This API key is read-only — commenting requires a read_write key",
    })
  })

  it("rejects an empty body", async () => {
    const res = await addComment(writeCtx, { ref: "WEB-7", body: "   " })
    expect(res).toEqual({ ok: false, message: "Comment body is required" })
  })

  it("creates the comment, logs the event, processes mentions, notifies watchers", async () => {
    mockTicketFindFirst.mockResolvedValue(ticketRow as never)
    mockCommentCreate.mockResolvedValue({ id: "c-1" } as never)
    vi.mocked(resolveMentionedProfiles).mockResolvedValue([{ id: "user-3" }] as never)

    const res = await addComment(writeCtx, { ref: "WEB-7", body: "Deployed @Nur" })

    expect(res.ok).toBe(true)
    expect(mockCommentCreate.mock.calls[0][0]).toMatchObject({
      data: { ticketId: "t-1", authorId: "user-1", body: "Deployed @Nur" },
    })
    expect(vi.mocked(appendTicketEvent)).toHaveBeenCalledWith("t-1", "user-1", "COMMENT_ADDED", { commentId: "c-1" })
    expect(vi.mocked(processMentions)).toHaveBeenCalledWith({
      commentId: "c-1", ticketId: "t-1", actorId: "user-1", actorName: "Dumitru",
      body: "Deployed @Nur", ticketTitle: "Fix login",
    })
    // creator + assignee notified; mentioned co-assignee (user-3) skipped (mention flow covers them)
    const notified = vi.mocked(createNotification).mock.calls.map((c) => c[0].recipientId).sort()
    expect(notified).toEqual(["user-2", "user-9"])
  })
})

describe("deleteTicket", () => {
  const adminCtx: ApiKeyContext = { ...writeCtx, scope: "admin" }
  const row = {
    id: "t-1", title: "Fix login", ticketNumber: 7, deletedAt: null,
    assigneeId: "user-2", assignees: [{ userId: "user-3" }],
    team: { prefix: "WEB" },
  }

  it("requires an admin key", async () => {
    const res = await deleteTicket(writeCtx, { ref: "WEB-7" })
    expect(res).toEqual({ ok: false, message: "Deleting tickets requires an admin API key" })
  })

  it("soft-deletes, logs TICKET_DELETED, notifies assignees", async () => {
    mockTicketFindFirst.mockResolvedValue(row as never)
    mockTicketUpdate.mockResolvedValue({} as never)
    mockActivityLogCreate.mockResolvedValue({} as never)

    const res = await deleteTicket(adminCtx, { ref: "WEB-7" })

    expect(res).toEqual({ ok: true, data: { ref: "WEB-7", alreadyDeleted: false } })
    expect(mockTicketUpdate.mock.calls[0][0].where).toEqual({ id: "t-1" })
    expect((mockTicketUpdate.mock.calls[0][0].data as { deletedAt: unknown }).deletedAt).toBeInstanceOf(Date)
    expect(mockActivityLogCreate.mock.calls[0][0].data).toMatchObject({
      ticketId: "t-1", actorId: "user-1", action: "TICKET_DELETED",
      metadata: { humanId: "WEB-7", title: "Fix login" },
    })
    const notified = vi.mocked(createNotification).mock.calls.map((c) => c[0].recipientId).sort()
    expect(notified).toEqual(["user-2", "user-3"])
  })

  it("is idempotent on an already-deleted ticket", async () => {
    mockTicketFindFirst.mockResolvedValue({ ...row, deletedAt: new Date() } as never)
    const res = await deleteTicket(adminCtx, { ref: "WEB-7" })
    expect(res).toEqual({ ok: true, data: { ref: "WEB-7", alreadyDeleted: true } })
    expect(mockTicketUpdate).not.toHaveBeenCalled()
  })
})
