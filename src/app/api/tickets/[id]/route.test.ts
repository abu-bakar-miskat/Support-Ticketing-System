import { describe, it, expect, vi, beforeEach } from "vitest"
import { PATCH } from "./route"

const mockProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "dev@pen.com",
  name: "Dev User",
  avatarUrl: null,
  role: "developer" as const,
  teamId: "team-abc",
  teamIds: ["team-abc"], memberships: [], timezone: null, notificationPrefs: null,
  createdAt: new Date(),
}

vi.mock("@/lib/profile", () => ({ getProfile: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn(), update: vi.fn() },
    profile: { findUnique: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}))
vi.mock("@/lib/email", () => ({ sendAssignmentEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/ticket-detail-data", () => ({
  assertAssigneeEligibleForTicket: vi.fn(),
}))

import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { sendAssignmentEmail } from "@/lib/email"
import { assertAssigneeEligibleForTicket } from "@/lib/ticket-detail-data"

const mockGetProfile = vi.mocked(getProfile)
const mockFindUnique = vi.mocked(prisma.ticket.findUnique)
const mockProfileFindUnique = vi.mocked(prisma.profile.findUnique)
const mockUpdate = vi.mocked(prisma.ticket.update)
const mockActivityCreate = vi.mocked(prisma.activityLog.create)
const mockSendEmail = vi.mocked(sendAssignmentEmail)
const mockAssertAssigneeEligible = vi.mocked(assertAssigneeEligibleForTicket)

const mockParams = Promise.resolve({ id: "ticket-1" })

const existingTicket = {
  id: "ticket-1",
  title: "Fix login",
  ticketNumber: 3,
  assigneeId: "00000000-0000-0000-0000-000000000002",
  creatorId: "00000000-0000-0000-0000-000000000009",
  teamId: "team-abc",
  deletedAt: null,
  team: { prefix: "DEV", departmentId: "dept-1" },
  assignee: { id: "00000000-0000-0000-0000-000000000002" },
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/tickets/ticket-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProfile.mockResolvedValue(mockProfile)
  mockActivityCreate.mockResolvedValue({} as never)
  // Default: target assignee exists and is on the ticket's team
  mockProfileFindUnique.mockResolvedValue({
    id: "user-3",
    teamId: "team-abc",
    role: "developer",
  } as never)
  mockAssertAssigneeEligible.mockResolvedValue({ ok: true })
})

