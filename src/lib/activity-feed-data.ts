import "server-only";
import { prisma } from "@/lib/db";
import { avatarColorFor } from "@/lib/avatar";
import { timeAgo } from "@/lib/format";
import {
  buildActivityLogWhere,
  canViewDeptActivity,
  isOwnActivityOnly,
} from "@/lib/activity-access";
import type { AuthProfile } from "@/lib/auth";
import type { ResolvedActivityScope } from "@/lib/activity-scope";
import type { ActivityItem, RangePreset } from "@/components/activity/activity-page";

// ── Date-range presets (shared with the /api/activity Load-more path) ──────────

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function parseDate(s: string, toEndOfDay = false): Date {
  if (s.includes("T")) return new Date(s);
  return new Date(s + (toEndOfDay ? "T23:59:59.999" : "T00:00:00.000"));
}

export function resolveRange(
  preset: string,
  fromParam?: string,
  toParam?: string,
): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "yesterday") return { from: startOfDay(daysAgo(1)), to: endOfDay(daysAgo(1)) };
  if (preset === "last7") return { from: startOfDay(daysAgo(6)), to: now };
  if (preset === "last30") return { from: startOfDay(daysAgo(29)), to: now };
  if (preset === "custom" && fromParam && toParam) {
    const f = parseDate(fromParam, false);
    const t = parseDate(toParam, true);
    if (!isNaN(f.getTime()) && !isNaN(t.getTime()) && f <= t) return { from: f, to: t };
  }
  return { from: startOfDay(now), to: now };
}

// ── Props consumed by <ActivityPage> (minus presentation-only basePath/scope) ──

export type ActivityPageData = {
  initialItems: ActivityItem[];
  initialHasMore: boolean;
  initialCursor: string | null;
  users: { id: string; name: string; avatarUrl: string | null; color: string }[];
  projects: { id: string; name: string; color: string }[];
  totalMembers: number;
  totalTickets: number;
  totalEvents: number;
  countByAction: Record<string, number>;
  currentPreset: RangePreset;
  currentFrom: string;
  currentTo: string;
  currentCustomFrom: string;
  currentCustomTo: string;
  currentActorId: string;
  currentProjectId: string;
  currentAction: string;
  canFilterByMember: boolean;
  ownActivityOnly: boolean;
};

/**
 * Loads everything the ticket-activity feed needs for one scope. Shared by the
 * personal /activity page, the all-departments feed and the single-department
 * feed so the three never drift apart (a divergence is exactly what let the
 * ASSIGNMENT_FAILED render crash slip in previously).
 */
