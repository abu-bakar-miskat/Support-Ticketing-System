import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: {
    recruitmentBoard: { findMany: vi.fn(), findFirst: vi.fn() },
    recruitmentField: { create: vi.fn(), update: vi.fn() },
    recruitmentCandidate: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"
import {
  resolveValuesByName,
  displayValues,
  addRecruitmentCandidate,
  deleteRecruitmentCandidate,
} from "./recruitment-tools"
import type { ApiKeyContext } from "@/lib/api-key-auth"

const writeCtx: ApiKeyContext = {
  keyId: "key-1",
  departmentId: null,
  tenantId: null,
  scope: "read_write",
  createdById: "user-1",
  creatorName: "Dumitru",
}
const readCtx: ApiKeyContext = { ...writeCtx, scope: "read" }

const stageField = {
  id: "f-stage",
  name: "Stage",
  type: "select" as const,
  options: [
    { id: "o-inv", label: "Invitation Sent", color: "blue" },
    { id: "o-hired", label: "Hired", color: "green" },
  ],
  order: 1,
  hidden: false,
}
const nameField = { id: "f-name", name: "Candidate", type: "text" as const, options: null, order: 0, hidden: false }
const ratingField = { id: "f-rating", name: "Rating", type: "rating" as const, options: null, order: 2, hidden: false }
const fields = [nameField, stageField, ratingField]

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolveValuesByName", () => {
  it("maps field names case-insensitively and option labels to ids", () => {
    const res = resolveValuesByName(fields, { candidate: "Dipu Paul", STAGE: "hired" })
    expect(res).toMatchObject({ ok: true, values: { "f-name": "Dipu Paul", "f-stage": "o-hired" } })
  })

  it("queues unknown select labels for auto-creation", () => {
    const res = resolveValuesByName(fields, { Stage: "Offer Sent" })
    if (!res.ok) throw new Error(res.message)
    const added = res.optionsToAdd.get("f-stage")
    expect(added).toHaveLength(1)
    expect(added![0].label).toBe("Offer Sent")
    expect(res.values["f-stage"]).toBe(added![0].id)
  })

  it("accepts star-string ratings", () => {
    const res = resolveValuesByName(fields, { Rating: "⭐⭐⭐" })
    expect(res).toMatchObject({ ok: true, values: { "f-rating": 3 } })
  })

  it("rejects unknown field names, listing the real ones", () => {
    const res = resolveValuesByName(fields, { Salary: "70K" })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toContain("Candidate, Stage, Rating")
  })
})

describe("displayValues", () => {
  it("maps ids back to option labels", () => {
    const out = displayValues(fields, { "f-name": "Dipu Paul", "f-stage": "o-hired", "f-rating": 4 })
    expect(out).toEqual({ Candidate: "Dipu Paul", Stage: "Hired", Rating: 4 })
  })
})

describe("addRecruitmentCandidate", () => {
  it("rejects read-only keys", async () => {
    const res = await addRecruitmentCandidate(readCtx, { board: "UI/UX", values: {} })
    expect(res).toEqual({
      ok: false,
      message: "This API key is read-only — recruitment changes require a read_write key",
    })
  })

  it("creates the candidate with resolved values and persists auto-created options", async () => {
    vi.mocked(prisma.recruitmentBoard.findFirst).mockResolvedValue({
      id: "b-1",
      name: "UI/UX Designer Pipeline",
      fields,
    } as never)
    vi.mocked(prisma.recruitmentCandidate.findFirst).mockResolvedValue({ order: 38 } as never)
    vi.mocked(prisma.recruitmentField.update).mockResolvedValue({} as never)
    vi.mocked(prisma.recruitmentCandidate.create).mockImplementation(((args: {
      data: { values: unknown }
    }) => Promise.resolve({ id: "c-new", values: args.data.values })) as never)

    const res = await addRecruitmentCandidate(writeCtx, {
      board: "ui/ux designer pipeline",
      values: { Candidate: "New Person", Stage: "Offer Sent" },
    })

    expect(res.ok).toBe(true)
    expect(vi.mocked(prisma.recruitmentField.update)).toHaveBeenCalledTimes(1)
    const data = (res as { ok: true; data: { values: Record<string, unknown> } }).data
    expect(data.values.Candidate).toBe("New Person")
    expect(data.values.Stage).toBe("Offer Sent")
    const createArgs = vi.mocked(prisma.recruitmentCandidate.create).mock.calls[0][0]
    expect(createArgs.data.order).toBe(39)
  })
})

describe("deleteRecruitmentCandidate", () => {
  it("requires an admin key", async () => {
    const res = await deleteRecruitmentCandidate(writeCtx, { board: "b-1", candidateId: "c-1" })
    expect(res).toEqual({ ok: false, message: "Deleting candidates requires an admin API key" })
  })
})
