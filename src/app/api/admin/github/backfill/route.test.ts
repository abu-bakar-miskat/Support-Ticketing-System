import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/github/upsert-pr", () => ({ upsertAndLinkPullRequest: vi.fn() }))

import { requireAdmin } from "@/lib/auth"
import { upsertAndLinkPullRequest } from "@/lib/github/upsert-pr"
import { POST } from "./route"

const mockRequireAdmin = vi.mocked(requireAdmin)
const mockUpsertPr = vi.mocked(upsertAndLinkPullRequest)

function apiPage(prs: Array<{ number: number }>) {
  return { ok: true, status: 200, json: async () => prs } as Response
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  process.env.GITHUB_TOKEN = "test-token"
  process.env.GITHUB_REPO = "PlanetEducationNetworks/PEN-Ticketing-System"
  mockRequireAdmin.mockResolvedValue({ profile: { id: "admin-1" }, error: null } as never)
  mockUpsertPr.mockResolvedValue({ prId: "pr-row", ticketIds: ["t1"] })
})

describe("POST /api/admin/github/backfill", () => {
  it("returns the auth error for non-admins", async () => {
    mockRequireAdmin.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as never)
    const res = await POST()
    expect(res.status).toBe(403)
  })

  it("returns 503 when GITHUB_TOKEN is missing", async () => {
    delete process.env.GITHUB_TOKEN
    const res = await POST()
    expect(res.status).toBe(503)
  })

  it("processes all open PRs from a single page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiPage([{ number: 1 }, { number: 2 }])))
    const res = await POST()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(mockUpsertPr).toHaveBeenCalledTimes(2)
    expect(mockUpsertPr).toHaveBeenCalledWith(
      expect.objectContaining({ number: 1 }),
      "PlanetEducationNetworks/PEN-Ticketing-System",
    )
    expect(body).toEqual({
      ok: true,
      processed: 2,
      linked: 2,
      repos: 1,
    })
  })

  it("pages through each concrete repo in a comma-separated list", async () => {
    process.env.GITHUB_REPO =
      "PlanetEducationNetworks/PEN-Ticketing-System, PlanetEducationNetworks/VCAD, PlanetEducationNetworks/*"
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(apiPage([{ number: 1 }]))
      .mockResolvedValueOnce(apiPage([{ number: 2 }]))
    vi.stubGlobal("fetch", fetchSpy)
    const res = await POST()
    const body = await res.json()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(mockUpsertPr).toHaveBeenCalledTimes(2)
    expect(body).toEqual({ ok: true, processed: 2, linked: 2, repos: 2 })
  })

  it("pages through results of exactly 100", async () => {
    const pageOf100 = Array.from({ length: 100 }, (_, i) => ({ number: i + 1 }))
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(apiPage(pageOf100))
      .mockResolvedValueOnce(apiPage([{ number: 101 }]))
    vi.stubGlobal("fetch", fetchSpy)
    const res = await POST()
    const body = await res.json()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(body.processed).toBe(101)
  })

  it("returns 502 when the GitHub API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response))
    const res = await POST()
    expect(res.status).toBe(502)
  })
})
