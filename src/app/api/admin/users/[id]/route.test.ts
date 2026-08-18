import { describe, it, expect, vi, beforeEach } from "vitest"
import { PATCH } from "./route"

const mockAdmin = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@pen.com",
  name: "Admin",
  avatarUrl: null,
  role: "admin" as const,
  subDepartmentId: null,
  subDepartmentIds: [], memberships: [], timezone: null, notificationPrefs: null,
  createdAt: new Date(),
}

vi.mock("@/lib/profile", () => ({ getProfile: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: { profile: { update: vi.fn() } },
}))

import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"

const mockGetProfile = vi.mocked(getProfile)
const mockUpdate = vi.mocked(prisma.profile.update)

function makeRequest(id: string, body: unknown) {
  return {
    request: new Request(`http://localhost/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ id }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProfile.mockResolvedValue(mockAdmin)
})

describe("PATCH /api/admin/users/[id]", () => {
  it("returns 200 with updated profile on role change", async () => {
    const targetId = "00000000-0000-0000-0000-000000000002"
    const updated = { ...mockAdmin, id: targetId, role: "developer" as const }
    mockUpdate.mockResolvedValue(updated as never)

    const { request, params } = makeRequest(targetId, { role: "developer" })
    const res = await PATCH(request, { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.role).toBe("developer")
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: targetId }, data: { role: "developer" } })
    )
  })

  it("returns 200 when assigning a team", async () => {
    const targetId = "00000000-0000-0000-0000-000000000002"
    mockUpdate.mockResolvedValue({ ...mockAdmin, id: targetId, subDepartmentId: "team1" } as never)

    const { request, params } = makeRequest(targetId, { subDepartmentId: "team1" })
    const res = await PATCH(request, { params })

    expect(res.status).toBe(200)
  })

  it("returns 400 for an invalid role value", async () => {
    const { request, params } = makeRequest("some-id", { role: "superuser" })
    const res = await PATCH(request, { params })

    expect(res.status).toBe(400)
  })

  it("returns 400 when body has no recognised fields", async () => {
    const { request, params } = makeRequest("some-id", { unknown: true })
    const res = await PATCH(request, { params })

    expect(res.status).toBe(400)
  })

  it("returns 403 when caller is not admin", async () => {
    mockGetProfile.mockResolvedValue({ ...mockAdmin, role: "developer" })

    const { request, params } = makeRequest("some-id", { role: "admin" })
    const res = await PATCH(request, { params })

    expect(res.status).toBe(403)
  })
})