export async function buildActivityPageData(
  profile: AuthProfile,
  searchParams: Record<string, string>,
  scope: ResolvedActivityScope,
): Promise<ActivityPageData> {
  const { subDepartmentIds, deptIds, tenantId } = scope;

  const preset = (searchParams.preset ?? "today") as RangePreset;
  const projectId = searchParams.projectId ?? "";
  const action = searchParams.action ?? "";
  const ownOnly = isOwnActivityOnly(profile);
  const actorId = ownOnly ? profile.id : (searchParams.actorId ?? "");

  const { from, to } = resolveRange(preset, searchParams.from, searchParams.to);
  const now = new Date();

  const activityWhere = buildActivityLogWhere(
    profile,
    subDepartmentIds,
    {
      from,
      to,
      projectId: projectId || null,
      action: action || null,
      actorId: actorId || null,
    },
    tenantId,
  );

  // Member filter list — restricted to the scope so the dropdown matches the feed.
  const memberWhere = ownOnly
    ? { id: profile.id, deletedAt: null }
    : subDepartmentIds.length > 0
      ? {
          deletedAt: null,
          OR: [
            { memberships: { some: { subDepartmentId: { in: subDepartmentIds }, isActive: true } } },
            ...(deptIds.length > 0
              ? [
                  { managedDepartments: { some: { departmentId: { in: deptIds } } } },
                  { directDeptMemberships: { some: { departmentId: { in: deptIds } } } },
                  { departmentAccesses: { some: { departmentId: { in: deptIds } } } },
                ]
              : []),
          ],
        }
      : { deletedAt: null, tenantMemberships: { some: { tenantId, isActive: true } } };

  const projectWhere =
    subDepartmentIds.length > 0
      ? {
          OR: [
            { subDepartmentId: { in: subDepartmentIds } },
            ...(deptIds.length > 0 ? [{ departmentId: { in: deptIds } }] : []),
          ],
        }
      : { tenantId };

  const [rows, memberRows, projectRows, actionCounts, uniqueActors, uniqueTickets, totalEvents] =
    await Promise.all([
      prisma.activityLog.findMany({
        where: activityWhere,
        orderBy: { createdAt: "desc" },
        take: 51,
        include: {
          actor: { select: { id: true, name: true, avatarUrl: true, role: true } },
          ticket: {
            select: {
              id: true,
              title: true,
              ticketNumber: true,
              status: true,
              priority: true,
              subDepartment: { select: { id: true, name: true, prefix: true } },
              project: { select: { id: true, name: true, color: true } },
            },
          },
        },
      }),
      prisma.profile.findMany({
        where: memberWhere,
        select: { id: true, name: true, avatarUrl: true },
        orderBy: { name: "asc" },
      }),
      prisma.project.findMany({
        where: projectWhere,
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      }),
      prisma.activityLog.groupBy({
        by: ["action"],
        where: activityWhere,
        _count: { _all: true },
      }),
      prisma.activityLog
        .findMany({ where: activityWhere, select: { actorId: true }, distinct: ["actorId"] })
        .then((r) => r.length),
      prisma.activityLog
        .findMany({ where: activityWhere, select: { ticketId: true }, distinct: ["ticketId"] })
        .then((r) => r.length),
      prisma.activityLog.count({ where: activityWhere }),
    ]);

  const hasMore = rows.length > 50;
  const items = rows.slice(0, 50);

  const activities: ActivityItem[] = items.map((row) => ({
    id: row.id,
    action: row.action as ActivityItem["action"],
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    time: timeAgo(row.createdAt, now),
    actor: {
      id: row.actor.id,
      name: row.actor.name,
      avatarUrl: row.actor.avatarUrl ?? null,
      color: avatarColorFor(row.actor.name),
      role: row.actor.role,
    },
    ticket: {
      id: row.ticket.id,
      humanId: `${row.ticket.subDepartment.prefix}-${row.ticket.ticketNumber}`,
      title: row.ticket.title,
      status: row.ticket.status,
      priority: row.ticket.priority,
      subDepartmentId: row.ticket.subDepartment.id,
      subDepartmentName: row.ticket.subDepartment.name,
      projectId: row.ticket.project?.id ?? null,
      projectName: row.ticket.project?.name ?? null,
      projectColor: row.ticket.project?.color ?? null,
    },
  }));

  return {
    initialItems: activities,
    initialHasMore: hasMore,
    initialCursor: hasMore ? activities[activities.length - 1].id : null,
    users: memberRows.map((u) => ({
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl ?? null,
      color: avatarColorFor(u.name),
    })),
    projects: projectRows.map((p) => ({ id: p.id, name: p.name, color: p.color ?? "#94a3b8" })),
    totalMembers: uniqueActors,
    totalTickets: uniqueTickets,
    totalEvents,
    countByAction: Object.fromEntries(actionCounts.map((r) => [r.action, r._count._all])),
    currentPreset: preset,
    currentFrom: from.toISOString(),
    currentTo: to.toISOString(),
    currentCustomFrom: searchParams.from ?? "",
    currentCustomTo: searchParams.to ?? "",
    currentActorId: actorId,
    currentProjectId: projectId,
    currentAction: action,
    canFilterByMember: canViewDeptActivity(profile),
    ownActivityOnly: ownOnly,
  };
}
