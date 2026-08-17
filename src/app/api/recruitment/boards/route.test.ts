import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "./route"

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
    recruitmentBoard: { findMany: vi.fn() },
  },
}))

import { requireAdminOrManager } from "@/lib/auth"
import { prisma } from "@/lib/db"

const mockRequire = vi.mocked(requireAdminOrManager)
const mockFindMany = vi.mocked(prisma.recruitmentBoard.findMany)

beforeEach(() => {
  vi.clearAllMocks()
  mockFindMany.mockResolvedValue([] as never)
})

describe("GET /api/recruitment/boards visibility", () => {
  it("managers only see boards they created", async () => {
    mockRequire.mockResolvedValue({
      profile: { id: "mgr-1", role: "manager" },
      isAdmin: false,
      error: null,
    } as never)
    await GET()
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentId: "dept-web", createdById: "mgr-1" } }),
    )
  })

  it("admins see all boards in the active department", async () => {
    mockRequire.mockResolvedValue({
      profile: { id: "adm-1", role: "admin" },
      isAdmin: true,
      error: null,
    } as never)
    await GET()
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentId: "dept-web" } }),
    )
  })
})
