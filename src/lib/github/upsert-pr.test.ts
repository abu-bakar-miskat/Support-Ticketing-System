import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    gitHubPullRequest: { upsert: vi.fn() },
    ticketPullRequest: { createMany: vi.fn() },
  },
}))
vi.mock("./resolve-refs", () => ({ resolveTicketIds: vi.fn() }))

import { prisma } from "@/lib/db"
import { resolveTicketIds } from "./resolve-refs"
import { prState, upsertAndLinkPullRequest, type GitHubApiPullRequest } from "./upsert-pr"

const mockUpsert = vi.mocked(prisma.gitHubPullRequest.upsert)
const mockCreateMany = vi.mocked(prisma.ticketPullRequest.createMany)
const mockResolve = vi.mocked(resolveTicketIds)

const basePr: GitHubApiPullRequest = {
  number: 7,
  title: "[DEV-42] Fix login",
  html_url: "https://github.com/org/repo/pull/7",
  body: "Closes DEV-42",
  draft: false,
  state: "open",
  merged_at: null,
  created_at: "2026-07-05T09:00:00Z",
  head: { ref: "fix/dev-42-login" },
  base: { ref: "main" },
  user: { login: "nurmohammod-web" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpsert.mockResolvedValue({ id: "pr-row-1" } as never)
  mockResolve.mockResolvedValue(["ticket-1"])
  mockCreateMany.mockResolvedValue({ count: 1 } as never)
})

describe("prState", () => {
  it("maps merged, closed, draft, and open", () => {
    expect(prState({ ...basePr, merged_at: "2026-07-06T00:00:00Z", state: "closed" })).toBe("merged")
    expect(prState({ ...basePr, state: "closed" })).toBe("closed")
    expect(prState({ ...basePr, draft: true })).toBe("draft")
    expect(prState(basePr)).toBe("open")
  })
})

describe("upsertAndLinkPullRequest", () => {
  it("upserts by repository + PR number and links resolved tickets", async () => {
    const result = await upsertAndLinkPullRequest(basePr)

    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        repository_number: {
          repository: "org/repo",
          number: 7,
        },
      },
      create: expect.objectContaining({
        repository: "org/repo",
        number: 7,
        title: "[DEV-42] Fix login",
        branch: "fix/dev-42-login",
        baseBranch: "main",
        authorLogin: "nurmohammod-web",
        state: "open",
        mergedAt: null,
        ghCreatedAt: new Date("2026-07-05T09:00:00Z"),
      }),
      update: expect.objectContaining({ title: "[DEV-42] Fix login", state: "open" }),
    })
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [{ ticketId: "ticket-1", prId: "pr-row-1" }],
      skipDuplicates: true,
    })
    expect(result).toEqual({ prId: "pr-row-1", ticketIds: ["ticket-1"] })
  })

  it("prefers an explicit repository over html_url", async () => {
    await upsertAndLinkPullRequest(basePr, "PlanetEducationNetworks/other-repo")
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          repository_number: {
            repository: "PlanetEducationNetworks/other-repo",
            number: 7,
          },
        },
        create: expect.objectContaining({
          repository: "PlanetEducationNetworks/other-repo",
        }),
      }),
    )
  })

  it("skips link creation when no tickets resolve", async () => {
    mockResolve.mockResolvedValue([])
    const result = await upsertAndLinkPullRequest(basePr)
    expect(mockCreateMany).not.toHaveBeenCalled()
    expect(result.ticketIds).toEqual([])
  })

  it("stores mergedAt as a Date when merged", async () => {
    await upsertAndLinkPullRequest({
      ...basePr,
      state: "closed",
      merged_at: "2026-07-06T12:00:00Z",
    })
    const arg = mockUpsert.mock.calls[0][0]
    expect(arg.update.state).toBe("merged")
    expect(arg.update.mergedAt).toEqual(new Date("2026-07-06T12:00:00Z"))
  })
})
