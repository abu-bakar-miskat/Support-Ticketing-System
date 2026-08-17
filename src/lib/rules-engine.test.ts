import { describe, it, expect } from "vitest";
import {
  evaluateCondition,
  evaluateConditionGroup,
  planRules,
  type Rule,
  type Condition,
} from "./rules-engine";

const cond = (over: Partial<Condition> & Pick<Condition, "operator">): Condition => ({
  fieldId: "f",
  ...over,
});

describe("evaluateCondition — RE-01 operators", () => {
  it("equals / not_equals (string-coerced)", () => {
    expect(evaluateCondition(cond({ operator: "equals", value: "bug" }), { f: "bug" })).toBe(true);
    expect(evaluateCondition(cond({ operator: "equals", value: "bug" }), { f: "task" })).toBe(false);
    expect(evaluateCondition(cond({ operator: "not_equals", value: "bug" }), { f: "task" })).toBe(true);
    expect(evaluateCondition(cond({ operator: "equals", value: 5 }), { f: "5" })).toBe(true);
  });
  it("contains for strings and arrays", () => {
    expect(evaluateCondition(cond({ operator: "contains", value: "err" }), { f: "server error" })).toBe(true);
    expect(evaluateCondition(cond({ operator: "contains", value: "a" }), { f: ["a", "b"] })).toBe(true);
    expect(evaluateCondition(cond({ operator: "contains", value: "z" }), { f: ["a", "b"] })).toBe(false);
  });
  it("greater_than / less_than numeric", () => {
    expect(evaluateCondition(cond({ operator: "greater_than", value: 10 }), { f: "11" })).toBe(true);
    expect(evaluateCondition(cond({ operator: "greater_than", value: 10 }), { f: 9 })).toBe(false);
    expect(evaluateCondition(cond({ operator: "less_than", value: 10 }), { f: 3 })).toBe(true);
    expect(evaluateCondition(cond({ operator: "greater_than", value: 10 }), { f: "abc" })).toBe(false);
  });
  it("is_empty", () => {
    expect(evaluateCondition(cond({ operator: "is_empty" }), { f: "" })).toBe(true);
    expect(evaluateCondition(cond({ operator: "is_empty" }), { f: [] })).toBe(true);
    expect(evaluateCondition(cond({ operator: "is_empty" }), {})).toBe(true);
    expect(evaluateCondition(cond({ operator: "is_empty" }), { f: "x" })).toBe(false);
  });
});

describe("evaluateConditionGroup — AND/OR", () => {
  const a = cond({ fieldId: "a", operator: "equals", value: "1" });
  const b = cond({ fieldId: "b", operator: "equals", value: "2" });
  it("AND requires all", () => {
    expect(evaluateConditionGroup({ combinator: "AND", conditions: [a, b] }, { a: "1", b: "2" })).toBe(true);
    expect(evaluateConditionGroup({ combinator: "AND", conditions: [a, b] }, { a: "1", b: "x" })).toBe(false);
  });
  it("OR requires any", () => {
    expect(evaluateConditionGroup({ combinator: "OR", conditions: [a, b] }, { a: "1", b: "x" })).toBe(true);
    expect(evaluateConditionGroup({ combinator: "OR", conditions: [a, b] }, { a: "x", b: "x" })).toBe(false);
  });
  it("an empty group matches (unconditional rule)", () => {
    expect(evaluateConditionGroup({ combinator: "AND", conditions: [] }, {})).toBe(true);
  });
});

const rule = (over: Partial<Rule> & Pick<Rule, "id" | "order">): Rule => ({
  name: over.id,
  conditions: { combinator: "AND", conditions: [] },
  actions: [{ type: "set_priority", params: { priority: "High" } }],
  ...over,
});

describe("planRules — ordering, stop-processing, dry-run (RE-03/04)", () => {
  it("executes in configured order regardless of array order", () => {
    const rules = [rule({ id: "second", order: 2 }), rule({ id: "first", order: 1 })];
    const plan = planRules(rules, {});
    expect(plan.evaluations.map((e) => e.ruleId)).toEqual(["first", "second"]);
  });

  it("collects would-fire actions from every matching rule", () => {
    const rules = [
      rule({ id: "r1", order: 1, actions: [{ type: "set_priority", params: { priority: "High" } }] }),
      rule({ id: "r2", order: 2, actions: [{ type: "assign_agent", params: { agentId: "u1" } }] }),
    ];
    const plan = planRules(rules, {});
    expect(plan.firedActions.map((a) => a.type)).toEqual(["set_priority", "assign_agent"]);
    expect(plan.stoppedAtRuleId).toBeNull();
  });

  it("stop-processing halts further rules once a matching rule sets it", () => {
    const rules = [
      rule({ id: "r1", order: 1, stopProcessing: true }),
      rule({ id: "r2", order: 2 }),
    ];
    const plan = planRules(rules, {});
    expect(plan.stoppedAtRuleId).toBe("r1");
    expect(plan.evaluations.map((e) => e.ruleId)).toEqual(["r1"]); // r2 never evaluated
    expect(plan.firedActions).toHaveLength(1);
  });

  it("stop flag on a NON-matching rule does not halt", () => {
    const rules = [
      rule({
        id: "r1",
        order: 1,
        stopProcessing: true,
        conditions: { combinator: "AND", conditions: [{ fieldId: "x", operator: "equals", value: "no" }] },
      }),
      rule({ id: "r2", order: 2 }),
    ];
    const plan = planRules(rules, { x: "yes" });
    expect(plan.stoppedAtRuleId).toBeNull();
    expect(plan.evaluations.map((e) => e.ruleId)).toEqual(["r1", "r2"]);
    expect(plan.evaluations[0].matched).toBe(false);
  });

  it("skips disabled rules", () => {
    const rules = [rule({ id: "r1", order: 1, enabled: false }), rule({ id: "r2", order: 2 })];
    const plan = planRules(rules, {});
    expect(plan.evaluations.map((e) => e.ruleId)).toEqual(["r2"]);
  });

  it("dry-run reports matched conditions + would-fire actions and mutates nothing", () => {
    const rules = [
      rule({
        id: "urgent",
        order: 1,
        conditions: { combinator: "OR", conditions: [{ fieldId: "sev", operator: "equals", value: "P1" }] },
        actions: [{ type: "change_column", params: { columnId: "esc" } }],
      }),
    ];
    const values = { sev: "P1" };
    const plan = planRules(rules, values);
    expect(plan.evaluations[0].matched).toBe(true);
    expect(plan.evaluations[0].actions[0].type).toBe("change_column");
    // Input is untouched (no mutation).
    expect(values).toEqual({ sev: "P1" });
  });
});
