import {
  evaluateConditionGroup,
  type ConditionGroup,
  type RuleAction,
  type RuleActionType,
} from "@/lib/rules-engine";
import { TicketPriority } from "@/generated/prisma/enums";

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

/** Allowed TicketPriority enum values for set_priority actions (never free text). */
export const VALID_RULE_PRIORITIES = Object.values(TicketPriority) as string[];

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
 * `params`. set_priority / assign_agent / assign_group require concrete params
 * (no free-text blanks).
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
    const params = (a.params ?? {}) as Record<string, unknown>;
    if (a.type === "set_priority") {
      const priority = params.priority;
      if (typeof priority !== "string" || !VALID_RULE_PRIORITIES.includes(priority)) {
        return `set_priority.params.priority must be one of: ${VALID_RULE_PRIORITIES.join(", ")}`;
      }
    }
    if (a.type === "assign_agent") {
      const agentId = params.agentId;
      if (typeof agentId !== "string" || !agentId.trim()) {
        return "assign_agent.params.agentId is required";
      }
    }
    if (a.type === "assign_group") {
      const groupId =
        typeof params.subDepartmentId === "string"
          ? params.subDepartmentId
          : typeof params.teamId === "string"
            ? params.teamId
            : "";
      if (!groupId.trim()) {
        return "assign_group.params.subDepartmentId is required";
      }
    }
  }
  return null;
}

/** Collect agent / sub-department ids referenced by rule actions (for scope checks). */
export function collectRuleActionTargetIds(actions: unknown): {
  agentIds: string[];
  subDepartmentIds: string[];
} {
  const agentIds: string[] = [];
  const subDepartmentIds: string[] = [];
  if (!Array.isArray(actions)) return { agentIds, subDepartmentIds };
  for (const raw of actions) {
    if (typeof raw !== "object" || raw === null) continue;
    const a = raw as Partial<RuleAction>;
    const params = (a.params ?? {}) as Record<string, unknown>;
    if (a.type === "assign_agent" && typeof params.agentId === "string" && params.agentId.trim()) {
      agentIds.push(params.agentId.trim());
    }
    if (a.type === "assign_group") {
      const groupId =
        typeof params.subDepartmentId === "string"
          ? params.subDepartmentId
          : typeof params.teamId === "string"
            ? params.teamId
            : "";
      if (groupId.trim()) subDepartmentIds.push(groupId.trim());
    }
  }
  return { agentIds, subDepartmentIds };
}
