import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }))
vi.mock("@/lib/team-manage", () => ({ canManageTeam: vi.fn() }))
vi.mock("@/lib/dept-scope", () => ({ canReadTeamData: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    teamStatus: { findMany: vi.fn() },
    teamGitHubStatusMap: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

import { requireAuth } from "@/lib/auth"
import { canManageTeam } from "@/lib/team-manage"
import { canReadTeamData } from "@/lib/dept-scope"
import { prisma } from "@/lib/db"
import { GET, PUT } from "./route"

const mockAuth = vi.mocked(requireAuth)
const mockManage = vi.mocked(canManageTeam)
const mockRead = vi.mocked(canReadTeamData)
const mockStatuses = vi.mocked(prisma.teamStatus.findMany)
const mockFind = vi.mocked(prisma.teamGitHubStatusMap.findUnique)
const mockUpsert = vi.mocked(prisma.teamGitHubStatusMap.upsert)

const params = { params: Promise.resolve({ id: "team-1" }) }

function putRequest(body: unknown) {
  return new Request("http://localhost/api/teams/team-1/github-map", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const WEB_STATUSES = [
  { label: "To Do", order: 0, isComplete: false },
  { label: "In Progress", order: 1, isComplete: false },
  { label: "Pull Request", order: 2, isComplete: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ profile: { id: "u1" }, error: null } as never)
  mockManage.mockResolvedValue(true)
  mockRead.mockResolvedValue(true)
  mockStatuses.mockResolvedValue(WEB_STATUSES as never)
  mockFind.mockResolvedValue(null as never)
})

describe("GET /api/teams/[id]/github-map", () => {
  it("returns config and resolved defaults", async () => {
    const res = await GET(new Request("http://localhost"), params)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.config).toBeNull()
    expect(body.defaults).toEqual({
      prOpened: "In Progress",
      prReadyForReview: null,
      prMerged: "Pull Request",
    })
  })

  it("403s when the profile cannot read team data", async () => {
    mockRead.mockResolvedValue(false)
    const res = await GET(new Request("http://localhost"), params)
    expect(res.status).toBe(403)
  })
})

describe("PUT /api/teams/[id]/github-map", () => {
  it("upserts valid fields", async () => {
    mockUpsert.mockResolvedValue({ teamId: "team-1", onPrOpened: "Blocked" } as never)
    const res = await PUT(putRequest({ onPrOpened: "In Progress", onPrReadyForReview: "", onPrMerged: null }), params)
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { teamId: "team-1" },
      create: { teamId: "team-1", onPrOpened: "In Progress", onPrReadyForReview: "", onPrMerged: null },
      update: { onPrOpened: "In Progress", onPrReadyForReview: "", onPrMerged: null },
    })
  })

  it("rejects a label the team does not have", async () => {
    const res = await PUT(putRequest({ onPrOpened: "Ghost" }), params)
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it("403s when the profile cannot manage the team", async () => {
    mockManage.mockResolvedValue(false)
    const res = await PUT(putRequest({ onPrOpened: "" }), params)
    expect(res.status).toBe(403)
  })
})

describe("PUT body validation", () => {
  it("400s on a JSON primitive body instead of throwing", async () => {
    const res = await PUT(putRequest("just-a-string"), params)
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
