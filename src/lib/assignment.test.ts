import { describe, it, expect } from "vitest";
import { pickRoundRobin, pickWorkloadThreshold, pickRuleBased, type AssignmentRuleLike } from "./assignment";
import type { ConditionGroup } from "./rules-engine";

const unconditional: ConditionGroup = { combinator: "AND", conditions: [] };

describe("pickRoundRobin", () => {
  it("picks the member at the pointer and advances it", () => {
    const eligible = [{ userId: "a" }, { userId: "b" }, { userId: "c" }];
    expect(pickRoundRobin(eligible, 1)).toEqual({ userId: "b", nextPointer: 2 });
  });

  it("wraps the pointer around", () => {
    const eligible = [{ userId: "a" }, { userId: "b" }];
    expect(pickRoundRobin(eligible, 1)).toEqual({ userId: "b", nextPointer: 0 });
  });

  it("normalizes a pointer larger than the pool", () => {
    const eligible = [{ userId: "a" }, { userId: "b" }];
    expect(pickRoundRobin(eligible, 5)).toEqual({ userId: "b", nextPointer: 0 });
  });

  it("returns null when there is nobody eligible", () => {
    expect(pickRoundRobin([], 0)).toBeNull();
  });

  it("ignores workload entirely — always advances strictly by pointer", () => {
    const eligible = [{ userId: "a" }, { userId: "b" }];
    // Even if "a" is buried in tickets, round-robin doesn't care.
    expect(pickRoundRobin(eligible, 0)).toEqual({ userId: "a", nextPointer: 1 });
  });
});

describe("pickWorkloadThreshold", () => {
  it("round-robins among members under the threshold, advancing the pointer", () => {
    // All three are under threshold 5 → strict rotation from the pointer.
    const candidates = [{ userId: "a", count: 4 }, { userId: "b", count: 0 }, { userId: "c", count: 1 }];
    expect(pickWorkloadThreshold(candidates, 5, 0)).toEqual({ userId: "a", nextPointer: 1 });
    expect(pickWorkloadThreshold(candidates, 5, 1)).toEqual({ userId: "b", nextPointer: 2 });
  });

  it("skips members at/over the threshold when someone is still under it", () => {
    // From pointer 0: "a" is at capacity (5 >= 5), so the next under-threshold
    // member ("b") gets it.
    const candidates = [{ userId: "a", count: 5 }, { userId: "b", count: 1 }];
    expect(pickWorkloadThreshold(candidates, 5, 0)).toEqual({ userId: "b", nextPointer: 0 });
  });

  it("falls back to the fewest open tickets when everyone is at/over the threshold", () => {
    const candidates = [{ userId: "a", count: 7 }, { userId: "b", count: 5 }, { userId: "c", count: 9 }];
    expect(pickWorkloadThreshold(candidates, 5, 0)).toEqual({ userId: "b", nextPointer: 2 });
  });

  it("breaks the all-over-threshold fallback tie by input order", () => {
    const candidates = [{ userId: "a", count: 5 }, { userId: "b", count: 5 }];
    expect(pickWorkloadThreshold(candidates, 5, 1)).toEqual({ userId: "a", nextPointer: 1 });
  });

  it("returns null for an empty candidate list", () => {
    expect(pickWorkloadThreshold([], 5, 0)).toBeNull();
  });

  it("handles a single candidate", () => {
    expect(pickWorkloadThreshold([{ userId: "solo", count: 100 }], 5, 0)).toEqual({ userId: "solo", nextPointer: 0 });
  });
});

describe("pickRuleBased", () => {
  const rule = (over: Partial<AssignmentRuleLike> & Pick<AssignmentRuleLike, "id" | "order" | "agentId">): AssignmentRuleLike => ({
    conditions: unconditional,
    ...over,
  });

  it("returns null when no rule matches", () => {
    const rules = [
      rule({ id: "r1", order: 0, agentId: "agent-1", conditions: { combinator: "AND", conditions: [{ fieldId: "priority", operator: "equals", value: "Urgent" }] } }),
    ];
    expect(pickRuleBased(rules, { priority: "Low" })).toBeNull();
  });

  it("returns the first matching rule's agent, evaluated in order", () => {
    const rules = [
      rule({ id: "r2", order: 1, agentId: "agent-2" }),
      rule({ id: "r1", order: 0, agentId: "agent-1" }),
    ];
    // Both unconditional (always match) — order=0 (r1) should win despite array position.
    expect(pickRuleBased(rules, {})).toBe("agent-1");
  });

  it("skips disabled rules even when their conditions match", () => {
    const rules = [
      rule({ id: "r1", order: 0, agentId: "agent-1", enabled: false }),
      rule({ id: "r2", order: 1, agentId: "agent-2" }),
    ];
    expect(pickRuleBased(rules, {})).toBe("agent-2");
  });

  it("only matches rules whose conditions are satisfied", () => {
    const rules = [
      rule({
        id: "urgent",
        order: 0,
        agentId: "agent-urgent",
        conditions: { combinator: "AND", conditions: [{ fieldId: "priority", operator: "equals", value: "Urgent" }] },
      }),
      rule({ id: "default", order: 1, agentId: "agent-default" }),
    ];
    expect(pickRuleBased(rules, { priority: "Urgent" })).toBe("agent-urgent");
    expect(pickRuleBased(rules, { priority: "Low" })).toBe("agent-default");
  });

  it("returns null for an empty rule set", () => {
    expect(pickRuleBased([], {})).toBeNull();
  });
});
