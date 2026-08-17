import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHmac } from "node:crypto"

vi.mock("@/lib/db", () => ({
  prisma: {
    ticketPullRequest: { findMany: vi.fn() },
    gitHubCommit: { createMany: vi.fn() },
  },
}))
vi.mock("@/lib/github/upsert-pr", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  upsertAndLinkPullRequest: vi.fn(),
}))
vi.mock("@/lib/github/advance-status", () => ({ advanceTicketStatus: vi.fn() }))
vi.mock("@/lib/github/resolve-refs", () => ({ resolveTicketIds: vi.fn() }))

import { prisma } from "@/lib/db"
import { upsertAndLinkPullRequest } from "@/lib/github/upsert-pr"
import { advanceTicketStatus } from "@/lib/github/advance-status"
import { POST } from "./route"

const mockLinkFindMany = vi.mocked(prisma.ticketPullRequest.findMany)
const mockUpsertPr = vi.mocked(upsertAndLinkPullRequest)
const mockAdvance = vi.mocked(advanceTicketStatus)

const SECRET = "test-secret"
const REPO = "PlanetEducationNetworks/PEN-Ticketing-System"

function signedRequest(event: string, payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload)
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex")
  return new Request("http://localhost/api/webhooks/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": sig,
      "x-github-event": event,
    },
    body,
  })
}

