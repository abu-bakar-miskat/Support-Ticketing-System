import "server-only";
import { prisma } from "@/lib/db";
import { precedingEquivalentRange } from "@/lib/reporting/date-range";
import type { ReportScope } from "@/lib/reporting/report-scope";

export type VolumeBucket = { category: string; type: string; count: number };
export type VolumeReport = {
  range: { start: Date; end: Date };
  precedingRange: { start: Date; end: Date };
  current: VolumeBucket[];
  preceding: VolumeBucket[];
};

function scopeWhere(scope: ReportScope) {
  if (scope.kind === "department") return { teamId: { in: scope.teamIds } };
  if (scope.kind === "cross_department") return { tenantId: scope.tenantId };
  return { id: "__none__" }; // matches nothing
}

async function fetchVolumeBuckets(scope: ReportScope, start: Date, end: Date): Promise<VolumeBucket[]> {
  const rows = await prisma.ticket.groupBy({
    by: ["category", "type"],
    where: {
      ...scopeWhere(scope),
      deletedAt: null,
      createdAt: { gte: start, lt: end },
    },
    _count: { _all: true },
  });
  return rows.map((r) => ({
    category: r.category ?? "Uncategorized",
    type: r.type,
    count: r._count._all,
  }));
}

/** RPT-01/03: ticket volume by type/category over a range, vs the preceding equivalent range. */
export async function computeVolumeReport(
  scope: ReportScope,
  start: Date,
  end: Date,
): Promise<VolumeReport> {
  const precedingRange = precedingEquivalentRange(start, end);
  const [current, preceding] = await Promise.all([
    fetchVolumeBuckets(scope, start, end),
    fetchVolumeBuckets(scope, precedingRange.start, precedingRange.end),
  ]);
  return { range: { start, end }, precedingRange, current, preceding };
}
