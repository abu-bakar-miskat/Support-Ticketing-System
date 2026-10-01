import "server-only";
import { prisma } from "@/lib/db";
import {
  collectAuditLookupIds,
  templateIdsFromFeatureRequests,
  type AuditLookups,
} from "@/lib/audit-display";

type LookupEvent = {
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
};

/** Names for templates, departments, and feature requests referenced by audit rows. */
export async function loadAuditLookups(events: LookupEvent[]): Promise<AuditLookups> {
  const ids = collectAuditLookupIds(events);
  const featureRequests = ids.featureRequestIds.length
    ? await prisma.featureRequest.findMany({
        where: { id: { in: ids.featureRequestIds } },
        select: { id: true, featureKey: true },
      })
    : [];
  const templateIds = [
    ...new Set([...ids.templateIds, ...templateIdsFromFeatureRequests(featureRequests.map((row) => row.featureKey))]),
  ];
  const [departments, templates] = await Promise.all([
    ids.departmentIds.length
      ? prisma.department.findMany({
          where: { id: { in: ids.departmentIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    templateIds.length
      ? prisma.template.findMany({
          where: { id: { in: templateIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    departments: new Map(departments.map((row) => [row.id, row.name])),
    templates: new Map(templates.map((row) => [row.id, row.name])),
    featureRequests: new Map(featureRequests.map((row) => [row.id, row.featureKey])),
  };
}
