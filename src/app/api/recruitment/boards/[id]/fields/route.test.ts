import { describe, it, expect, vi, beforeEach } from "vitest"
import { PATCH } from "./route"

vi.mock("@/lib/auth", () => ({
  requireAdminOrManager: vi.fn(),
  resolveActiveDeptId: vi.fn(async () => "dept-web"),
  // Mirrors the real helper (which can't be imported here: lib/auth pulls in server-only).
  recruitmentBoardWhere: (p: { id: string; role: string }, deptId: string | null) =>
    p.role === "admin"
      ? { departmentId: deptId }
      : { departmentId: deptId, createdById: p.id },
}))
vi.mock("@/lib/db", () => ({
  prisma: {
    recruitmentBoard: { findFirst: vi.fn() },
    recruitmentField: { update: vi.fn((args: unknown) => args) },
    $transaction: vi.fn(),
  },
}))

import { requireAdminOrManager } from "@/lib/auth"
import { prisma } from "@/lib/db"

const mockRequire = vi.mocked(requireAdminOrManager)
const mockBoardFindFirst = vi.mocked(prisma.recruitmentBoard.findFirst)
const mockTransaction = vi.mocked(prisma.$transaction)

const params = Promise.resolve({ id: "board-1" })

function makePatch(body: unknown) {
  return new Request("http://localhost/api/recruitment/boards/board-1/fields", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }) as never
}

function asManager(id = "mgr-1") {
  mockRequire.mockResolvedValue({
    profile: { id, role: "manager" },
    isAdmin: false,
    error: null,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  asManager()
  mockBoardFindFirst.mockResolvedValue({
    id: "board-1",
    fields: [{ id: "f1" }, { id: "f2" }, { id: "f3" }],
  } as never)
  mockTransaction.mockResolvedValue([] as never)
})

describe("PATCH /api/recruitment/boards/[id]/fields (bulk reorder)", () => {
  it("resequences order by the given ids in a transaction", async () => {
    const res = await PATCH(makePatch({ orderedIds: ["f3", "f1", "f2"] }), { params })
    expect(res.status).toBe(200)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    const updates = mockTransaction.mock.calls[0][0] as unknown as Array<{
      where: { id: string }
      data: { order: number }
    }>
    expect(updates.map((u) => [u.where.id, u.data.order])).toEqual([
      ["f3", 0],
      ["f1", 1],
      ["f2", 2],
    ])
  })

  it("scopes the board lookup to the manager's own boards", async () => {
    await PATCH(makePatch({ orderedIds: ["f1", "f2", "f3"] }), { params })
    expect(mockBoardFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "board-1", departmentId: "dept-web", createdById: "mgr-1" },
      }),
    )
  })

  it("scopes the lookup to the active department for admins", async () => {
    mockRequire.mockResolvedValue({
      profile: { id: "adm-1", role: "admin" },
      isAdmin: true,
      error: null,
    } as never)
    await PATCH(makePatch({ orderedIds: ["f1", "f2", "f3"] }), { params })
    expect(mockBoardFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "board-1", departmentId: "dept-web" } }),
    )
  })

  it("404s when the board is not visible to the caller", async () => {
    mockBoardFindFirst.mockResolvedValue(null as never)
    const res = await PATCH(makePatch({ orderedIds: ["f1", "f2", "f3"] }), { params })
    expect(res.status).toBe(404)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it.each([
    [{ orderedIds: "f1" }],
    [{ orderedIds: ["f1", "f2"] }],
    [{ orderedIds: ["f1", "f2", "nope"] }],
    [{ orderedIds: ["f1", "f1", "f2"] }],
    [{}],
  ])("rejects an invalid orderedIds payload %#", async (body) => {
    const res = await PATCH(makePatch(body), { params })
    expect(res.status).toBe(400)
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
