import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST, DELETE } from "./route"

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
    recruitmentCandidate: { findFirst: vi.fn() },
  },
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { requireAdminOrManager } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

const mockRequire = vi.mocked(requireAdminOrManager)
const mockBoardFindFirst = vi.mocked(prisma.recruitmentBoard.findFirst)
const mockCandidateFindFirst = vi.mocked(prisma.recruitmentCandidate.findFirst)
const mockCreateClient = vi.mocked(createClient)

const mockPublicUrl =
  "https://example.supabase.co/storage/v1/object/public/attachments/recruitment/board-1/cand-1/123-cv.pdf"
const mockUpload = vi.fn()
const mockRemove = vi.fn()
const mockStorageClient = {
  storage: {
    from: vi.fn().mockReturnValue({
      upload: mockUpload,
      remove: mockRemove,
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: mockPublicUrl } }),
    }),
  },
}

const params = Promise.resolve({ id: "board-1" })

function makePost(fields: Record<string, string | File>) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) formData.append(key, value)
  return new Request("http://localhost/api/recruitment/boards/board-1/upload", {
    method: "POST",
    body: formData,
  }) as never
}

function makeDelete(body: unknown) {
  return new Request("http://localhost/api/recruitment/boards/board-1/upload", {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }) as never
}

function makePdf(name = "cv.pdf", bytes = 100) {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequire.mockResolvedValue({ profile: { id: "u1", role: "admin" }, isAdmin: true, error: null } as never)
  mockBoardFindFirst.mockResolvedValue({ id: "board-1" } as never)
  mockCandidateFindFirst.mockResolvedValue({ id: "cand-1" } as never)
  mockCreateClient.mockResolvedValue(mockStorageClient as never)
  mockUpload.mockResolvedValue({ data: { path: "recruitment/board-1/cand-1/123-cv.pdf" }, error: null })
  mockRemove.mockResolvedValue({ data: null, error: null })
})

describe("POST /api/recruitment/boards/[id]/upload", () => {
  it("uploads a pdf and returns url, path, name, size", async () => {
    const res = await POST(makePost({ file: makePdf(), candidateId: "cand-1" }), { params })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json).toEqual({
      url: mockPublicUrl,
      path: "recruitment/board-1/cand-1/123-cv.pdf",
      name: "cv.pdf",
      size: 100,
    })
    const [path] = mockUpload.mock.calls[0]
    expect(path).toMatch(/^recruitment\/board-1\/cand-1\/\d+-cv\.pdf$/)
  })

  it("400s without a file or candidateId", async () => {
    expect((await POST(makePost({ candidateId: "cand-1" }), { params })).status).toBe(400)
    expect((await POST(makePost({ file: makePdf() }), { params })).status).toBe(400)
  })

  it("404s when the candidate is not on this board", async () => {
    mockCandidateFindFirst.mockResolvedValue(null)
    const res = await POST(makePost({ file: makePdf(), candidateId: "ghost" }), { params })
    expect(res.status).toBe(404)
  })

  it("415s on disallowed file types", async () => {
    const exe = new File([new Uint8Array(10)], "virus.exe", { type: "application/x-msdownload" })
    const res = await POST(makePost({ file: exe, candidateId: "cand-1" }), { params })
    expect(res.status).toBe(415)
  })

  it("413s past the 10MB cap", async () => {
    const big = makePdf("big.pdf", 10 * 1024 * 1024 + 1)
    const res = await POST(makePost({ file: big, candidateId: "cand-1" }), { params })
    expect(res.status).toBe(413)
  })

  it("propagates auth errors", async () => {
    const forbidden = new Response("no", { status: 403 })
    mockRequire.mockResolvedValue({ profile: null, isAdmin: false, error: forbidden } as never)
    const res = await POST(makePost({ file: makePdf(), candidateId: "cand-1" }), { params })
    expect(res.status).toBe(403)
  })
})

describe("DELETE /api/recruitment/boards/[id]/upload", () => {
  it("removes a file under this board's prefix", async () => {
    const res = await DELETE(makeDelete({ path: "recruitment/board-1/cand-1/123-cv.pdf" }), { params })
    expect(res.status).toBe(200)
    expect(mockRemove).toHaveBeenCalledWith(["recruitment/board-1/cand-1/123-cv.pdf"])
  })

  it("rejects paths outside this board's prefix", async () => {
    expect((await DELETE(makeDelete({ path: "recruitment/other-board/c/f.pdf" }), { params })).status).toBe(400)
    expect((await DELETE(makeDelete({ path: "recruitment/board-1/../x/f.pdf" }), { params })).status).toBe(400)
    expect((await DELETE(makeDelete({}), { params })).status).toBe(400)
    expect(mockRemove).not.toHaveBeenCalled()
  })
})