describe("PATCH /api/tickets/[id]", () => {
  it("reassigns the ticket and fires email to new assignee", async () => {
    mockFindUnique.mockResolvedValue(existingTicket as never)
    mockUpdate.mockResolvedValue({
      id: "ticket-1",
      ticketNumber: 3,
      team: { prefix: "DEV", name: "Dev" },
      project: { name: "PEN Platform" },
      assignee: { id: "user-3", name: "Sara", email: "sara@pen.com" },
    } as never)

    const res = await PATCH(makeRequest({ assigneeId: "user-3" }), { params: mockParams })

    expect(res.status).toBe(200)
    expect(mockActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ASSIGNED", ticketId: "ticket-1" }),
      }),
    )
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sara@pen.com",
        assigneeName: "Sara",
        humanId: "DEV-3",
        ticketTitle: "Fix login",
        assignedByName: mockProfile.name,
      }),
    )
  })

  it("does not fire email or write ActivityLog when assignee is unchanged", async () => {
    const sameAssigneeId = "00000000-0000-0000-0000-000000000002"
    mockFindUnique.mockResolvedValue(existingTicket as never)
    mockUpdate.mockResolvedValue({
      id: "ticket-1",
      team: { prefix: "DEV", name: "Dev" },
      project: { name: "PEN Platform" },
      assignee: { id: sameAssigneeId, name: "Same", email: "same@pen.com" },
    } as never)

    await PATCH(makeRequest({ assigneeId: sameAssigneeId }), { params: mockParams })

    expect(mockActivityCreate).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("writes ActivityLog but no email when reassigned to null", async () => {
    mockFindUnique.mockResolvedValue(existingTicket as never)
    mockUpdate.mockResolvedValue({
      id: "ticket-1",
      team: { prefix: "DEV", name: "Dev" },
      project: { name: "PEN Platform" },
      assignee: null,
    } as never)

    await PATCH(makeRequest({ assigneeId: null }), { params: mockParams })

    expect(mockActivityCreate).toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns 400 when neither assigneeId nor priority is in the body", async () => {
    mockFindUnique.mockResolvedValue(existingTicket as never)
    const res = await PATCH(makeRequest({}), { params: mockParams })
    expect(res.status).toBe(400)
  })

  it("updates priority without touching assignee", async () => {
    mockFindUnique.mockResolvedValue({ ...existingTicket, priority: "Medium" } as never)
    mockUpdate.mockResolvedValue({
      id: "ticket-1",
      priority: "High",
      team: { prefix: "DEV", name: "Dev" },
      project: { name: "PEN Platform" },
      assignee: { id: "user-2", name: "Same", email: "same@pen.com" },
    } as never)

    const res = await PATCH(makeRequest({ priority: "High" }), { params: mockParams })

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { priority: "High" },
      }),
    )
    expect(mockActivityCreate).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns 404 when ticket does not exist", async () => {
    mockFindUnique.mockResolvedValue(null)
    const res = await PATCH(makeRequest({ assigneeId: "user-3" }), { params: mockParams })
    expect(res.status).toBe(404)
  })

  it("returns 401 when unauthenticated", async () => {
    mockGetProfile.mockResolvedValue(null)
    const res = await PATCH(makeRequest({ assigneeId: "user-3" }), { params: mockParams })
    expect(res.status).toBe(401)
  })

  it("returns 403 when caller is not on the ticket's team (IDOR guard)", async () => {
    mockGetProfile.mockResolvedValue({ ...mockProfile, teamId: "other-team" })
    mockFindUnique.mockResolvedValue(existingTicket as never)
    const res = await PATCH(makeRequest({ assigneeId: "user-3" }), { params: mockParams })
    expect(res.status).toBe(403)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("allows admins regardless of team", async () => {
    mockGetProfile.mockResolvedValue({ ...mockProfile, role: "admin", teamId: "other-team" })
    mockFindUnique.mockResolvedValue(existingTicket as never)
    mockUpdate.mockResolvedValue({
      id: "ticket-1",
      team: { prefix: "DEV", name: "Dev" },
      project: { name: "PEN Platform" },
      assignee: { id: "user-3", name: "Sara", email: "sara@pen.com" },
    } as never)
    const res = await PATCH(makeRequest({ assigneeId: "user-3" }), { params: mockParams })
    expect(res.status).toBe(200)
  })

  it("returns 400 when new assignee does not exist", async () => {
    mockFindUnique.mockResolvedValue(existingTicket as never)
    mockAssertAssigneeEligible.mockResolvedValue({
      ok: false,
      error: "Assignee not found",
    })
    const res = await PATCH(makeRequest({ assigneeId: "ghost" }), { params: mockParams })
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("returns 400 when new assignee is not eligible for the ticket department", async () => {
    mockFindUnique.mockResolvedValue(existingTicket as never)
    mockAssertAssigneeEligible.mockResolvedValue({
      ok: false,
      error: "Assignee must belong to the ticket's department",
    })
    const res = await PATCH(makeRequest({ assigneeId: "user-3" }), { params: mockParams })
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("returns 409 when ticket is soft-deleted", async () => {
    mockFindUnique.mockResolvedValue({ ...existingTicket, deletedAt: new Date() } as never)
    const res = await PATCH(makeRequest({ assigneeId: "user-3" }), { params: mockParams })
    expect(res.status).toBe(409)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
