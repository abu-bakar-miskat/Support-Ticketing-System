import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "./route"

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

vi.mock("@/lib/profile", () => ({ getProfile: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn() },
    comment: { findUnique: vi.fn() },
    attachment: { create: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

const mockGetProfile = vi.mocked(getProfile)
const mockTicketFindUnique = vi.mocked(prisma.ticket.findUnique)
const mockCommentFindUnique = vi.mocked(prisma.comment.findUnique)
const mockAttachmentCreate = vi.mocked(prisma.attachment.create)
const mockActivityLogCreate = vi.mocked(prisma.activityLog.create)
const mockCreateClient = vi.mocked(createClient)

const mockPublicUrl = "https://example.supabase.co/storage/v1/object/public/attachments/ticket-1/123-test.txt"
const mockStorageClient = {
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: "ticket-1/123-test.txt" }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: mockPublicUrl } }),
    }),
  },
}

function makeRequest(fields: Record<string, string | File>) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value)
  }
  return new Request("http://localhost/api/attachments", {
    method: "POST",
    body: formData,
  }) as never
}

function makeFile(name = "test.txt", content = "hello", type = "text/plain") {
  return new File([content], name, { type })
}

const accessibleTicket = {
  id: "ticket-1",
  subDepartmentId: "team-abc",
  assigneeId: null,
  creatorId: "00000000-0000-0000-0000-000000000009",
  deletedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProfile.mockResolvedValue(mockProfile as never)
  mockTicketFindUnique.mockResolvedValue(accessibleTicket as never)
  mockCommentFindUnique.mockResolvedValue({ ticketId: "ticket-1" } as never)
  mockCreateClient.mockResolvedValue(mockStorageClient as never)
  mockActivityLogCreate.mockResolvedValue({} as never)
})

describe("POST /api/attachments", () => {
  it("returns 201 with storageUrl on valid upload", async () => {
    const created = {
      id: "attachment-1",
      ticketId: "ticket-1",
      commentId: null,
      fileName: "test.txt",
      fileSize: 5,
      storageUrl: mockPublicUrl,
      createdAt: new Date(),
    }
    mockAttachmentCreate.mockResolvedValue(created as never)

    const res = await POST(makeRequest({ file: makeFile(), ticketId: "ticket-1" }))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.storageUrl).toBe(mockPublicUrl)
    expect(mockAttachmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: "ticket-1",
          fileName: "test.txt",
          uploaderProfileId: mockProfile.id,
          commentId: null,
        }),
      }),
    )
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ATTACHMENT_ADDED",
          metadata: expect.objectContaining({ fileName: "test.txt" }),
        }),
      }),
    )
  })

  it("returns 400 when ticketId is missing", async () => {
    const res = await POST(makeRequest({ file: makeFile() }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/ticketId/i)
  })

  it("returns 400 when file is missing", async () => {
    const res = await POST(makeRequest({ ticketId: "ticket-1" }))
    expect(res.status).toBe(400)
  })

  it("returns 401 when unauthenticated", async () => {
    mockGetProfile.mockResolvedValue(null)
    const res = await POST(makeRequest({ file: makeFile(), ticketId: "ticket-1" }))
    expect(res.status).toBe(401)
  })

  it("stores commentId when provided", async () => {
    mockAttachmentCreate.mockResolvedValue({ id: "a1", storageUrl: mockPublicUrl } as never)
    await POST(makeRequest({ file: makeFile(), ticketId: "ticket-1", commentId: "comment-1" }))
    expect(mockAttachmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ commentId: "comment-1" }),
      }),
    )
  })

  it("returns 403 when caller cannot access the ticket (IDOR guard)", async () => {
    mockGetProfile.mockResolvedValue({ ...mockProfile, subDepartmentId: "other-team" } as never)
    const res = await POST(makeRequest({ file: makeFile(), ticketId: "ticket-1" }))
    expect(res.status).toBe(403)
    expect(mockAttachmentCreate).not.toHaveBeenCalled()
  })

  it("returns 400 when commentId belongs to a different ticket", async () => {
    mockCommentFindUnique.mockResolvedValue({ ticketId: "other-ticket" } as never)
    const res = await POST(
      makeRequest({ file: makeFile(), ticketId: "ticket-1", commentId: "comment-1" }),
    )
    expect(res.status).toBe(400)
    expect(mockAttachmentCreate).not.toHaveBeenCalled()
  })

  it("returns 415 when file type is not supported", async () => {
    const res = await POST(makeRequest({ file: makeFile("bad.bin", "data", "application/octet-stream"), ticketId: "ticket-1" }))
    expect(res.status).toBe(415)
    expect(mockAttachmentCreate).not.toHaveBeenCalled()
  })

  it("returns 413 when file exceeds the size limit", async () => {
    const big = new File([new Uint8Array(50 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" })
    const res = await POST(makeRequest({ file: big, ticketId: "ticket-1" }))
    expect(res.status).toBe(413)
    expect(mockAttachmentCreate).not.toHaveBeenCalled()
  })

  it("uploads PDF and DOCX with resolved content-type", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "ticket-1/123-report.pdf" }, error: null })
    mockCreateClient.mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload,
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: mockPublicUrl } }),
        }),
      },
    } as never)
    mockAttachmentCreate.mockResolvedValue({ id: "a1", storageUrl: mockPublicUrl } as never)

    const pdf = makeFile("report.pdf", "pdf", "application/pdf")
    await POST(makeRequest({ file: pdf, ticketId: "ticket-1", commentId: "comment-1" }))
    expect(upload).toHaveBeenCalledWith(
      expect.stringContaining("report.pdf"),
      pdf,
      expect.objectContaining({ contentType: "application/pdf" }),
    )

    const docx = makeFile("notes.docx", "docx", "")
    await POST(makeRequest({ file: docx, ticketId: "ticket-1", commentId: "comment-1" }))
    expect(upload).toHaveBeenCalledWith(
      expect.stringContaining("notes.docx"),
      docx,
      expect.objectContaining({
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    )
  })

  it("returns 409 when ticket is soft-deleted", async () => {
    mockTicketFindUnique.mockResolvedValue({ ...accessibleTicket, deletedAt: new Date() } as never)
    const res = await POST(makeRequest({ file: makeFile(), ticketId: "ticket-1" }))
    expect(res.status).toBe(409)
    expect(mockAttachmentCreate).not.toHaveBeenCalled()
  })
})
