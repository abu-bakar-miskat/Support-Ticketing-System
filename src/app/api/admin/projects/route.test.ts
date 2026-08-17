import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "./route"
import { DELETE } from "./[id]/route"

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
    project: { create: vi.fn(), delete: vi.fn() },
    ticket: { count: vi.fn() },
  },
}))

import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"

const mockGetProfile = vi.mocked(getProfile)
const mockCreate = vi.mocked(prisma.project.create)
const mockDelete = vi.mocked(prisma.project.delete)
const mockTicketCount = vi.mocked(prisma.ticket.count)

function postRequest(body: unknown) {
  return new Request("http://localhost/api/admin/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProfile.mockResolvedValue(mockAdmin)
})

describe("POST /api/admin/projects", () => {
  it("returns 201 and auto-generates slug from name", async () => {
    const created = { id: "proj1", name: "My Project", slug: "my-project" }
    mockCreate.mockResolvedValue(created as never)

    const res = await POST(postRequest({ name: "My Project" }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.slug).toBe("my-project")
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "My Project", slug: "my-project" } })
    )
  })

  it("uses the provided slug when supplied", async () => {
    const created = { id: "proj2", name: "My Project", slug: "custom-slug" }
    mockCreate.mockResolvedValue(created as never)

    const res = await POST(postRequest({ name: "My Project", slug: "Custom-Slug" }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.slug).toBe("custom-slug")
  })

  it("returns 409 when slug is already taken", async () => {
    mockCreate.mockRejectedValue({ code: "P2002" })

    const res = await POST(postRequest({ name: "Duplicate" }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/slug already exists/i)
  })

  it("returns 400 when name is missing", async () => {
    const res = await POST(postRequest({}))
    expect(res.status).toBe(400)
  })
})

describe("DELETE /api/admin/projects/[id]", () => {
  it("returns 204 when project has no tickets", async () => {
    mockTicketCount.mockResolvedValue(0)
    mockDelete.mockResolvedValue({} as never)

    const res = await DELETE(
      new Request("http://localhost/api/admin/projects/proj1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "proj1" }) }
    )

    expect(res.status).toBe(204)
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "proj1" } })
  })

  it("returns 409 when project has existing tickets", async () => {
    mockTicketCount.mockResolvedValue(3)

    const res = await DELETE(
      new Request("http://localhost/api/admin/projects/proj1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "proj1" }) }
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/3 tickets/i)
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
