/**
 * Jira-style priority goal conditions for SLA policies.
 * When a policy has a priority, match tickets with that priority;
 * when cleared, use an empty catch-all group (Standard).
 */
import type { ConditionGroup } from "./rules-engine";

export function conditionsForPriority(priority: string | null | undefined): ConditionGroup {
  if (priority) {
    return {
      combinator: "AND",
      conditions: [{ fieldId: "priority", operator: "equals", value: priority }],
    };
  }
  return { combinator: "AND", conditions: [] };
}
