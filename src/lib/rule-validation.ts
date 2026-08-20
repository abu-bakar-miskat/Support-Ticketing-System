import {
  evaluateConditionGroup,
  type ConditionGroup,
  type RuleAction,
  type RuleActionType,
} from "@/lib/rules-engine";

export const DEFAULT_CONDITION_GROUP: ConditionGroup = { combinator: "AND", conditions: [] };

export const RULE_ACTION_TYPES: RuleActionType[] = [
  "assign_agent",
  "assign_group",
  "set_priority",
  "set_category",
  "set_tag",
  "apply_sla",
  "change_column",
  "send_notification",
];

/** Structural guard for a rules-engine ConditionGroup coming from an API body. */
export function isConditionGroup(value: unknown): value is ConditionGroup {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.combinator !== "AND" && v.combinator !== "OR") return false;
  if (!Array.isArray(v.conditions)) return false;
  try {
    // Cheap structural validation: run it against an empty value set.
    evaluateConditionGroup(v as ConditionGroup, {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a RuleAction[] from an API body. Returns an error message string, or
 * null when valid. Each action must have a known `type` and an optional object
 * `params`.
 */
export function isRuleActions(value: unknown): string | null {
  if (!Array.isArray(value)) return "actions must be an array";
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return "each action must be an object";
    const a = raw as Partial<RuleAction>;
    if (typeof a.type !== "string" || !RULE_ACTION_TYPES.includes(a.type as RuleActionType)) {
      return `action.type must be one of: ${RULE_ACTION_TYPES.join(", ")}`;
    }
    if (a.params !== undefined && (typeof a.params !== "object" || a.params === null || Array.isArray(a.params))) {
      return "action.params must be an object";
    }
  }
  return null;
}
