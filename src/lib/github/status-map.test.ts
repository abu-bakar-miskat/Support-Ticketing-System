import { describe, it, expect } from "vitest"
import { pickStatusMove, resolveTargetLabel, type SubDepartmentGitHubMapRow } from "./status-map"

const STATUSES = [
  { label: "Not Started", order: 0, isComplete: false },
  { label: "In Progress", order: 1, isComplete: false },
  { label: "In Review", order: 2, isComplete: false },
  { label: "Done", order: 3, isComplete: true },
]

describe("pickStatusMove", () => {
  it("allows a forward move", () => {
    expect(pickStatusMove("Not Started", "In Progress", STATUSES, false)).toEqual({
      label: "In Progress",
      isComplete: false,
    })
  })

  it("allows jumping several steps forward", () => {
    expect(pickStatusMove("Not Started", "Done", STATUSES, false)).toEqual({
      label: "Done",
      isComplete: true,
    })
  })

  it("rejects a backward move", () => {
    expect(pickStatusMove("Done", "In Progress", STATUSES, false)).toBeNull()
  })

  it("rejects a move to the same status", () => {
    expect(pickStatusMove("In Review", "In Review", STATUSES, false)).toBeNull()
  })

  it("rejects when the team has no status with the target label", () => {
    expect(pickStatusMove("Not Started", "QA", STATUSES, false)).toBeNull()
  })

  it("rejects when the current status is not in the team's list", () => {
    expect(pickStatusMove("Legacy", "Done", STATUSES, false)).toBeNull()
  })

  it("rejects completing an intake-linked ticket", () => {
    expect(pickStatusMove("In Review", "Done", STATUSES, true)).toBeNull()
  })

  it("allows non-completing moves on intake-linked tickets", () => {
    expect(pickStatusMove("Not Started", "In Progress", STATUSES, true)).toEqual({
      label: "In Progress",
      isComplete: false,
    })
  })
})

const WEB_STATUSES = [
  { label: "To Do", order: 0, isComplete: false },
  { label: "In Progress", order: 1, isComplete: false },
  { label: "Pull Request", order: 2, isComplete: true },
  { label: "Blocked", order: 3, isComplete: false },
  { label: "Live", order: 4, isComplete: true },
]

const PHP_STATUSES = [
  { label: "To Do", order: 0, isComplete: false },
  { label: "In Progress", order: 1, isComplete: false },
  { label: "In Review", order: 2, isComplete: false },
  { label: "Live", order: 6, isComplete: true },
  { label: "Done", order: 7, isComplete: true },
]

describe("resolveTargetLabel — defaults (config null)", () => {
  it("prOpened resolves to In Progress case-insensitively", () => {
    expect(resolveTargetLabel("prOpened", PHP_STATUSES, null)).toBe("In Progress")
    expect(
      resolveTargetLabel(
        "prOpened",
        [{ label: "in progress", order: 0, isComplete: false }],
        null,
      ),
    ).toBe("in progress")
  })

  it("prOpened skips when the team has no In Progress", () => {
    expect(resolveTargetLabel("prOpened", [{ label: "Doing", order: 0, isComplete: false }], null)).toBeNull()
  })

  it("prReadyForReview matches the first non-complete review alias", () => {
    expect(resolveTargetLabel("prReadyForReview", PHP_STATUSES, null)).toBe("In Review")
  })

  it("prReadyForReview never picks a complete-flagged status (WEB's Pull Request)", () => {
    expect(resolveTargetLabel("prReadyForReview", WEB_STATUSES, null)).toBeNull()
  })

  it("prMerged prefers exact Live over Done", () => {
    expect(resolveTargetLabel("prMerged", PHP_STATUSES, null)).toBe("Live")
  })

  it("prMerged falls back to the first complete status when Live is absent", () => {
    expect(
      resolveTargetLabel(
        "prMerged",
        [
          { label: "To Do", order: 0, isComplete: false },
          { label: "Done", order: 1, isComplete: true },
        ],
        null,
      ),
    ).toBe("Done")
  })

  it("prMerged prefers Live over an earlier complete-flagged status", () => {
    expect(resolveTargetLabel("prMerged", WEB_STATUSES, null)).toBe("Live")
  })

  it("prMerged skips when nothing is complete-flagged", () => {
    expect(resolveTargetLabel("prMerged", [{ label: "To Do", order: 0, isComplete: false }], null)).toBeNull()
  })

  it("prMergedToDev resolves to In Review", () => {
    expect(resolveTargetLabel("prMergedToDev", PHP_STATUSES, null)).toBe("In Review")
  })

  it("prMergedToDev skips when no non-complete review status exists", () => {
    expect(resolveTargetLabel("prMergedToDev", WEB_STATUSES, null)).toBeNull()
  })
})

describe("resolveTargetLabel — overrides", () => {
  const config: SubDepartmentGitHubMapRow = {
    onPrOpened: "Blocked",
    onPrReadyForReview: "",
    onPrMerged: null,
  }

  it("uses the configured label when set", () => {
    expect(resolveTargetLabel("prOpened", WEB_STATUSES, config)).toBe("Blocked")
  })

  it("empty string disables the event", () => {
    expect(resolveTargetLabel("prReadyForReview", WEB_STATUSES, config)).toBeNull()
  })

  it("null field falls through to the default", () => {
    expect(resolveTargetLabel("prMerged", WEB_STATUSES, config)).toBe("Live")
  })

  it("prMergedToDev ignores onPrMerged overrides and uses review default", () => {
    expect(
      resolveTargetLabel("prMergedToDev", PHP_STATUSES, {
        onPrOpened: null,
        onPrReadyForReview: null,
        onPrMerged: "Live",
      }),
    ).toBe("In Review")
  })

  it("a configured label that no longer exists resolves to skip", () => {
    expect(
      resolveTargetLabel("prOpened", WEB_STATUSES, { ...config, onPrOpened: "Ghost" }),
    ).toBeNull()
  })
})
