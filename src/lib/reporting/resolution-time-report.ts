import "server-only";
import { getSlaIndicatorForTicket } from "@/lib/sla-engine";
import { getManualResolutionTicket, trackedWorkSeconds } from "@/lib/manual-resolution";
import { prisma } from "@/lib/db";
import { precedingEquivalentRange } from "@/lib/reporting/date-range";
import { summarizeResolutionMinutes, type ResolutionStats } from "@/lib/reporting/stats";
import { reportScopeWhere, type ReportScope } from "@/lib/reporting/report-scope";

export type ResolutionByPriority = Record<string, ResolutionStats>;
export type ResolutionTimeReport = {
  range: { start: Date; end: Date };
  precedingRange: { start: Date; end: Date };
  current: ResolutionByPriority;
  preceding: ResolutionByPriority;
};

/**
 * RPT-02: mean/median resolution time by priority for tickets *resolved*
 * within [start, end). SLA samples use the engine's saved-calendar/current-cycle
 * calculation; manual samples use current-cycle work seconds. Non-SLA mailbox
 * or form tickets retain the legacy creation-to-close turnaround measure.
 */
async function fetchResolutionByPriority(
  scope: ReportScope,
  start: Date,
  end: Date,
): Promise<ResolutionByPriority> {
  const tickets = await prisma.ticket.findMany({
    where: {
      ...reportScopeWhere(scope),
      deletedAt: null,
      closedAt: { gte: start, lt: end },
    },
    select: {
      id: true,
      priority: true,
      createdAt: true,
      closedAt: true,
    },
  });

  const byPriority = new Map<string, number[]>();
  // Bound database fan-out for large exports. Reporting never claims thresholds,
  // sends notifications, or persists reconciliation/backfill to live tickets.
  for (let offset = 0; offset < tickets.length; offset += 6) {
    const samples = await Promise.all(tickets.slice(offset, offset + 6).map(async (ticket) => {
      if (!ticket.closedAt) return null;
      const sla = await getSlaIndicatorForTicket(ticket.id, ticket.closedAt, { readOnly: true });
      let mins: number;
      if (sla) mins = sla.resolution.elapsedMs / 60_000;
      else if (await getManualResolutionTicket(ticket.id)) mins = await trackedWorkSeconds(ticket.id, ticket.closedAt) / 60;
      else mins = Math.max(0, ticket.closedAt.getTime() - ticket.createdAt.getTime()) / 60_000;
      return { priority: ticket.priority, mins };
    }));
    for (const sample of samples) {
      if (!sample) continue;
      const list = byPriority.get(sample.priority) ?? [];
      list.push(sample.mins);
      byPriority.set(sample.priority, list);
    }
  }

  const result: ResolutionByPriority = {};
  for (const [priority, mins] of byPriority) {
    result[priority] = summarizeResolutionMinutes(mins);
  }
  return result;
}

export async function computeResolutionTimeReport(
  scope: ReportScope,
  start: Date,
  end: Date,
): Promise<ResolutionTimeReport> {
  const precedingRange = precedingEquivalentRange(start, end);
  const [current, preceding] = await Promise.all([
    fetchResolutionByPriority(scope, start, end),
    fetchResolutionByPriority(scope, precedingRange.start, precedingRange.end),
  ]);
  return { range: { start, end }, precedingRange, current, preceding };
}
