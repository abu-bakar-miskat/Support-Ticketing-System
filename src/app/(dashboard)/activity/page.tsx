import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { prisma } from "@/lib/db";
import { avatarColorFor } from "@/lib/avatar";
import { timeAgo } from "@/lib/format";
import {
  buildActivityLogWhere,
  canViewDeptActivity,
  isOwnActivityOnly,
} from "@/lib/activity-access";
import { ActivityPage, type ActivityItem, type RangePreset } from "@/components/activity/activity-page";
import { ActivityPageSkeleton } from "@/components/skeletons/page-skeletons";

export const metadata = { title: "Activity — Support Ticketing System" };

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

function parseDate(s: string, endOfDay = false): Date {
  if (s.includes("T")) return new Date(s);
  return new Date(s + (endOfDay ? "T23:59:59.999" : "T00:00:00.000"));
}

function resolveRange(preset: string, fromParam?: string, toParam?: string): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "yesterday") return { from: startOfDay(daysAgo(1)), to: endOfDay(daysAgo(1)) };
  if (preset === "last7")     return { from: startOfDay(daysAgo(6)), to: now };
  if (preset === "last30")    return { from: startOfDay(daysAgo(29)), to: now };
  if (preset === "custom" && fromParam && toParam) {
    const f = parseDate(fromParam, false);
    const t = parseDate(toParam,   true);
    if (!isNaN(f.getTime()) && !isNaN(t.getTime()) && f <= t) return { from: f, to: t };
  }
  return { from: startOfDay(now), to: now };
}

async function ActivityData({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const sp = await searchParams;
  const preset   = (sp.preset   ?? "today") as RangePreset;
  const projectId= sp.projectId ?? "";
  const action   = sp.action    ?? "";
  const ownOnly = isOwnActivityOnly(profile);
  const actorId = ownOnly ? profile.id : (sp.actorId ?? "");

  const { from, to } = resolveRange(preset, sp.from, sp.to);

  const deptScope = await getProfileDeptScope(profile);
  const subDepartmentIds = deptScope?.subDepartmentIds ?? [];

  const now = new Date();

  const tenantId = profile.activeTenantId ?? "__no_tenant__";
  const activityWhere = buildActivityLogWhere(profile, subDepartmentIds, {
    from,
    to,
    projectId: projectId || null,
    action: action || null,
    actorId: actorId || null,
  }, tenantId);

  const [rows, memberRows, projectRows, actionCounts, uniqueActors, uniqueTickets, totalEvents] = await Promise.all([
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
      where: ownOnly
        ? { id: profile.id, deletedAt: null }
        : subDepartmentIds.length > 0
          ? {
              deletedAt: null,
              OR: [
                { memberships:         { some: { subDepartmentId: { in: subDepartmentIds }, isActive: true } } },
                { managedDepartments:  { some: { departmentId: deptScope!.activeDeptId } } },
                { directDeptMemberships: { some: { departmentId: deptScope!.activeDeptId } } },
                { departmentAccesses:  { some: { departmentId: deptScope!.activeDeptId } } },
              ],
            }
          : { deletedAt: null, tenantMemberships: { some: { tenantId, isActive: true } } },
      select: { id: true, name: true, avatarUrl: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: subDepartmentIds.length > 0
        ? { OR: [{ subDepartmentId: { in: subDepartmentIds } }, { departmentId: deptScope?.activeDeptId }] }
        : { tenantId },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.activityLog.groupBy({
      by: ["action"],
      where: activityWhere,
      _count: { _all: true },
    }),
    prisma.activityLog.findMany({
      where: activityWhere,
      select: { actorId: true },
      distinct: ["actorId"],
    }).then((r) => r.length),
    prisma.activityLog.findMany({
      where: activityWhere,
      select: { ticketId: true },
      distinct: ["ticketId"],
    }).then((r) => r.length),
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

  const users = memberRows.map((u) => ({
    id: u.id,
    name: u.name,
    avatarUrl: u.avatarUrl ?? null,
    color: avatarColorFor(u.name),
  }));

  const projects = projectRows.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color ?? "#94a3b8",
  }));

  const countByAction = Object.fromEntries(
    actionCounts.map((r) => [r.action, r._count._all]),
  );

  return (
    <ActivityPage
      initialItems={activities}
      initialHasMore={hasMore}
      initialCursor={hasMore ? activities[activities.length - 1].id : null}
      users={users}
      projects={projects}
      totalMembers={uniqueActors}
      totalTickets={uniqueTickets}
      totalEvents={totalEvents}
      countByAction={countByAction}
      currentPreset={preset}
      currentFrom={from.toISOString()}
      currentTo={to.toISOString()}
      currentCustomFrom={sp.from ?? ""}
      currentCustomTo={sp.to ?? ""}
      currentActorId={actorId}
      currentProjectId={projectId}
      currentAction={action}
      canFilterByMember={canViewDeptActivity(profile)}
      ownActivityOnly={ownOnly}
    />
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <Suspense fallback={<ActivityPageSkeleton />}>
      <ActivityData searchParams={searchParams} />
    </Suspense>
  );
}
