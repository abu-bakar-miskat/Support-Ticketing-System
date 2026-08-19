import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }))

import { requireAuth } from "@/lib/auth"
import { GET } from "./route"

const mockRequireAuth = vi.mocked(requireAuth)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/session/status — SA-03 poll fallback", () => {
  it("returns ok when the session is still valid", async () => {
    mockRequireAuth.mockResolvedValue({ profile: { id: "u1" }, error: null } as never)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it("returns 401 once getProfile denies (restricted user or suspended/deleted tenant)", async () => {
    mockRequireAuth.mockResolvedValue({
      profile: null,
      error: new Response(null, { status: 401 }) as never,
    } as never)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
  })
})
