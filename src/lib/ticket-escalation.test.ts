import { describe, it, expect } from "vitest"
import { labelsAfterDeEscalation, ESCALATED_LABEL } from "@/lib/ticket-escalation"

describe("labelsAfterDeEscalation", () => {
  it("drops the Escalated label when moving into In Progress", () => {
    expect(labelsAfterDeEscalation([ESCALATED_LABEL, "Bug"], "In Progress")).toEqual(["Bug"])
  })

  it("matches In Progress via status normalization (aliases/casing)", () => {
    expect(labelsAfterDeEscalation([ESCALATED_LABEL], "in_progress")).toEqual([])
    expect(labelsAfterDeEscalation([ESCALATED_LABEL], "Working")).toEqual([])
  })

  it("is case-insensitive on the label itself", () => {
    expect(labelsAfterDeEscalation(["escalated"], "In Progress")).toEqual([])
  })

  it("leaves labels untouched for non-In-Progress statuses", () => {
    expect(labelsAfterDeEscalation([ESCALATED_LABEL, "Bug"], "Resolved")).toEqual([
      ESCALATED_LABEL,
      "Bug",
    ])
    expect(labelsAfterDeEscalation([ESCALATED_LABEL], "Escalated")).toEqual([ESCALATED_LABEL])
  })

  it("is a no-op when there is no Escalated label", () => {
    expect(labelsAfterDeEscalation(["Bug", "Urgent"], "In Progress")).toEqual(["Bug", "Urgent"])
  })
})
