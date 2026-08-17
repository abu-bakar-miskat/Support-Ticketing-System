import { describe, it, expect } from "vitest"
import { classifyStage, computeBoardStats, computeRecruitmentStats } from "./recruitment-stats"

const fields = [
  { id: "f-name", name: "Candidate", type: "text" as const, options: null },
  {
    id: "f-stage",
    name: "Stage",
    type: "select" as const,
    options: [
      { id: "s1", label: "Invitation Sent", color: "blue" },
      { id: "s2", label: "Hired", color: "green" },
      { id: "s3", label: "Stage 1 — Rejected", color: "red" },
      { id: "s4", label: "never replyed", color: "gray" },
    ],
  },
  {
    id: "f-reason",
    name: "Reject Reason",
    type: "select" as const,
    options: [
      { id: "r1", label: "Communication", color: "orange" },
      { id: "r2", label: "Test Fail", color: "orange" },
    ],
  },
  { id: "f-rating", name: "Rating", type: "rating" as const, options: null },
  { id: "f-date", name: "Date Shortlisted", type: "date" as const, options: null },
]

const board = {
  id: "b1",
  name: "UI/UX",
  archived: false,
  createdAt: "2026-06-01",
  fields,
  candidates: [
    { values: { "f-stage": "s2", "f-rating": 4, "f-date": "2026-06-07" } }, // hired, week of Jun 1
    { values: { "f-stage": "s3", "f-reason": "r1", "f-rating": 1, "f-date": "2026-06-09" } }, // rejected, week of Jun 8
    { values: { "f-stage": "s3", "f-reason": "r2", "f-rating": 3, "f-date": "2026-06-08" } },
    { values: { "f-stage": "s1", "f-date": "2026-06-22" } }, // in progress
    { values: { "f-stage": "s4" } }, // never replied
  ],
}

describe("classifyStage", () => {
  it("buckets labels by keyword", () => {
    expect(classifyStage("Hired")).toBe("hired")
    expect(classifyStage("Stage 2 - Passed (Shortlisted for offer)")).toBe("hired")
    expect(classifyStage("Stage 1 — Rejected")).toBe("rejected")
    expect(classifyStage("never replyed")).toBe("noReply")
    expect(classifyStage("Invitation Sent")).toBe("inProgress")
  })
})

describe("computeBoardStats", () => {
  const stats = computeBoardStats(board)

  it("counts outcomes", () => {
    expect(stats.total).toBe(5)
    expect(stats.hired).toBe(1)
    expect(stats.rejected).toBe(2)
    expect(stats.noReply).toBe(1)
    expect(stats.inProgress).toBe(1)
  })

  it("aggregates stages sorted by count with chip colors", () => {
    expect(stats.stages[0]).toEqual({ label: "Stage 1 — Rejected", color: "red", count: 2 })
    expect(stats.stages).toHaveLength(4)
  })

  it("computes ratings distribution and average", () => {
    expect(stats.ratings).toEqual([1, 0, 1, 1, 0])
    expect(stats.avgRating).toBe(2.7)
    expect(stats.ratedCount).toBe(3)
  })

  it("collects reject reasons and week buckets and date range", () => {
    expect(stats.rejectReasons).toEqual([
      { label: "Communication", count: 1 },
      { label: "Test Fail", count: 1 },
    ])
    expect(stats.byWeek).toEqual([
      { week: "2026-06-01", count: 1 },
      { week: "2026-06-08", count: 2 },
      { week: "2026-06-22", count: 1 },
    ])
    expect(stats.firstDate).toBe("2026-06-07")
    expect(stats.lastDate).toBe("2026-06-22")
  })
})

describe("computeRecruitmentStats", () => {
  it("merges boards into an overall block", () => {
    const second = { ...board, id: "b2", name: "Backend", archived: true }
    const { overall, boards } = computeRecruitmentStats([board, second])
    expect(boards).toHaveLength(2)
    expect(overall.total).toBe(10)
    expect(overall.hired).toBe(2)
    expect(overall.stages.find((s) => s.label === "Stage 1 — Rejected")?.count).toBe(4)
    expect(overall.byWeek.find((w) => w.week === "2026-06-08")?.count).toBe(4)
    expect(overall.avgRating).toBe(2.7)
  })
})
