/**
 * Pure assignment-method pickers (slice 11, ASG-01). No DB, no wall clock —
 * eligibility/counting/rule-loading is the DB layer's job (lib/assignment-engine.ts);
 * these functions just pick a winner from already-fetched data, so they're
 * trivially unit-testable and share `evaluateConditionGroup` with the rules
 * engine (lib/rules-engine.ts) the same way lib/sla-policy-match.ts does.
 */
import { evaluateConditionGroup, type ConditionGroup, type FormValues } from "./rules-engine";

/**
 * Strict rotation — no workload weighting. `pointer` is the index into
 * `eligible` to assign next; returns the advanced pointer for the caller to
 * persist. Null when there's nobody to assign to.
 */
export function pickRoundRobin(
  eligible: readonly { userId: string }[],
  pointer: number,
): { userId: string; nextPointer: number } | null {
  if (eligible.length === 0) return null;
  const idx = ((pointer % eligible.length) + eligible.length) % eligible.length;
  return { userId: eligible[idx].userId, nextPointer: (idx + 1) % eligible.length };
}

/**
 * Threshold-aware workload pick. `candidates` must be ordered consistently
 * (e.g. by joinedAt) and `pointer` is an index into that list (relative to the
 * candidate pool, matching pickRoundRobin's convention):
 *   • While at least one member is under `threshold`, rotate through those
 *     under-threshold members round-robin from `pointer`, so load spreads
 *     evenly instead of always piling onto the single least-loaded agent.
 *   • Once everyone is at/over `threshold`, fall back to the member with the
 *     fewest open tickets (ties broken by input order).
 * Returns the advanced pointer for the caller to persist, or null when there
 * are no candidates.
 */
export function pickWorkloadThreshold(
  candidates: readonly { userId: string; count: number }[],
  threshold: number,
  pointer: number,
): { userId: string; nextPointer: number } | null {
  const n = candidates.length;
  if (n === 0) return null;
  const start = ((pointer % n) + n) % n;

  for (let i = 0; i < n; i++) {
    const idx = (start + i) % n;
    if (candidates[idx].count < threshold) {
      return { userId: candidates[idx].userId, nextPointer: (idx + 1) % n };
    }
  }

  let minIdx = 0;
  for (let i = 1; i < n; i++) {
    if (candidates[i].count < candidates[minIdx].count) minIdx = i;
  }
  return { userId: candidates[minIdx].userId, nextPointer: (minIdx + 1) % n };
}

export type AssignmentRuleLike = {
  id: string;
  conditions: ConditionGroup;
  agentId: string;
  enabled?: boolean;
  order: number;
};

/**
 * Rule-based pick: rules are tried in `order` (ties keep input order); the
 * first enabled rule whose conditions match the submitted form values wins,
 * returning its `agentId`. Null when nothing matches.
 */
export function pickRuleBased(rules: readonly AssignmentRuleLike[], values: FormValues): string | null {
  const ordered = rules
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.order - b.r.order || a.i - b.i)
    .map(({ r }) => r);

  for (const rule of ordered) {
    if (rule.enabled === false) continue;
    if (evaluateConditionGroup(rule.conditions, values)) return rule.agentId;
  }
  return null;
}
