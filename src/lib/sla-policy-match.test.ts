import { describe, it, expect } from "vitest";
import { selectSlaTargets, type SlaPolicyLike } from "./sla-policy-match";
import type { ConditionGroup } from "./rules-engine";

const unconditional: ConditionGroup = { combinator: "AND", conditions: [] };

const policy = (over: Partial<SlaPolicyLike> & Pick<SlaPolicyLike, "id">): SlaPolicyLike => ({
  conditions: unconditional,
  firstResponseMins: 60,
  resolutionMins: 480,
  ...over,
});

describe("selectSlaTargets — SLA-01/02", () => {
  it("returns null when no policy matches", () => {
    const policies = [
      policy({
        id: "p1",
        conditions: { combinator: "AND", conditions: [{ fieldId: "priority", operator: "equals", value: "Urgent" }] },
      }),
    ];
    expect(selectSlaTargets(policies, { priority: "Low" })).toBeNull();
  });

  it("returns the single matching policy's targets", () => {
    const policies = [policy({ id: "p1", firstResponseMins: 30, resolutionMins: 240 })];
    const result = selectSlaTargets(policies, {});
    expect(result).toEqual({ firstResponseMins: 30, resolutionMins: 240, matchedPolicyIds: ["p1"] });
  });

  it("picks the most restrictive target per metric independently on overlap", () => {
    // p1 has the tighter first-response, p2 has the tighter resolution.
    const policies = [
      policy({ id: "p1", firstResponseMins: 15, resolutionMins: 600 }),
      policy({ id: "p2", firstResponseMins: 60, resolutionMins: 120 }),
    ];
    const result = selectSlaTargets(policies, {});
    expect(result?.firstResponseMins).toBe(15);
    expect(result?.resolutionMins).toBe(120);
    expect(result?.matchedPolicyIds.sort()).toEqual(["p1", "p2"]);
  });

  it("skips disabled policies even if their conditions match", () => {
    const policies = [
      policy({ id: "p1", enabled: false, firstResponseMins: 5, resolutionMins: 5 }),
      policy({ id: "p2", firstResponseMins: 60, resolutionMins: 480 }),
    ];
    const result = selectSlaTargets(policies, {});
    expect(result).toEqual({ firstResponseMins: 60, resolutionMins: 480, matchedPolicyIds: ["p2"] });
  });

  it("only applies matching policies when conditions differ", () => {
    const policies = [
      policy({
        id: "urgent",
        conditions: { combinator: "AND", conditions: [{ fieldId: "priority", operator: "equals", value: "Urgent" }] },
        firstResponseMins: 10,
        resolutionMins: 60,
      }),
      policy({ id: "default", firstResponseMins: 120, resolutionMins: 1440 }),
    ];
    const urgentResult = selectSlaTargets(policies, { priority: "Urgent" });
    expect(urgentResult?.firstResponseMins).toBe(10);
    expect(urgentResult?.resolutionMins).toBe(60);
    expect(urgentResult?.matchedPolicyIds.sort()).toEqual(["default", "urgent"]);

    const lowResult = selectSlaTargets(policies, { priority: "Low" });
    expect(lowResult).toEqual({ firstResponseMins: 120, resolutionMins: 1440, matchedPolicyIds: ["default"] });
  });
});
