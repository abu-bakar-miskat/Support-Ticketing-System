/**
 * Per-department rules engine (SRS slice 09, RE-01/02/03/04).
 *
 * PURE + isomorphic — condition evaluation, ordered execution with the
 * stop-processing flag, and dry-run planning all live here with no DB and no
 * mutation. `planRules` is the single source of truth: the dry-run endpoint
 * returns its trace verbatim (RE-04), and the real executor applies the same
 * `firedActions` it reports — so dry-run can never diverge from live behavior.
 *
 * Persisting rules, APPLYING actions (assign / priority / column / SLA / notify),
 * and writing the execution log (RE-05) are DB concerns layered on top of this.
 */

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "is_empty";

export type Condition = {
  /** The submitted form field this condition inspects. */
  fieldId: string;
  operator: ConditionOperator;
  /** Comparison operand; unused for is_empty. */
  value?: string | number;
};

export type Combinator = "AND" | "OR";

export type ConditionGroup = {
  combinator: Combinator;
  conditions: Condition[];
};

export type RuleActionType =
  | "assign_agent"
  | "assign_group"
  | "set_priority"
  | "set_category"
  | "set_tag"
  | "apply_sla"
  | "change_column"
  | "send_notification";

export type RuleAction = {
  type: RuleActionType;
  /** Action-specific parameters (agentId, priority, columnId, slaPolicyId, …). */
  params?: Record<string, unknown>;
};

export type Rule = {
  id: string;
  name: string;
  /** Lower runs first (RE-03). Ties broken by array order for stability. */
  order: number;
  conditions: ConditionGroup;
  actions: RuleAction[];
  /** When this rule matches, halt evaluation of later rules (RE-03). */
  stopProcessing?: boolean;
  /** Disabled rules are skipped entirely. */
  enabled?: boolean;
};

export type FormValues = Record<string, unknown>;

const isEmpty = (v: unknown): boolean =>
  v == null ||
  (typeof v === "string" && v.trim() === "") ||
  (Array.isArray(v) && v.length === 0);

function toNumber(v: unknown): number {
  return typeof v === "number" ? v : Number(String(v).trim());
}

/** Evaluate one condition against the submitted values (RE-01). Pure + total. */
export function evaluateCondition(cond: Condition, values: FormValues): boolean {
  const actual = values[cond.fieldId];

  switch (cond.operator) {
    case "is_empty":
      return isEmpty(actual);
    case "equals":
      return String(actual) === String(cond.value);
    case "not_equals":
      return String(actual) !== String(cond.value);
    case "contains": {
      if (Array.isArray(actual)) return actual.map(String).includes(String(cond.value));
      return String(actual).includes(String(cond.value));
    }
    case "greater_than": {
      const a = toNumber(actual);
      const b = toNumber(cond.value);
      return !Number.isNaN(a) && !Number.isNaN(b) && a > b;
    }
    case "less_than": {
      const a = toNumber(actual);
      const b = toNumber(cond.value);
      return !Number.isNaN(a) && !Number.isNaN(b) && a < b;
    }
    default:
      return false;
  }
}

/**
 * Evaluate a condition group (RE-01). An empty group matches (a rule with no
 * conditions is an unconditional rule). AND requires all; OR requires any.
 */
export function evaluateConditionGroup(group: ConditionGroup, values: FormValues): boolean {
  if (group.conditions.length === 0) return true;
  if (group.combinator === "OR") {
    return group.conditions.some((c) => evaluateCondition(c, values));
  }
  return group.conditions.every((c) => evaluateCondition(c, values));
}

export type RuleEvaluation = {
  ruleId: string;
  name: string;
  matched: boolean;
  /** Actions this rule would fire (empty unless matched). */
  actions: RuleAction[];
  /** True when this matched rule's stop-processing flag halted the run. */
  stoppedHere: boolean;
};

export type RulesPlan = {
  /** Per-rule trace in execution order — powers the dry-run report (RE-04). */
  evaluations: RuleEvaluation[];
  /** Flattened actions that would fire, in order (what the executor applies). */
  firedActions: RuleAction[];
  /** The rule whose stop-processing flag halted evaluation, or null. */
  stoppedAtRuleId: string | null;
};

/** Rules sorted by `order` (stable — ties keep input order). */
function ordered(rules: Rule[]): Rule[] {
  return rules
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.order - b.r.order || a.i - b.i)
    .map(({ r }) => r);
}

/**
 * Evaluate all rules in order and produce the plan (RE-03/RE-04). This mutates
 * NOTHING — it is exactly the dry-run. The real executor consumes `firedActions`
 * and persists the `evaluations` as the execution log (RE-05).
 *
 * Disabled rules are skipped. A matched rule contributes its actions; if it also
 * has `stopProcessing`, evaluation halts and later rules are not considered.
 */
export function planRules(rules: Rule[], values: FormValues): RulesPlan {
  const evaluations: RuleEvaluation[] = [];
  const firedActions: RuleAction[] = [];
  let stoppedAtRuleId: string | null = null;

  for (const rule of ordered(rules)) {
    if (rule.enabled === false) continue;

    const matched = evaluateConditionGroup(rule.conditions, values);
    const stoppedHere = matched && rule.stopProcessing === true;
    evaluations.push({
      ruleId: rule.id,
      name: rule.name,
      matched,
      actions: matched ? rule.actions : [],
      stoppedHere,
    });
    if (matched) {
      firedActions.push(...rule.actions);
      if (stoppedHere) {
        stoppedAtRuleId = rule.id;
        break;
      }
    }
  }

  return { evaluations, firedActions, stoppedAtRuleId };
}
