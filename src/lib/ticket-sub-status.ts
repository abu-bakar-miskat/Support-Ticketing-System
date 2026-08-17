/**
 * Ticket sub-status (SRS BD-07, slice 07).
 *
 * A ticket's sub-status is DERIVED (not stored) from the last *public* message in
 * its customer conversation:
 *   - the last public message was the customer (inbound)  → WAITING_FOR_SUPPORT
 *   - the last public message was an agent   (outbound)   → WAITING_FOR_CUSTOMER
 *
 * Internal notes are `Comment` rows (physically separate from `TicketMessage`),
 * so they can never reach this function — sub-status is immune to them by
 * construction. System messages (auto-generated, not part of the customer/agent
 * exchange) are ignored. A ticket with no public message yet has no sub-status.
 *
 * Pure and unit-tested; callers pass the ticket's messages.
 */

export type SubStatus = "WAITING_FOR_SUPPORT" | "WAITING_FOR_CUSTOMER";

export type ConversationMessage = {
  /** inbound = from the customer; outbound = from an agent. */
  direction: "inbound" | "outbound";
  /** MessageStatus; "system" messages are excluded from the derivation. */
  status?: "trusted" | "quarantined" | "system" | null;
  createdAt: Date | string | number;
};

const ts = (v: Date | string | number): number => new Date(v).getTime();

/**
 * Derive the sub-status from a ticket's messages. Order-independent: the latest
 * non-system message by `createdAt` decides. Returns null when the ticket has no
 * public (non-system) message yet.
 */
export function deriveSubStatus(messages: readonly ConversationMessage[]): SubStatus | null {
  let last: ConversationMessage | null = null;
  for (const m of messages) {
    if (m.status === "system") continue;
    if (last === null || ts(m.createdAt) >= ts(last.createdAt)) last = m;
  }
  if (last === null) return null;
  return last.direction === "inbound" ? "WAITING_FOR_SUPPORT" : "WAITING_FOR_CUSTOMER";
}

/** Human-readable label for a sub-status (UI badge). */
export function subStatusLabel(sub: SubStatus | null): string | null {
  if (sub === "WAITING_FOR_SUPPORT") return "Waiting for support";
  if (sub === "WAITING_FOR_CUSTOMER") return "Waiting for customer";
  return null;
}
