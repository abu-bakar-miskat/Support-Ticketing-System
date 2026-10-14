import "server-only";
import { getSlaIndicatorViewForTicket } from "@/lib/sla-engine";
import { getManualResolutionView } from "@/lib/manual-resolution";
import type { BoardCardData } from "@/components/board/board-types";

// Small batches keep a 25-row page from fanning out across the shared pool.
const CONCURRENCY = 5;

/**
 * Attach the ticket's resolution clock to each card that has one, so the Time
 * column shows resolution elapsed for every viewer (not just the viewer's own
 * logged time): the mailbox SLA clock, or for manual tickets with an estimate
 * the tracked work of all assignees. Read-only: never persists the reconcile
 * side effects the ticket page performs.
 */
export async function attachSlaResolution(cards: BoardCardData[]): Promise<BoardCardData[]> {
  const targets = cards.filter((c) => c.slaResolutionTargetMins != null || (c.estimatedTime ?? 0) > 0);
  if (targets.length === 0) return cards;
  const { runAsSystem } = await import("@/lib/request-scope");
  const now = new Date();
  const byId = new Map<string, BoardCardData["slaResolution"]>();
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    await Promise.all(targets.slice(i, i + CONCURRENCY).map(async (card) => {
      try {
        if (card.slaResolutionTargetMins != null) {
          const view = await runAsSystem(() => getSlaIndicatorViewForTicket(card.dbId, now, { readOnly: true }));
          if (view) byId.set(card.dbId, { elapsedMs: view.resolution.elapsedMs, running: view.resolution.running });
          return;
        }
        // Null for non-manual (intake/mailbox) tickets, which keep logged time.
        const manual = await runAsSystem(() => getManualResolutionView(card.dbId, now));
        if (manual) byId.set(card.dbId, { elapsedMs: manual.trackedSecs * 1000, running: manual.runningCount > 0 });
      } catch {
        // Best-effort: the cell falls back to logged time.
      }
    }));
  }
  return cards.map((c) => (byId.has(c.dbId) ? { ...c, slaResolution: byId.get(c.dbId) } : c));
}
