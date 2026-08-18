import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    ticketMessage: { findUnique: vi.fn(), update: vi.fn() },
    departmentManager: { findFirst: vi.fn() },
  },
}))

import { POST } from "./route"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"

const mockRequireAuth = vi.mocked(requireAuth)
const mockFindMsg = vi.mocked(prisma.ticketMessage.findUnique)
const mockUpdateMsg = vi.mocked(prisma.ticketMessage.update)
const mockFindManager = vi.mocked(prisma.departmentManager.findFirst)

const TICKET_ID = "ticket-1"
const MSG_ID = "msg-quarantined-1"
const ASSIGNEE_ID = "profile-assignee"
const MANAGER_ID = "profile-manager"
const RANDOM_ID = "profile-random"
const DEPT_ID = "dept-1"

const quarantinedMessage = {
  id: MSG_ID,
  ticketId: TICKET_ID,
  status: "quarantined",
  ticket: {
    id: TICKET_ID,
    assigneeId: ASSIGNEE_ID,
    assignees: [],
    subDepartment: { departmentId: DEPT_ID },
  },
}

const updatedMessage = {
  id: MSG_ID,
  status: "trusted",
  acceptedById: ASSIGNEE_ID,
  acceptedAt: new Date(),
}

function makeRequest() {
  return new Request(`http://localhost/api/tickets/${TICKET_ID}/messages/${MSG_ID}/accept`, {
    method: "POST",
  }) as never
}

function makeParams() {
  return { params: Promise.resolve({ id: TICKET_ID, messageId: MSG_ID }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindMsg.mockResolvedValue(quarantinedMessage as never)
  mockUpdateMsg.mockResolvedValue(updatedMessage as never)
  mockFindManager.mockResolvedValue(null as never)
})

describe("POST /api/tickets/[id]/messages/[messageId]/accept", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      profile: null as never,
      error: new Response(null, { status: 401 }) as never,
    })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(401)
    expect(mockUpdateMsg).not.toHaveBeenCalled()
  })

  it("returns 404 when message does not exist", async () => {
    mockRequireAuth.mockResolvedValue({ profile: { id: ASSIGNEE_ID } as never, error: null })
    mockFindMsg.mockResolvedValue(null as never)
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(404)
  })

  it("returns 404 when message belongs to a different ticket", async () => {
    mockRequireAuth.mockResolvedValue({ profile: { id: ASSIGNEE_ID } as never, error: null })
    mockFindMsg.mockResolvedValue({ ...quarantinedMessage, ticketId: "other-ticket" } as never)
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(404)
  })

  it("returns 409 when message is not quarantined", async () => {
    mockRequireAuth.mockResolvedValue({ profile: { id: ASSIGNEE_ID } as never, error: null })
    mockFindMsg.mockResolvedValue({ ...quarantinedMessage, status: "trusted" } as never)
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(409)
  })

  it("allows the assignee to accept a quarantined message", async () => {
    mockRequireAuth.mockResolvedValue({ profile: { id: ASSIGNEE_ID } as never, error: null })

    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)
    expect(mockUpdateMsg).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MSG_ID },
        data: expect.objectContaining({
          status: "trusted",
          acceptedById: ASSIGNEE_ID,
        }),
      }),
    )
  })

  it("allows a department manager to accept a quarantined message", async () => {
    mockRequireAuth.mockResolvedValue({ profile: { id: MANAGER_ID } as never, error: null })
    mockFindManager.mockResolvedValue({ userId: MANAGER_ID } as never)

    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)
    expect(mockFindManager).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { departmentId: DEPT_ID, userId: MANAGER_ID },
      }),
    )
    expect(mockUpdateMsg).toHaveBeenCalled()
  })

  it("returns 403 when requester is neither assignee nor dept manager", async () => {
    mockRequireAuth.mockResolvedValue({ profile: { id: RANDOM_ID } as never, error: null })
    mockFindManager.mockResolvedValue(null as never)

    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(403)
    expect(mockUpdateMsg).not.toHaveBeenCalled()
  })

  it("allows a co-assignee to accept a quarantined message", async () => {
    mockRequireAuth.mockResolvedValue({ profile: { id: "co-assignee-id" } as never, error: null })
    mockFindMsg.mockResolvedValue({
      ...quarantinedMessage,
      ticket: {
        ...quarantinedMessage.ticket,
        assigneeId: ASSIGNEE_ID,
        assignees: [{ userId: "co-assignee-id" }],
      },
    } as never)

    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(200)
    expect(mockFindManager).not.toHaveBeenCalled()
  })
})
