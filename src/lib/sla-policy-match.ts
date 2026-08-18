/**
 * SLA policy matching (slice 10, SLA-01/02). PURE — no DB.
 *
 * A department can have several SLA policies, each conditioned on submitted
 * form values (the same `ConditionGroup` shape used by the rules engine, see
 * rules-engine.ts). Where multiple policies match a ticket, the "most
 * restrictive target wins" per metric: the first-response target is the
 * smallest matching `firstResponseMins`, and the resolution target is the
 * smallest matching `resolutionMins`, chosen independently. This avoids an
 * arbitrary total order across policies that disagree on which metric is
 * tighter (e.g. one policy has the tighter first-response, another the
 * tighter resolution) — a ticket is simply held to the strictest bound on
 * each axis.
 */
import { evaluateConditionGroup, type ConditionGroup, type FormValues } from "./rules-engine";

export type SlaPolicyLike = {
  id: string;
  conditions: ConditionGroup;
  firstResponseMins: number;
  resolutionMins: number;
  enabled?: boolean;
};

export type SlaTargets = {
  firstResponseMins: number;
  resolutionMins: number;
  /** Every policy that matched, in no particular order — for audit/snapshot. */
  matchedPolicyIds: string[];
};

/**
 * Select the SLA targets that apply to a ticket given its department's
 * policies and the ticket's submitted form values. Disabled policies are
 * skipped. Returns null when no policy matches (no SLA applies).
 */
export function selectSlaTargets(
  policies: readonly SlaPolicyLike[],
  values: FormValues,
): SlaTargets | null {
  const matched = policies.filter(
    (p) => p.enabled !== false && evaluateConditionGroup(p.conditions, values),
  );
  if (matched.length === 0) return null;

  return {
    firstResponseMins: Math.min(...matched.map((p) => p.firstResponseMins)),
    resolutionMins: Math.min(...matched.map((p) => p.resolutionMins)),
    matchedPolicyIds: matched.map((p) => p.id),
  };
}
