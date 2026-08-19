import "server-only";
import { prisma } from "@/lib/db";
import { precedingEquivalentRange } from "@/lib/reporting/date-range";
import { summarizeResolutionMinutes, type ResolutionStats } from "@/lib/reporting/stats";
import type { ReportScope } from "@/lib/reporting/report-scope";

export type ResolutionByPriority = Record<string, ResolutionStats>;
export type ResolutionTimeReport = {
  range: { start: Date; end: Date };
  precedingRange: { start: Date; end: Date };
  current: ResolutionByPriority;
  preceding: ResolutionByPriority;
};

function scopeWhere(scope: ReportScope) {
  if (scope.kind === "department") return { subDepartmentId: { in: scope.subDepartmentIds } };
  if (scope.kind === "cross_department") return { tenantId: scope.tenantId };
  return { id: "__none__" };
}

/**
 * RPT-02: mean/median resolution time by priority for tickets *resolved*
 * within [start, end). Prefers the SlaTimer's resolution window (accounts
 * for pause/reopen, slice 10) when a timer exists; falls back to
 * createdAt→closedAt for tickets with no matching SLA policy.
 */
async function fetchResolutionByPriority(
  scope: ReportScope,
  start: Date,
  end: Date,
): Promise<ResolutionByPriority> {
  const tickets = await prisma.ticket.findMany({
    where: {
      ...scopeWhere(scope),
      deletedAt: null,
      closedAt: { gte: start, lt: end },
    },
    select: {
      priority: true,
      createdAt: true,
      closedAt: true,
      slaTimer: { select: { resolutionStartedAt: true, resolutionStoppedAt: true } },
    },
  });

  const byPriority = new Map<string, number[]>();
  for (const t of tickets) {
    const startedAt = t.slaTimer?.resolutionStartedAt ?? t.createdAt;
    const stoppedAt = t.slaTimer?.resolutionStoppedAt ?? t.closedAt;
    if (!stoppedAt) continue;
    const mins = (stoppedAt.getTime() - startedAt.getTime()) / 60_000;
    const list = byPriority.get(t.priority) ?? [];
    list.push(mins);
    byPriority.set(t.priority, list);
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
