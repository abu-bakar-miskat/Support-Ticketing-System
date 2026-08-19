import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "./route"

const mockProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "dev@pen.com",
  name: "Dev User",
  avatarUrl: null,
  role: "developer" as const,
  subDepartmentId: "team-abc",
  subDepartmentIds: ["team-abc"], memberships: [], timezone: null, notificationPrefs: null,
  createdAt: new Date(),
}

vi.mock("@/lib/profile", () => ({ getProfile: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { create: vi.fn() },
    project: { findUnique: vi.fn() },
    profile: { findUnique: vi.fn() },
    projectMember: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}))
vi.mock("@/lib/email", () => ({ sendAssignmentEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/ensure-project-members", () => ({
  ensureProjectMembers: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/ticket-events", () => ({
  appendTicketEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/notify", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { sendAssignmentEmail } from "@/lib/email"

const mockGetProfile = vi.mocked(getProfile)
const mockCreate = vi.mocked(prisma.ticket.create)
const mockProjectFindUnique = vi.mocked(prisma.project.findUnique)
const mockProfileFindUnique = vi.mocked(prisma.profile.findUnique)
const mockSendAssignmentEmail = vi.mocked(sendAssignmentEmail)

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const validBody = {
  title: "Fix login redirect",
  type: "Bug",
  priority: "High",
  projectId: "proj-1",
}

const createdTicketBase = {
  id: "ticket-1",
  ticketNumber: 7,
  title: "Fix login redirect",
  type: "Bug",
  priority: "High",
  status: "Backlog",
  subDepartmentId: "team-abc",
  subDepartment: { id: "team-abc", name: "Dev", prefix: "DEV" },
  project: { id: "proj-1", name: "PEN Platform" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProfile.mockResolvedValue(mockProfile as never)
  mockProjectFindUnique.mockResolvedValue({ id: "proj-1" } as never)
  mockProfileFindUnique.mockResolvedValue({ id: "user-2", subDepartmentId: "team-abc" } as never)
})

describe("POST /api/tickets", () => {
  it("returns 201 with ticketNumber in the response on valid input", async () => {
    mockCreate.mockResolvedValue({ ...createdTicketBase, assignee: null } as never)

    const res = await POST(makeRequest(validBody))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.ticketNumber).toBe(7)
    expect(body.subDepartment.prefix).toBe("DEV")
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Fix login redirect",
          subDepartmentId: "team-abc",
          creatorId: mockProfile.id,
          ticketNumber: 0,
        }),
      })
    )
  })

  it("fires sendAssignmentEmail when ticket is created with an assignee", async () => {
    mockCreate.mockResolvedValue({
      ...createdTicketBase,
      assignee: { id: "user-2", name: "Sara", email: "sara@pen.com" },
    } as never)

    await POST(makeRequest({ ...validBody, assigneeId: "user-2" }))

    expect(mockSendAssignmentEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sara@pen.com",
        assigneeName: "Sara",
        humanId: "DEV-7",
        ticketTitle: "Fix login redirect",
        assignedByName: mockProfile.name,
      }),
    )
  })

  it("does not fire sendAssignmentEmail when ticket has no assignee", async () => {
    mockCreate.mockResolvedValue({ ...createdTicketBase, assignee: null } as never)

    await POST(makeRequest(validBody))

    expect(mockSendAssignmentEmail).not.toHaveBeenCalled()
  })

  it("returns 400 when title is missing", async () => {
    const { title: _, ...noTitle } = validBody
    const res = await POST(makeRequest(noTitle))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/required/i)
  })

  it("returns 400 when type is missing", async () => {
    const { type: _, ...noType } = validBody
    const res = await POST(makeRequest(noType))
    expect(res.status).toBe(400)
  })

  it("returns 400 when priority is missing", async () => {
    const { priority: _, ...noPriority } = validBody
    const res = await POST(makeRequest(noPriority))
    expect(res.status).toBe(400)
  })

  it("returns 400 for an invalid type value", async () => {
    const res = await POST(makeRequest({ ...validBody, type: "InvalidType" }))
    expect(res.status).toBe(400)
  })

  it("returns 422 when the user has no team", async () => {
    mockGetProfile.mockResolvedValue({ ...mockProfile, subDepartmentId: null } as never)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(422)
  })

  it("returns 401 when unauthenticated", async () => {
    mockGetProfile.mockResolvedValue(null)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(401)
  })

  it("returns 400 when project does not exist", async () => {
    mockProjectFindUnique.mockResolvedValue(null)
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("returns 400 when assignee does not exist", async () => {
    mockProfileFindUnique.mockResolvedValue(null)
    const res = await POST(makeRequest({ ...validBody, assigneeId: "ghost" }))
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
