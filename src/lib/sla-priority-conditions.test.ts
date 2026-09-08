import { describe, it, expect } from "vitest";
import { conditionsForPriority } from "./sla-priority-conditions";

describe("conditionsForPriority", () => {
  it("builds a priority-equals condition when priority is set", () => {
    expect(conditionsForPriority("High")).toEqual({
      combinator: "AND",
      conditions: [{ fieldId: "priority", operator: "equals", value: "High" }],
    });
  });

  it("returns an empty catch-all group when priority is cleared", () => {
    expect(conditionsForPriority(null)).toEqual({ combinator: "AND", conditions: [] });
    expect(conditionsForPriority(undefined)).toEqual({ combinator: "AND", conditions: [] });
  });
});