function prPayload(action: string, pr: Partial<Record<string, unknown>> = {}) {
  return {
    action,
    repository: { full_name: REPO },
    pull_request: {
      number: 7,
      title: "[DEV-42] Fix login",
      html_url: "https://github.com/org/repo/pull/7",
      body: null,
      draft: false,
      state: "open",
      merged_at: null,
      head: { ref: "fix/dev-42-login" },
      base: { ref: "main" },
      user: { login: "dev" },
      ...pr,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.GITHUB_WEBHOOK_SECRET = SECRET
  process.env.GITHUB_REPO = REPO
  mockUpsertPr.mockResolvedValue({ prId: "pr-row-1", ticketIds: ["ticket-1"] })
  mockLinkFindMany.mockResolvedValue([{ ticketId: "ticket-1" }] as never)
  mockAdvance.mockResolvedValue(undefined)
})

describe("POST /api/webhooks/github", () => {
  it("returns 503 when the webhook secret is not configured", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET
    const res = await POST(signedRequest("pull_request", prPayload("opened")))
    expect(res.status).toBe(503)
  })

  it("rejects an invalid signature with 401", async () => {
    const res = await POST(signedRequest("pull_request", prPayload("opened"), "wrong-secret"))
    expect(res.status).toBe(401)
    expect(mockUpsertPr).not.toHaveBeenCalled()
  })

  it("ignores payloads from a different repository", async () => {
    const payload = { ...prPayload("opened"), repository: { full_name: "other/repo" } }
    const res = await POST(signedRequest("pull_request", payload))
    expect(res.status).toBe(200)
    expect(mockUpsertPr).not.toHaveBeenCalled()
  })

  it("processes events from any repo in a comma-separated GITHUB_REPO list", async () => {
    process.env.GITHUB_REPO = `${REPO}, PlanetEducationNetworks/VCAD`
    const payload = {
      ...prPayload("opened"),
      repository: { full_name: "PlanetEducationNetworks/VCAD" },
    }
    const res = await POST(signedRequest("pull_request", payload))
    expect(res.status).toBe(200)
    expect(mockUpsertPr).toHaveBeenCalled()
  })

  it("ignores repos outside a comma-separated GITHUB_REPO list", async () => {
    process.env.GITHUB_REPO = `${REPO},PlanetEducationNetworks/VCAD`
    const payload = { ...prPayload("opened"), repository: { full_name: "other/repo" } }
    const res = await POST(signedRequest("pull_request", payload))
    expect(res.status).toBe(200)
    expect(mockUpsertPr).not.toHaveBeenCalled()
  })

  it("accepts any repo under an owner wildcard like org/*", async () => {
    process.env.GITHUB_REPO = "PlanetEducationNetworks/*"
    const payload = {
      ...prPayload("opened"),
      repository: { full_name: "PlanetEducationNetworks/some-future-repo" },
    }
    const res = await POST(signedRequest("pull_request", payload))
    expect(res.status).toBe(200)
    expect(mockUpsertPr).toHaveBeenCalled()
  })

  it("ignores other owners when GITHUB_REPO is an owner wildcard", async () => {
    process.env.GITHUB_REPO = "PlanetEducationNetworks/*"
    const payload = { ...prPayload("opened"), repository: { full_name: "evil-org/repo" } }
    const res = await POST(signedRequest("pull_request", payload))
    expect(res.status).toBe(200)
    expect(mockUpsertPr).not.toHaveBeenCalled()
  })

  it("ignores unhandled event types with 200", async () => {
    const res = await POST(signedRequest("issues", { repository: { full_name: REPO } }))
    expect(res.status).toBe(200)
    expect(mockUpsertPr).not.toHaveBeenCalled()
  })

  it("links and advances to In Progress on opened", async () => {
    const res = await POST(signedRequest("pull_request", prPayload("opened")))
    expect(res.status).toBe(200)
    expect(mockUpsertPr).toHaveBeenCalledWith(
      expect.objectContaining({ number: 7 }),
      REPO,
    )
    expect(mockAdvance).toHaveBeenCalledWith("ticket-1", "prOpened", "main")
  })

  it("does not advance status for a draft PR opened", async () => {
    await POST(signedRequest("pull_request", prPayload("opened", { draft: true })))
    expect(mockUpsertPr).toHaveBeenCalled()
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it("advances to In Review on ready_for_review", async () => {
    await POST(signedRequest("pull_request", prPayload("ready_for_review")))
    expect(mockAdvance).toHaveBeenCalledWith("ticket-1", "prReadyForReview", "main")
  })

  it("advances to Live on merge into main", async () => {
    await POST(
      signedRequest(
        "pull_request",
        prPayload("closed", { state: "closed", merged_at: "2026-07-06T12:00:00Z", base: { ref: "main" } }),
      ),
    )
    expect(mockAdvance).toHaveBeenCalledWith("ticket-1", "prMerged", "main")
  })

  it("advances to Live on merge into master or modifications", async () => {
    await POST(
      signedRequest(
        "pull_request",
        prPayload("closed", {
          state: "closed",
          merged_at: "2026-07-06T12:00:00Z",
          base: { ref: "Master" },
        }),
      ),
    )
    expect(mockAdvance).toHaveBeenCalledWith("ticket-1", "prMerged", "Master")

    mockAdvance.mockClear()
    await POST(
      signedRequest(
        "pull_request",
        prPayload("closed", {
          state: "closed",
          merged_at: "2026-07-06T12:00:00Z",
          base: { ref: "modifications" },
        }),
      ),
    )
    expect(mockAdvance).toHaveBeenCalledWith("ticket-1", "prMerged", "modifications")
  })

  it("advances to In Review on merge into a dev-prefixed branch", async () => {
    await POST(
      signedRequest(
        "pull_request",
        prPayload("closed", {
          state: "closed",
          merged_at: "2026-07-06T12:00:00Z",
          base: { ref: "develop" },
        }),
      ),
    )
    expect(mockAdvance).toHaveBeenCalledWith("ticket-1", "prMergedToDev", "develop")
  })

  it("does not advance status when merged into an unrelated branch", async () => {
    await POST(
      signedRequest(
        "pull_request",
        prPayload("closed", {
          state: "closed",
          merged_at: "2026-07-06T12:00:00Z",
          base: { ref: "staging" },
        }),
      ),
    )
    expect(mockUpsertPr).toHaveBeenCalled()
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it("does not advance on unmerged close", async () => {
    await POST(signedRequest("pull_request", prPayload("closed", { state: "closed" })))
    expect(mockUpsertPr).toHaveBeenCalled()
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it("advances every ticket linked to the PR, and survives per-ticket failures", async () => {
    mockLinkFindMany.mockResolvedValue([
      { ticketId: "ticket-1" },
      { ticketId: "ticket-2" },
    ] as never)
    mockAdvance.mockRejectedValueOnce(new Error("boom"))
    const res = await POST(signedRequest("pull_request", prPayload("opened")))
    expect(res.status).toBe(200)
    expect(mockAdvance).toHaveBeenCalledTimes(2)
  })

  it("links commits whose messages reference tickets on push", async () => {
    const { resolveTicketIds } = await import("@/lib/github/resolve-refs")
    vi.mocked(resolveTicketIds).mockResolvedValue(["ticket-1"])
    const mockCommitCreateMany = vi.mocked(prisma.gitHubCommit.createMany)
    mockCommitCreateMany.mockResolvedValue({ count: 1 } as never)

    const res = await POST(
      signedRequest("push", {
        repository: { full_name: REPO },
        commits: [
          {
            id: "abc123def456",
            message: "DEV-42: fix login redirect",
            url: "https://github.com/org/repo/commit/abc123def456",
            author: { username: "dev" },
          },
          {
            id: "no-ref-sha",
            message: "chore: bump deps",
            url: "https://github.com/org/repo/commit/no-ref-sha",
            author: { username: "dev" },
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    expect(mockCommitCreateMany).toHaveBeenCalledTimes(1)
    expect(mockCommitCreateMany).toHaveBeenCalledWith({
      data: [
        {
          sha: "abc123def456",
          message: "DEV-42: fix login redirect",
          url: "https://github.com/org/repo/commit/abc123def456",
          authorLogin: "dev",
          ticketId: "ticket-1",
        },
      ],
      skipDuplicates: true,
    })
  })

  it("handles a push with no commits array", async () => {
    const res = await POST(signedRequest("push", { repository: { full_name: REPO } }))
    expect(res.status).toBe(200)
  })
})
