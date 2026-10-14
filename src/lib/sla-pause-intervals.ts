/**
 * Derive SLA pause intervals from the public conversation (Jira-style
 * "Waiting for customer"). Pure — same message rules as ticket-sub-status.ts:
 * non-system messages only; outbound → waiting for customer until the next
 * inbound (or `until`).
 */
import type { ConversationMessage } from "./ticket-sub-status";
import type { SlaPauseInterval } from "./sla-calendar";

const ts = (v: Date | string | number): number => new Date(v).getTime();

/**
 * Build pause intervals for Time to resolution: each agent public reply
 * starts a pause that lasts until the customer replies again (or `until`).
 */
export function waitingForCustomerPauseIntervals(
  messages: readonly ConversationMessage[],
  until: Date,
): SlaPauseInterval[] {
  const publicMsgs = messages
    .filter((m) => m.status !== "system" && m.status !== "quarantined")
    .slice()
    .sort((a, b) => ts(a.createdAt) - ts(b.createdAt));

  const intervals: SlaPauseInterval[] = [];
  const untilMs = until.getTime();

  for (let i = 0; i < publicMsgs.length; i++) {
    const msg = publicMsgs[i]!;
    if (msg.direction !== "outbound") continue;

    const pauseFrom = new Date(ts(msg.createdAt));
    let pauseTo = until;
    for (let j = i + 1; j < publicMsgs.length; j++) {
      const next = publicMsgs[j]!;
      if (next.direction === "inbound") {
        pauseTo = new Date(ts(next.createdAt));
        break;
      }
    }

    if (pauseTo.getTime() > pauseFrom.getTime() && pauseFrom.getTime() < untilMs) {
      intervals.push({
        from: pauseFrom,
        to: new Date(Math.min(pauseTo.getTime(), untilMs)),
      });
    }
  }

  return intervals;
}
