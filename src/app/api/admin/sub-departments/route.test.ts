import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "./route"

const mockAdmin = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@pen.com",
  name: "Admin",
  avatarUrl: null,
  role: "admin" as const,
  teamId: null,
  teamIds: [], memberships: [], timezone: null, notificationPrefs: null,
  createdAt: new Date(),
}

vi.mock("@/lib/profile", () => ({ getProfile: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    team: { create: vi.fn() },
    project: { create: vi.fn() },
    department: { findUnique: vi.fn() },
  },
}))

import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"

const mockGetProfile = vi.mocked(getProfile)
const mockCreate = vi.mocked(prisma.team.create)
const mockProjectCreate = vi.mocked(prisma.project.create)
const mockDepartmentFindUnique = vi.mocked(prisma.department.findUnique)

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProfile.mockResolvedValue(mockAdmin)
  mockProjectCreate.mockResolvedValue({ id: "project1" } as never)
  mockDepartmentFindUnique.mockResolvedValue({ tenantId: "tenant-1" } as never)
})

describe("POST /api/admin/teams", () => {
  it("returns 201 with the created team on valid input", async () => {
    const created = { id: "team1", name: "Frontend", prefix: "FE", departmentId: "dept1" }
    mockCreate.mockResolvedValue(created as never)

    const res = await POST(makeRequest({ name: "Frontend", prefix: "fe", departmentId: "dept1" }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.prefix).toBe("FE")
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ prefix: "FE" }) })
    )
    expect(mockProjectCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Frontend",
        teamId: "team1",
        departmentId: "dept1",
      }),
    })
    expect(mockProjectCreate.mock.calls[0][0].data).not.toHaveProperty("members")
  })

  it("returns 409 when prefix is already taken", async () => {
    mockCreate.mockRejectedValue({ code: "P2002" })

    const res = await POST(makeRequest({ name: "Backend", prefix: "BE", departmentId: "dept1" }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/prefix already exists/i)
  })

  it("returns 400 when prefix is too short", async () => {
    const res = await POST(makeRequest({ name: "Ops", prefix: "O", departmentId: "dept1" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest({ name: "Ops" }))
    expect(res.status).toBe(400)
  })

  it("returns 403 when caller is not admin", async () => {
    mockGetProfile.mockResolvedValue({ ...mockAdmin, role: "developer" })

    const res = await POST(makeRequest({ name: "Ops", prefix: "OPS", departmentId: "dept1" }))
    expect(res.status).toBe(403)
  })
})
