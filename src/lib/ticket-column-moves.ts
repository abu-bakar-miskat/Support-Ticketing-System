/**
 * Board column-move decisions for reopen + escalate (SRS BD-08/09, OQ-04/05,
 * slice 07). All logic keys on `status_type`, never the column label (C-03).
 *
 * Pure and unit-tested. Live wiring (customer-reply handler, escalate action)
 * is gated on the slice-04 board cutover: it needs the department board to be
 * the live source of truth (columns seeded, `Ticket.boardColumnId` populated).
 */
import { firstColumnOfType, type StatusType } from "./board-columns";

/** Label auto-applied when a resolved ticket is reopened by a customer (OQ-05). */
export const REOPENED_LABEL = "Reopened";

type ColumnLike = { statusType: StatusType; order: number };

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

/**
 * BD-09: the column a reopened ticket moves to — the board's FIRST OPEN column.
 * Null when the board has no OPEN column (degenerate board).
 */
export function reopenTargetColumn<T extends ColumnLike>(columns: T[]): T | null {
  return firstColumnOfType(columns, "OPEN");
}

/**
 * OQ-04: an explicit escalation moves the ticket to the board's first ESCALATED
 * column. Null when the board has no ESCALATED column. Escalation is only ever
 * triggered by explicit user action — never by SLA breach (BD-08), so this
 * module exposes no SLA-driven mover by design.
 */
export function escalateTargetColumn<T extends ColumnLike>(columns: T[]): T | null {
  return firstColumnOfType(columns, "ESCALATED");
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
