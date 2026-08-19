import "server-only";
import { prisma } from "@/lib/db";
import { resolveFormFieldTicketIds, type FormFieldFilter } from "@/lib/board-search";
import type { ReportScope } from "@/lib/reporting/report-scope";

export type CustomFieldBucket = { value: string; count: number };

function scopeWhere(scope: ReportScope) {
  if (scope.kind === "department") return { subDepartmentId: { in: scope.subDepartmentIds } };
  if (scope.kind === "cross_department") return { tenantId: scope.tenantId };
  return { id: "__none__" };
}

/**
 * RPT-04: a department's own custom report — group ticket counts by one
 * form field's submitted value, optionally filtered by other field/value
 * pairs (reusing the same filter resolver #17's board search uses).
 */
export async function computeCustomFieldReport(params: {
  scope: ReportScope;
  start: Date;
  end: Date;
  groupByFieldId: string;
  filters?: FormFieldFilter[];
}): Promise<CustomFieldBucket[]> {
  const tickets = await prisma.ticket.findMany({
    where: {
      ...scopeWhere(params.scope),
      deletedAt: null,
      createdAt: { gte: params.start, lt: params.end },
      intake: { isNot: null },
    },
    select: { id: true, intake: { select: { responses: true } } },
  });

  let scoped = tickets;
  if (params.filters?.length) {
    const matchingIds = new Set(
      await resolveFormFieldTicketIds(params.filters, tickets.map((t) => t.id)),
    );
    scoped = tickets.filter((t) => matchingIds.has(t.id));
  }

  const counts = new Map<string, number>();
  for (const t of scoped) {
    const responses = Array.isArray(t.intake?.responses)
      ? (t.intake!.responses as { fieldId?: unknown; value?: unknown }[])
      : [];
    const match = responses.find((r) => r.fieldId === params.groupByFieldId);
    const value = match && match.value != null && String(match.value).trim() ? String(match.value) : "(no value)";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}
