import { describe, expect, it } from "vitest"
import { categoryForStatus, isCompleteStatus, isStatusCategory, sortStatusesByCategory, statusCategory } from "./status-category"
import { resolutionUpdateOnStatusChange } from "./resolution-tracking"
import { matchesDateFilter } from "@/components/board/board-filters"
import type { BoardCardData } from "@/components/board/board-types"

describe("status lifecycle categories", () => {
  it("uses the configured category regardless of name or old completion flag", () => {
    expect(statusCategory({ label: "Testing", category: "IN_PROGRESS" })).toBe("IN_PROGRESS")
    expect(statusCategory({ label: "Live", category: "TODO", isComplete: true })).toBe("TODO")
    expect(statusCategory({ label: "In Progress", category: "BLOCKED" })).toBe("BLOCKED")
    expect(statusCategory({ label: "Released to customer", category: "COMPLETE" })).toBe("COMPLETE")
  })

  it("derives completion from category even when the legacy flag disagrees", () => {
    expect(isCompleteStatus({ label: "Done", category: "TODO", isComplete: true })).toBe(false)
    expect(isCompleteStatus({ label: "Released", category: "COMPLETE", isComplete: false })).toBe(true)
  })

  it("resolves the same status name independently in each team's workflow", () => {
    expect(categoryForStatus("Review", [{ label: "Review", category: "TODO" }])).toBe("TODO")
    expect(categoryForStatus("Review", [{ label: "Review", category: "IN_PROGRESS" }])).toBe("IN_PROGRESS")
  })

  it("sorts categories in lifecycle order while preserving order within each", () => {
    const statuses = [
      { label: "Done", category: "COMPLETE" as const, order: 0 },
      { label: "Testing", category: "IN_PROGRESS" as const, order: 3 },
      { label: "New", category: "TODO" as const, order: 5 },
      { label: "Rejected", category: "BLOCKED" as const, order: 1 },
      { label: "Review", category: "IN_PROGRESS" as const, order: 2 },
    ]
    expect(sortStatusesByCategory(statuses).map((s) => s.label)).toEqual(["New", "Review", "Testing", "Rejected", "Done"])
    expect(statuses[0].label).toBe("Done")
  })

  it("rejects arbitrary category values and supports legacy templates", () => {
    expect(isStatusCategory("IN_PROGRESS")).toBe(true)
    expect(isStatusCategory("Testing")).toBe(false)
    expect(isStatusCategory(null)).toBe(false)
    expect(statusCategory({ label: "Custom done", isComplete: true })).toBe("COMPLETE")
    expect(statusCategory({ label: "Open" })).toBe("TODO")
    expect(statusCategory({ label: "Paused" })).toBe("BLOCKED")
  })

  it("starts resolution tracking for a custom active status, but not a blocked namesake", () => {
    const now = new Date("2026-10-12T12:00:00Z")
    const params = { isCompletion: false, newClosedAt: null, currentInProgressStartedAt: null, slaResolutionTargetMins: null, estimatedTime: 60, now }
    expect(resolutionUpdateOnStatusChange({ ...params, toStatus: "Quality assurance", category: "IN_PROGRESS" }).inProgressStartedAt).toEqual(now)
    expect(resolutionUpdateOnStatusChange({ ...params, toStatus: "In Progress", category: "BLOCKED" })).toEqual({})
  })

  it("excludes custom blocked and complete statuses from overdue board filters", () => {
    const card = { status: "Awaiting supplier", dueDateIso: "2020-01-01", statusCategory: "BLOCKED", isComplete: false } as BoardCardData
    expect(matchesDateFilter(card, "overdue")).toBe(false)
    expect(matchesDateFilter({ ...card, statusCategory: "COMPLETE" }, "overdue")).toBe(false)
    expect(matchesDateFilter({ ...card, statusCategory: "IN_PROGRESS" }, "overdue")).toBe(true)
  })
})
