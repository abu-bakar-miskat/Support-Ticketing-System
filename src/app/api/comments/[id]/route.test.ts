import { describe, it, expect, vi, beforeEach } from "vitest"
import { PATCH, DELETE } from "./route"

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

const otherProfileId = "00000000-0000-0000-0000-000000000002"

vi.mock("@/lib/profile", () => ({ getProfile: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    comment: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("@/lib/mentions", () => ({ processMentions: vi.fn().mockResolvedValue(undefined) }))

import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"

const mockGetProfile = vi.mocked(getProfile)
const mockFindUnique = vi.mocked(prisma.comment.findUnique)
const mockUpdate = vi.mocked(prisma.comment.update)

const mockParams = Promise.resolve({ id: "comment-1" })

const mockComment = {
  id: "comment-1",
  authorId: mockProfile.id,
  deletedAt: null,
  ticketId: "ticket-1",
  ticket: { title: "Fix login" },
  mentions: [],
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/comments/comment-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never
}

function deleteRequest() {
  return new Request("http://localhost/api/comments/comment-1", {
    method: "DELETE",
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProfile.mockResolvedValue(mockProfile)
})

describe("PATCH /api/comments/[id]", () => {
  it("returns 200 with updated comment when author edits", async () => {
    mockFindUnique.mockResolvedValue(mockComment as never)
    mockUpdate.mockResolvedValue({
      id: "comment-1",
      body: "Updated body",
      editedAt: new Date(),
    } as never)

    const res = await PATCH(patchRequest({ body: "Updated body" }), { params: mockParams })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.body).toBe("Updated body")
  })

  it("returns 403 when a non-author attempts to edit", async () => {
    mockFindUnique.mockResolvedValue({ ...mockComment, authorId: otherProfileId } as never)

    const res = await PATCH(patchRequest({ body: "Sneaky edit" }), { params: mockParams })
    expect(res.status).toBe(403)
  })

  it("returns 400 when body is empty", async () => {
    mockFindUnique.mockResolvedValue(mockComment as never)

    const res = await PATCH(patchRequest({ body: "" }), { params: mockParams })
    expect(res.status).toBe(400)
  })

  it("returns 401 when unauthenticated", async () => {
    mockGetProfile.mockResolvedValue(null)
    const res = await PATCH(patchRequest({ body: "hi" }), { params: mockParams })
    expect(res.status).toBe(401)
  })
})

describe("DELETE /api/comments/[id]", () => {
  it("returns 200 and soft-deletes the comment", async () => {
    mockFindUnique.mockResolvedValue({
      id: "comment-1",
      authorId: mockProfile.id,
    } as never)
    mockUpdate.mockResolvedValue({} as never)

    const res = await DELETE(deleteRequest(), { params: mockParams })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "comment-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    )
  })

  it("returns 403 when a non-author attempts to delete", async () => {
    mockFindUnique.mockResolvedValue({
      id: "comment-1",
      authorId: otherProfileId,
    } as never)

    const res = await DELETE(deleteRequest(), { params: mockParams })
    expect(res.status).toBe(403)
  })
})
