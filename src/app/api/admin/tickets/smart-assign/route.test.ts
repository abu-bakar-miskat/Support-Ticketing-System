import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ requireAdminOrManager: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    profile: { findMany: vi.fn() },
    subDepartmentMembership: { findMany: vi.fn() },
    ticket: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    activityLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock("@/lib/rota", () => ({
  isMemberAvailableNow: vi.fn(),
  isMemberActiveInRotation: vi.fn(),
}))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn(() => Promise.resolve()) }))
vi.mock("@/lib/email", () => ({ sendAssignmentEmail: vi.fn(() => Promise.resolve()) }))
vi.mock("@/lib/ensure-project-members", () => ({ ensureProjectMembers: vi.fn(() => Promise.resolve()) }))
vi.mock("@/lib/dept-scope", () => ({
  getProfileDeptScope: vi.fn(() => Promise.resolve(null)),
  subDepartmentInScope: vi.fn(() => Promise.resolve(true)),
}))

import { requireAdminOrManager } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { isMemberAvailableNow, isMemberActiveInRotation } from "@/lib/rota"
import { subDepartmentInScope } from "@/lib/dept-scope"
import { POST } from "./route"

const mockRequire = vi.mocked(requireAdminOrManager)
const mockProfileFindMany = vi.mocked(prisma.profile.findMany)
const mockTicketFindMany = vi.mocked(prisma.ticket.findMany)
const mockTicketFindUnique = vi.mocked(prisma.ticket.findUnique)
const mockTicketUpdate = vi.mocked(prisma.ticket.update)
const mockTransaction = vi.mocked(prisma.$transaction)
const mockAvailableNow = vi.mocked(isMemberAvailableNow)
const mockActiveInRotation = vi.mocked(isMemberActiveInRotation)

const TEAM = "team-1"
const TICKET_IDS = ["t1", "t2", "t3"]

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/tickets/smart-assign", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }) as never
}

/** Captures the assigneeId written to each ticket during the round-robin. */
function assignedIds(): string[] {
  return mockTicketUpdate.mock.calls.map((c) => (c[0] as { data: { assigneeId: string } }).data.assigneeId)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequire.mockResolvedValue({
    profile: { id: "admin-1", role: "admin", name: "Admin" },
    isAdmin: true,
    error: null,
  } as never)

  // 1st profile.findMany = verify assignees exist; later calls = changed-assignee profiles.
  mockProfileFindMany
    .mockResolvedValueOnce([
      { id: "a", role: "agent" },
      { id: "b", role: "agent" },
      { id: "c", role: "agent" },
    ] as never)
    .mockResolvedValue([
      { id: "a", name: "A", email: "a@x.com" },
      { id: "c", name: "C", email: "c@x.com" },
    ] as never)

  // Tickets before — distinct prior assignee so every assignment counts as "changed".
  mockTicketFindMany.mockResolvedValue(
    TICKET_IDS.map((id) => ({
      id,
      title: `Ticket ${id}`,
      ticketNumber: 1,
      assigneeId: "old",
      projectId: null,
      subDepartmentId: TEAM,
      subDepartment: { prefix: "SUP", departmentId: "d1" },
    })) as never,
  )
  mockTicketFindUnique.mockResolvedValue({ subDepartmentId: TEAM } as never)
  mockTicketUpdate.mockResolvedValue({} as never)
  mockTransaction.mockImplementation(async (ops: unknown) =>
    Array.isArray(ops) ? Promise.all(ops) : ops,
  )
  vi.mocked(prisma.activityLog.create).mockResolvedValue({} as never)
})

describe("POST /api/admin/tickets/smart-assign — round robin availability", () => {
  it("uses the selected sub-department to check member availability", async () => {
    vi.mocked(prisma.subDepartmentMembership.findMany).mockResolvedValue([
      { userId: "a" }, { userId: "b" }, { userId: "c" },
    ] as never)
    mockAvailableNow.mockResolvedValue(true)

    const response = await POST(makeRequest({ ticketIds: TICKET_IDS, mode: "round-robin", assigneeIds: ["a", "b", "c"], subDepartmentId: "selected-team" }))

    expect(response.status).toBe(200)
    expect(mockAvailableNow).toHaveBeenCalledWith("a", "selected-team")
  })

  it("rejects assignees outside the selected sub-department before updating tickets", async () => {
    vi.mocked(prisma.subDepartmentMembership.findMany).mockResolvedValue([{ userId: "a" }] as never)

    const response = await POST(makeRequest({ ticketIds: TICKET_IDS, mode: "round-robin", assigneeIds: ["a", "b"], subDepartmentId: TEAM }))

    expect(response.status).toBe(400)
    expect(mockTicketUpdate).not.toHaveBeenCalled()
  })

  it("rejects a selected sub-department outside the caller's scope", async () => {
    vi.mocked(subDepartmentInScope).mockResolvedValueOnce(false)

    const response = await POST(makeRequest({ ticketIds: TICKET_IDS, mode: "single", assigneeIds: ["a"], subDepartmentId: TEAM }))

    expect(response.status).toBe(403)
    expect(mockTicketUpdate).not.toHaveBeenCalled()
  })

  it("never distributes onto an unavailable member", async () => {
    // b is unavailable (holiday / off-hours); a and c are available.
    mockAvailableNow.mockImplementation((id: string) => Promise.resolve(id !== "b") as never)

    const res = await POST(makeRequest({ ticketIds: TICKET_IDS, mode: "round-robin", assigneeIds: ["a", "b", "c"] }))
    expect(res.status).toBe(200)

    const assigned = assignedIds()
    expect(assigned).toHaveLength(3)
    expect(assigned).not.toContain("b")
    expect(new Set(assigned)).toEqual(new Set(["a", "c"]))
    // Fallback should not be consulted when someone is available.
    expect(mockActiveInRotation).not.toHaveBeenCalled()
  })

  it("falls back to active-in-rotation when nobody is available right now", async () => {
    mockAvailableNow.mockResolvedValue(false) // nobody available now
    // b still excluded (e.g. deactivated / doNotAssign); a and c are active in rotation.
    mockActiveInRotation.mockImplementation((id: string) => Promise.resolve(id !== "b") as never)

    const res = await POST(makeRequest({ ticketIds: TICKET_IDS, mode: "round-robin", assigneeIds: ["a", "b", "c"] }))
    expect(res.status).toBe(200)

    const assigned = assignedIds()
    expect(assigned).not.toContain("b")
    expect(new Set(assigned)).toEqual(new Set(["a", "c"]))
    expect(mockActiveInRotation).toHaveBeenCalled()
  })
})
