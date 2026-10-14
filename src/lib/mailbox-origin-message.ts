/**
 * The email a shared-mailbox ticket was created from. Its body is the ticket's
 * description, so the UI shows it there and hides it from the reply thread.
 * The row itself stays stored: it is the inbound-email idempotency key, the
 * reply-threading anchor and the customer's address for replies.
 *
 * It's stored in the same transaction as the ticket, so it is the earliest
 * message and lands within moments of the ticket. The time window keeps a
 * later customer reply from being mistaken for it on older mailbox tickets
 * whose first message was never stored. Pure.
 */
const ORIGIN_WINDOW_MS = 60_000;

export function findMailboxOriginMessageId(
  ticket: { createdAt: Date; hasIntake: boolean },
  messages: readonly { id: string; direction: string; createdAt: Date }[],
): string | null {
  if (ticket.hasIntake) return null;
  let first: (typeof messages)[number] | null = null;
  for (const m of messages) {
    if (first === null || m.createdAt < first.createdAt) first = m;
  }
  if (!first || first.direction !== "inbound") return null;
  const gap = first.createdAt.getTime() - ticket.createdAt.getTime();
  return gap >= 0 && gap <= ORIGIN_WINDOW_MS ? first.id : null;
}
