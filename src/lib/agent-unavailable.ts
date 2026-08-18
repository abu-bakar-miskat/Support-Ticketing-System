/**
 * "Waiting — agent unavailable" ticket flag (SRS WH-04, slice 12). A ticket
 * already assigned to a user gets this label the moment that user becomes
 * unavailable (holiday or outside working hours) and loses it once they're
 * available again. Reuses the generic Ticket.labels array — same mechanism
 * as the Reopened label (ticket-column-moves.ts) — so existing board label
 * filtering (labelsIn / matchesLabelFilter) picks it up with no extra
 * plumbing.
 *
 * Availability changes on its own as time passes (schedule window edges,
 * holiday start/end) rather than only on explicit user action, so this can't
 * be purely event-driven: schedule/holiday routes call
 * syncAgentUnavailableFlagForUser for an immediate update, and the cron sweep
 * (sweepAgentUnavailableFlags) catches the passive transitions in between —
 * mirrors sweepSlaChecks in lib/sla-engine.ts.
 */
import { prisma } from "@/lib/db";
import { isMemberAvailableNow } from "@/lib/rota";

export const AGENT_UNAVAILABLE_LABEL = "Waiting — agent unavailable";

export function applyAgentUnavailableLabel(labels: readonly string[]): string[] {
  return labels.includes(AGENT_UNAVAILABLE_LABEL) ? [...labels] : [...labels, AGENT_UNAVAILABLE_LABEL];
}

export function clearAgentUnavailableLabel(labels: readonly string[]): string[] {
  return labels.filter((l) => l !== AGENT_UNAVAILABLE_LABEL);
}

/**
 * Re-checks every open ticket assigned to `userId` against their current
 * availability (same predicate ASG-04 uses to exclude them from
 * auto-assignment) and adds/clears the flag accordingly. Best-effort — never
 * throws, so callers can fire it without risking the primary request.
 */
export async function syncAgentUnavailableFlagForUser(
  userId: string,
): Promise<{ flagged: number; cleared: number }> {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { assigneeId: userId, deletedAt: null, closedAt: null },
      select: { id: true, subDepartmentId: true, labels: true },
    });
    if (tickets.length === 0) return { flagged: 0, cleared: 0 };

    const teamIds = [...new Set(tickets.map((t) => t.subDepartmentId))];
    const availabilityByTeam = new Map(
      await Promise.all(
        teamIds.map(async (teamId) => [teamId, await isMemberAvailableNow(userId, teamId)] as const),
      ),
    );

    let flagged = 0;
    let cleared = 0;
    await Promise.all(
      tickets.map(async (t) => {
        const available = availabilityByTeam.get(t.subDepartmentId) ?? true;
        const hasLabel = t.labels.includes(AGENT_UNAVAILABLE_LABEL);
        if (!available && !hasLabel) {
          await prisma.ticket.update({ where: { id: t.id }, data: { labels: applyAgentUnavailableLabel(t.labels) } });
          flagged++;
        } else if (available && hasLabel) {
          await prisma.ticket.update({ where: { id: t.id }, data: { labels: clearAgentUnavailableLabel(t.labels) } });
          cleared++;
        }
      }),
    );
    return { flagged, cleared };
  } catch {
    return { flagged: 0, cleared: 0 };
  }
}

/**
 * Cron sweep: re-syncs the flag for every user who currently holds an open
 * assigned ticket, catching the passive transitions (end of working hours,
 * holiday start/end) that no request triggers.
 */
export async function sweepAgentUnavailableFlags(): Promise<{ checked: number; flagged: number; cleared: number }> {
  const rows = await prisma.ticket.findMany({
    where: { assigneeId: { not: null }, deletedAt: null, closedAt: null },
    select: { assigneeId: true },
    distinct: ["assigneeId"],
  });
  const userIds = rows.map((r) => r.assigneeId as string);

  let flagged = 0;
  let cleared = 0;
  for (const userId of userIds) {
    const result = await syncAgentUnavailableFlagForUser(userId);
    flagged += result.flagged;
    cleared += result.cleared;
  }
  return { checked: userIds.length, flagged, cleared };
}
