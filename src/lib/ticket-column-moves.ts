/**
 * Reopen decision + Reopened-label helpers (SRS BD-09, OQ-05). Keys on
 * `status_type`, never the status label (C-03). Pure and unit-tested.
 */
import { type StatusType } from "./board-columns";

/** Label auto-applied when a resolved ticket is reopened by a customer (OQ-05). */
export const REOPENED_LABEL = "Reopened";

/**
 * BD-09: a customer reply (inbound public message) to a RESOLVED ticket reopens
 * it. An agent reply, or a reply to a non-resolved ticket, does not.
 */
export function shouldReopenOnCustomerReply(
  currentStatusType: StatusType | null | undefined,
  direction: "inbound" | "outbound",
): boolean {
  return direction === "inbound" && currentStatusType === "RESOLVED";
}

/** Add the Reopened label (idempotent) — applied when a ticket is reopened. */
export function applyReopenedLabel(labels: readonly string[]): string[] {
  return labels.includes(REOPENED_LABEL) ? [...labels] : [...labels, REOPENED_LABEL];
}

/**
 * OQ-05: the Reopened label auto-clears when an agent next replies (outbound).
 * A customer (inbound) reply leaves it in place. Returns the labels unchanged
 * when the label isn't present.
 */
export function clearReopenedLabelOnReply(
  labels: readonly string[],
  direction: "inbound" | "outbound",
): string[] {
  if (direction !== "outbound") return [...labels];
  return labels.filter((l) => l !== REOPENED_LABEL);
}
