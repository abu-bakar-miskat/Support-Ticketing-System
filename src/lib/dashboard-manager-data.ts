import "server-only";
import { prisma } from "@/lib/db";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { isBlockedStatus } from "@/lib/format";
import { runAsSystem } from "@/lib/request-scope";
import {
  DONE_STATUSES,
  IN_REVIEW_STATUSES,
  buildMemberWorkloads,
  buildDigest,
  bucketDistribution,
  type OpenTicketRow,
  type ProjectTicketRow,
} from "@/components/manager/aggregate";
import type { getProfile } from "@/lib/profile";
import type { ManagerDashboardData } from "@/components/manager/manager-dashboard-data";

export type { ManagerDashboardData };

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

export async function getManagerDashboardData(profile: Profile): Promise<ManagerDashboardData> {
  return runAsSystem(() => collectManagerDashboardData(profile));
}

async function collectManagerDashboardData(profile: Profile): Promise<ManagerDashboardData> {
  const deptScope = await getProfileDeptScope(profile);
  const subDepartmentIds = deptScope?.subDepartmentIds ?? [];

  if (subDepartmentIds.length === 0) {
    const department = deptScope?.activeDeptId
      ? await prisma.department.findUnique({
          where: { id: deptScope.activeDeptId },
          select: { name: true },
        })
      : null;
    return {
      managerName: profile.name,
      departmentName: department?.name ?? null,
      digest: "No sub departments in your scope.",
      stats: {
        overdue: 0,
        worstDaysLate: 0,
        review: 0,
        prCount: 0,
        unassigned: 0,
        movedToday: 0,
        requests: 0,
      },
      distribution: { total: 0, done: 0, review: 0, active: 0, overdue: 0, todo: 0 },
      overdueGroups: [],
      unassignedGroups: [],
      reviewGroups: [],
      joinRequests: [],
      members: [],
      mailboxes: [],
      supportForms: [],
      canManageForms: false,
      subDepartments: [],
      activity: [],
      activityTotal: 0,
      noSubDepartments: true,
    };
  }

  const nowDhaka = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
  const startOfToday = new Date(
    nowDhaka.getFullYear(),
    nowDhaka.getMonth(),
    nowDhaka.getDate(),
  );

  const FINISHED_STATUSES = ["Live", "Done", "Completed", "Closed"];

  const [
    openTickets,
    allScopedTickets,
    subDepartmentMembers,
    todayActivity,
    pendingJoinRequests,
    subDepartmentRows,
    department,
    mailboxRows,
    supportFormRows,
  ] =
    await Promise.all([
      prisma.ticket.findMany({
        where: {
          deletedAt: null,
          subDepartmentId: { in: subDepartmentIds },
          status: { notIn: FINISHED_STATUSES },
        },
        orderBy: { updatedAt: "desc" },
        take: 500,
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          priority: true,
          status: true,
          dueDate: true,
          updatedAt: true,
          assigneeId: true,
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          creator: { select: { id: true, name: true, avatarUrl: true } },
          subDepartment: { select: { id: true, name: true, prefix: true, color: true } },
          project: { select: { id: true, name: true, color: true } },
          _count: { select: { comments: true } },
        },
      }),
      prisma.ticket.findMany({
        where: { deletedAt: null, subDepartmentId: { in: subDepartmentIds } },
        take: 2000,
        select: {
          status: true,
          dueDate: true,
        },
      }),
      prisma.profile.findMany({
        where: {
          memberships: { some: { subDepartmentId: { in: subDepartmentIds }, isActive: true } },
        },
        select: { id: true, name: true, avatarUrl: true },
        orderBy: { name: "asc" },
      }),
      prisma.activityLog.findMany({
        where: {
          createdAt: { gte: startOfToday },
          ticket: { subDepartmentId: { in: subDepartmentIds }, deletedAt: null },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          action: true,
          createdAt: true,
          metadata: true,
          actor: { select: { id: true, name: true, avatarUrl: true } },
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              subDepartment: { select: { prefix: true } },
            },
          },
        },
      }),
      prisma.joinRequest.findMany({
        where: {
          status: "pending",
          ...(deptScope
            ? {
                OR: [
                  ...(subDepartmentIds.length > 0
                    ? [{ subDepartmentId: { in: subDepartmentIds } }]
                    : []),
                  { departmentId: deptScope.activeDeptId },
                ],
              }
            : {
                OR: [
                  { subDepartment: { tenantId: profile.activeTenantId ?? "__no_tenant__" } },
                  { department: { tenantId: profile.activeTenantId ?? "__no_tenant__" } },
                ],
              }),
        },
        orderBy: { requestedAt: "desc" },
        take: 50,
        select: {
          id: true,
          message: true,
          requestedAt: true,
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          subDepartment: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
      }),
      prisma.subDepartment.findMany({
        where: { id: { in: subDepartmentIds } },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          prefix: true,
          color: true,
          _count: { select: { memberships: { where: { isActive: true } } } },
        },
      }),
      deptScope?.activeDeptId
        ? prisma.department.findUnique({
            where: { id: deptScope.activeDeptId },
            select: { name: true },
          })
        : Promise.resolve(null),
      prisma.mailboxConnection.findMany({
        where: {
          departmentId: deptScope?.activeDeptId ?? "__no_department__",
          subDepartmentId: { in: subDepartmentIds },
        },
        orderBy: { address: "asc" },
        select: {
          id: true,
          address: true,
          isActive: true,
          status: true,
          subDepartment: { select: { name: true } },
        },
      }),
      prisma.intakeFormConfig.findMany({
        where: { departmentId: deptScope?.activeDeptId ?? "__no_department__" },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          isActive: true,
          _count: {
            select: { intakes: { where: { createdAt: { gte: startOfToday } } } },
          },
        },
      }),
    ]);

  const toRow = (t: (typeof openTickets)[number]): OpenTicketRow => ({
    id: t.id,
    humanId: `${t.subDepartment.prefix}-${t.ticketNumber}`,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
    assigneeId: t.assigneeId,
    projectId: t.project?.id ?? null,
    projectName: t.project?.name ?? null,
    projectColor: t.project?.color ?? null,
  });
  const rows = openTickets.map(toRow);

  const overdueRows = openTickets.filter(
    (t) =>
      t.dueDate &&
      t.dueDate < startOfToday &&
      !DONE_STATUSES.includes(t.status) &&
      !isBlockedStatus(t.status),
  );
  const unassignedRows = openTickets.filter(
    (t) => !t.assigneeId && !IN_REVIEW_STATUSES.includes(t.status),
  );
  const reviewRows = openTickets.filter((t) => IN_REVIEW_STATUSES.includes(t.status));

  const toSimple = (t: (typeof openTickets)[number]) => ({
    id: t.id,
    humanId: `${t.subDepartment.prefix}-${t.ticketNumber}`,
    title: t.title,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
    comments: t._count.comments,
    assignee: t.assignee ? { name: t.assignee.name, avatarUrl: t.assignee.avatarUrl ?? null } : null,
    requester: { name: t.creator.name, avatarUrl: t.creator.avatarUrl ?? null },
  });

  const groupBySubDept = (list: typeof openTickets) => {
    const map = new Map<string, { key: string; name: string; color: string; tickets: typeof openTickets }>();
    for (const t of list) {
      const g = map.get(t.subDepartment.id) ?? {
        key: t.subDepartment.id,
        name: t.subDepartment.name,
        color: t.subDepartment.color ?? "#64748b",
        tickets: [],
      };
      g.tickets.push(t);
      map.set(t.subDepartment.id, g);
    }
    return [...map.values()].sort((a, b) => b.tickets.length - a.tickets.length);
  };

  const daysLateOf = (t: (typeof overdueRows)[number]) =>
    Math.floor((startOfToday.getTime() - t.dueDate!.getTime()) / 86_400_000) + 1;

  const overdueGroups = groupBySubDept(overdueRows).map((g) => ({
    key: g.key,
    name: g.name,
    color: g.color,
    worstDaysLate: Math.max(...g.tickets.map(daysLateOf)),
    tickets: g.tickets
      .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
      .map(toSimple),
  }));

  const unassignedGroups = groupBySubDept(unassignedRows).map((g) => ({
    key: g.key,
    name: g.name,
    color: g.color,
    tickets: g.tickets.map(toSimple),
  }));

  const reviewGroups = groupBySubDept(reviewRows).map((g) => ({
    key: g.key,
    name: g.name,
    color: g.color,
    tickets: g.tickets.map(toSimple),
  }));

  const openCountBySubDept = new Map<string, number>();
  for (const t of openTickets) {
    openCountBySubDept.set(t.subDepartment.id, (openCountBySubDept.get(t.subDepartment.id) ?? 0) + 1);
  }
  const overdueCountBySubDept = new Map<string, number>();
  for (const t of overdueRows) {
    overdueCountBySubDept.set(t.subDepartment.id, (overdueCountBySubDept.get(t.subDepartment.id) ?? 0) + 1);
  }
  const subDepartments = subDepartmentRows.map((sd) => ({
    id: sd.id,
    name: sd.name,
    prefix: sd.prefix,
    color: sd.color ?? "#64748b",
    members: sd._count.memberships,
    open: openCountBySubDept.get(sd.id) ?? 0,
    overdue: overdueCountBySubDept.get(sd.id) ?? 0,
  }));

  const lastActivityByActor: Record<string, string> = {};
  for (const a of todayActivity) {
    if (!lastActivityByActor[a.actor.id]) lastActivityByActor[a.actor.id] = a.createdAt.toISOString();
  }
  const movedToday = new Set(
    todayActivity.filter((a) => a.action === "STATUS_CHANGED").map((a) => a.ticket.id),
  ).size;

  const projectRows: ProjectTicketRow[] = allScopedTickets.map((t) => ({
    projectId: null,
    projectName: null,
    projectColor: null,
    status: t.status,
    dueDate: t.dueDate?.toISOString() ?? null,
  }));

  const members = buildMemberWorkloads(subDepartmentMembers, rows, lastActivityByActor, startOfToday);

  const topOverdue = overdueGroups[0] ?? null;
  const ticketDigest = buildDigest({
    overdue: overdueRows.length,
    topOverdueProject: topOverdue?.name ?? null,
    topOverdueCount: topOverdue?.tickets.length ?? 0,
    review: reviewRows.length,
    unassigned: unassignedRows.length,
    movedToday,
    requests: pendingJoinRequests.length,
  });
  const mailboxIssueCount = mailboxRows.filter(
    (mailbox) => !mailbox.isActive || mailbox.status !== "ACTIVE",
  ).length;
  const digest = mailboxIssueCount > 0
    ? `${mailboxIssueCount} shared mailbox${mailboxIssueCount === 1 ? "" : "es"} need attention${ticketDigest.startsWith("All clear") ? "" : ` · ${ticketDigest}`}`
    : ticketDigest;

  return {
    managerName: profile.name,
    departmentName: department?.name ?? null,
    digest,
    stats: {
      overdue: overdueRows.length,
      worstDaysLate: overdueGroups.length > 0 ? Math.max(...overdueGroups.map((g) => g.worstDaysLate)) : 0,
      review: reviewRows.length,
      prCount: reviewRows.filter((t) => t.status.toLowerCase().includes("pull")).length,
      unassigned: unassignedRows.length,
      movedToday,
      requests: pendingJoinRequests.length,
    },
    distribution: bucketDistribution(projectRows, startOfToday),
    overdueGroups,
    unassignedGroups,
    reviewGroups,
    joinRequests: pendingJoinRequests.map((r) => ({
      id: r.id,
      message: r.message ?? "",
      requestedAt: r.requestedAt.toISOString(),
      user: { name: r.user.name, email: r.user.email, avatarUrl: r.user.avatarUrl ?? null },
      target: r.subDepartment?.name ?? r.department?.name ?? "—",
      subDepartmentId: r.subDepartment?.id ?? null,
      departmentId: r.department?.id ?? null,
    })),
    members,
    mailboxes: mailboxRows.map((mailbox) => ({
      id: mailbox.id,
      address: mailbox.address,
      isActive: mailbox.isActive,
      status: mailbox.status,
      subDepartmentName: mailbox.subDepartment.name,
    })),
    supportForms: supportFormRows.map((form) => ({
      id: form.id,
      name: form.name,
      isActive: form.isActive,
      submissionsToday: form._count.intakes,
    })),
    canManageForms:
      profile.role === "admin" ||
      (!!deptScope?.activeDeptId && (profile.departmentAdminIds ?? []).includes(deptScope.activeDeptId)),
    subDepartments,
    activity: todayActivity.slice(0, 30).map((a) => ({
      id: a.id,
      action: a.action,
      createdAt: a.createdAt.toISOString(),
      statusTo:
        a.action === "STATUS_CHANGED" && a.metadata && typeof a.metadata === "object"
          ? ((a.metadata as Record<string, unknown>).to as string | undefined) ?? null
          : null,
      actor: { name: a.actor.name, avatarUrl: a.actor.avatarUrl ?? null },
      ticket: {
        id: a.ticket.id,
        humanId: `${a.ticket.subDepartment.prefix}-${a.ticket.ticketNumber}`,
        title: a.ticket.title,
      },
    })),
    activityTotal: todayActivity.length,
    noSubDepartments: subDepartmentIds.length === 0,
  };
}
