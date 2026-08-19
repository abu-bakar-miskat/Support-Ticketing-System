import { describe, it, expect, vi, beforeEach } from "vitest"
import { PATCH } from "./route"

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

const txMock = {
  $executeRaw: vi.fn(),
  ticket: { updateMany: vi.fn(), findUnique: vi.fn() },
}

vi.mock("@/lib/profile", () => ({ getProfile: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"

const mockGetProfile = vi.mocked(getProfile)
const mockFindUnique = vi.mocked(prisma.ticket.findUnique)
const mockTransaction = vi.mocked(prisma.$transaction)

const mockParams = Promise.resolve({ id: "ticket-1" })

const baseTicket = {
  id: "ticket-1",
  status: "Backlog",
  assigneeId: mockProfile.id,
  deletedAt: null,
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/tickets/ticket-1/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProfile.mockResolvedValue(mockProfile as never)
  mockFindUnique.mockResolvedValue(baseTicket as never)
  txMock.ticket.updateMany.mockResolvedValue({ count: 1 } as never)
  txMock.ticket.findUnique.mockResolvedValue({
    id: "ticket-1",
    status: "InProgress",
    cycleTime: null,
  } as never)
  mockTransaction.mockImplementation((async (fn: (tx: typeof txMock) => unknown) =>
    fn(txMock)) as never)
})

describe("PATCH /api/tickets/[id]/status", () => {
  it("advances Backlog → InProgress for the assignee", async () => {
    const res = await PATCH(makeRequest({ to: "InProgress" }), { params: mockParams })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.status).toBe("InProgress")
    expect(txMock.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ticket-1", assigneeId: mockProfile.id, status: "Backlog" },
        data: { status: "InProgress" },
      }),
    )
  })

  it("returns 400 on a skipped transition", async () => {
    const res = await PATCH(makeRequest({ to: "Live" }), { params: mockParams })
    expect(res.status).toBe(400)
  })

  it("returns 400 on a backward transition", async () => {
    mockFindUnique.mockResolvedValue({ ...baseTicket, status: "PullRequest" } as never)
    const res = await PATCH(makeRequest({ to: "InProgress" }), { params: mockParams })
    expect(res.status).toBe(400)
  })

  it("returns 400 when ticket is already Live", async () => {
    mockFindUnique.mockResolvedValue({ ...baseTicket, status: "Live" } as never)
    const res = await PATCH(makeRequest({ to: "Live" }), { params: mockParams })
    expect(res.status).toBe(400)
  })

  it("returns 403 when caller is not the assignee", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseTicket,
      assigneeId: "00000000-0000-0000-0000-000000000002",
    } as never)
    const res = await PATCH(makeRequest({ to: "InProgress" }), { params: mockParams })
    expect(res.status).toBe(403)
  })

  it("returns 404 when ticket does not exist", async () => {
    mockFindUnique.mockResolvedValue(null)
    const res = await PATCH(makeRequest({ to: "InProgress" }), { params: mockParams })
    expect(res.status).toBe(404)
  })

  it("returns 409 when ticket is soft-deleted", async () => {
    mockFindUnique.mockResolvedValue({ ...baseTicket, deletedAt: new Date() } as never)
    const res = await PATCH(makeRequest({ to: "InProgress" }), { params: mockParams })
    expect(res.status).toBe(409)
  })

  it("returns 409 when the guarded update matches no rows (TOCTOU)", async () => {
    txMock.ticket.updateMany.mockResolvedValue({ count: 0 } as never)
    const res = await PATCH(makeRequest({ to: "InProgress" }), { params: mockParams })
    expect(res.status).toBe(409)
  })

  it("returns 401 when unauthenticated", async () => {
    mockGetProfile.mockResolvedValue(null)
    const res = await PATCH(makeRequest({ to: "InProgress" }), { params: mockParams })
    expect(res.status).toBe(401)
  })
})
