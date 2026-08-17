import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "./route"

const mockProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "dev@pen.com",
  name: "Dev User",
  avatarUrl: null,
  role: "developer" as const,
  teamId: "team-abc",
  teamIds: ["team-abc"], memberships: [], timezone: null, notificationPrefs: null,
  createdAt: new Date(),
}

vi.mock("@/lib/profile", () => ({ getProfile: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn() },
    comment: { create: vi.fn() },
    attachment: { findMany: vi.fn(), updateMany: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}))
vi.mock("@/lib/mentions", () => ({ processMentions: vi.fn().mockResolvedValue(undefined) }))

import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { processMentions } from "@/lib/mentions"

const mockGetProfile = vi.mocked(getProfile)
const mockTicketFindUnique = vi.mocked(prisma.ticket.findUnique)
const mockCommentCreate = vi.mocked(prisma.comment.create)
const mockAttachmentFindMany = vi.mocked(prisma.attachment.findMany)
const mockAttachmentUpdateMany = vi.mocked(prisma.attachment.updateMany)
const mockActivityLogCreate = vi.mocked(prisma.activityLog.create)
const mockProcessMentions = vi.mocked(processMentions)

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/tickets/ticket-1/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never
}

const mockParams = Promise.resolve({ id: "ticket-1" })

const accessibleTicket = {
  id: "ticket-1",
  title: "Fix login",
  teamId: "team-abc",
  assigneeId: null,
  creatorId: "00000000-0000-0000-0000-000000000009",
  deletedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProfile.mockResolvedValue(mockProfile)
  mockTicketFindUnique.mockResolvedValue(accessibleTicket as never)
  mockActivityLogCreate.mockResolvedValue({} as never)
  mockAttachmentFindMany.mockResolvedValue([] as never)
  mockAttachmentUpdateMany.mockResolvedValue({ count: 0 } as never)
})

describe("POST /api/tickets/[id]/comments", () => {
  it("returns 201 with the created comment on valid input", async () => {
    const createdComment = {
      id: "comment-1",
      body: "Looks good",
      ticketId: "ticket-1",
      authorId: mockProfile.id,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date(),
      author: { id: mockProfile.id, name: "Dev User", avatarUrl: null },
    }
    mockCommentCreate.mockResolvedValue(createdComment as never)

    const res = await POST(makeRequest({ body: "Looks good" }), { params: mockParams })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.id).toBe("comment-1")
    expect(mockCommentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: "Looks good",
          authorId: mockProfile.id,
          ticketId: "ticket-1",
        }),
      }),
    )
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "COMMENT_ADDED" }),
      }),
    )
  })

  it("calls processMentions after creating a comment", async () => {
    mockCommentCreate.mockResolvedValue({
      id: "comment-1",
      body: "Hey @Sara check this",
      author: { id: mockProfile.id, name: "Dev User", avatarUrl: null },
    } as never)

    await POST(makeRequest({ body: "Hey @Sara check this" }), { params: mockParams })

    expect(mockProcessMentions).toHaveBeenCalledWith(
      expect.objectContaining({
        commentId: "comment-1",
        ticketId: "ticket-1",
        body: "Hey @Sara check this",
        ticketTitle: "Fix login",
      }),
    )
  })

  it("returns 400 when body is empty string", async () => {
    const res = await POST(makeRequest({ body: "" }), { params: mockParams })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/required/i)
  })

  it("returns 400 when body is whitespace only", async () => {
    const res = await POST(makeRequest({ body: "   " }), { params: mockParams })
    expect(res.status).toBe(400)
  })

  it("returns 401 when unauthenticated", async () => {
    mockGetProfile.mockResolvedValue(null)
    const res = await POST(makeRequest({ body: "hi" }), { params: mockParams })
    expect(res.status).toBe(401)
  })

  it("returns 403 when caller cannot view the ticket (IDOR guard)", async () => {
    mockGetProfile.mockResolvedValue({ ...mockProfile, teamId: "other-team" })
    const res = await POST(makeRequest({ body: "hi" }), { params: mockParams })
    expect(res.status).toBe(403)
    expect(mockCommentCreate).not.toHaveBeenCalled()
  })

  it("links temporary attachments when attachments are provided", async () => {
    const pending = [
      {
        id: "att-1",
        storageUrl: "https://example.com/file.pdf",
        fileName: "file.pdf",
        fileSize: 100,
      },
    ]
    mockAttachmentFindMany.mockResolvedValue(pending as never)
    mockCommentCreate.mockResolvedValue({
      id: "comment-1",
      body: "",
      ticketId: "ticket-1",
      authorId: mockProfile.id,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date(),
      author: { id: mockProfile.id, name: "Dev User", avatarUrl: null },
    } as never)

    const res = await POST(
      makeRequest({ body: "", hasAttachment: true, attachments: ["att-1"] }),
      { params: mockParams },
    )
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.attachments).toEqual(pending)
    expect(mockAttachmentUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["att-1"] } },
      data: { ticketId: "ticket-1", commentId: "comment-1", status: "attached" },
    })
  })

  it("returns 400 when attachment ids are invalid", async () => {
    mockAttachmentFindMany.mockResolvedValue([] as never)

    const res = await POST(
      makeRequest({ body: "see attached", attachments: ["missing-id"] }),
      { params: mockParams },
    )

    expect(res.status).toBe(400)
    expect(mockCommentCreate).not.toHaveBeenCalled()
  })

  it("returns 409 when ticket is soft-deleted", async () => {
    mockTicketFindUnique.mockResolvedValue({ ...accessibleTicket, deletedAt: new Date() } as never)
    const res = await POST(makeRequest({ body: "hi" }), { params: mockParams })
    expect(res.status).toBe(409)
    expect(mockCommentCreate).not.toHaveBeenCalled()
  })
})
