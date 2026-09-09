import "server-only";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, buildProjectDeptWhere } from "@/lib/dept-scope";
import { timeAgo, formatDuration } from "@/lib/format";
import { normalizeStatus } from "@/components/board/board-types";
import type {
  HomeDashboardData,
  AttentionTask,
  MyProject,
  LedSubDepartment,
  SubDeptTicket,
} from "@/components/dashboard/home-dashboard";
import type { getProfile } from "@/lib/profile";

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

const PRIORITY_TO_UI: Record<string, string> = {
  Critical: "critical",
  Urgent: "urgent",
  High: "high",
  Medium: "medium",
  Low: "low",
};

const AVATAR_CLASSES = ["bg-sts-blue", "bg-sts-purple", "bg-sts-green", "bg-sts-red"];

function entryDuration(
  e: { startedAt: Date; endedAt: Date | null; durationSecs: number | null },
  now: Date,
): number {
  if (e.durationSecs !== null) return e.durationSecs;
  const end = e.endedAt ?? now;
  return Math.max(0, Math.floor((end.getTime() - e.startedAt.getTime()) / 1000));
}

export async function getHomeDashboardData(profile: Profile): Promise<HomeDashboardData> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = (startOfToday.getDay() + 6) % 7;
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const deptScope = await getProfileDeptScope(profile);

  // Sub-departments this user *leads* (holds the sub_manager role in). A
  // sub-manager lands on this personal Home rather than /manager, so we surface
  // a lightweight overview of the team(s) they run alongside their own work.
  // Scoped to the active department when one is set, so switching departments
  // doesn't leak teams from another.
  let ledSubDepartmentIds = (profile.memberships ?? [])
    .filter((m) => m.role === "sub_manager")
    .map((m) => m.subDepartmentId);
  if (deptScope) {
    ledSubDepartmentIds = ledSubDepartmentIds.filter((id) =>
      deptScope.subDepartmentIds.includes(id),
    );
  }
  ledSubDepartmentIds = [...new Set(ledSubDepartmentIds)];

  const ticketWhere = {
    assigneeId: profile.id,
    deletedAt: null,
    ...(deptScope ? { subDepartmentId: { in: deptScope.subDepartmentIds } } : {}),
  };
  const threeDaysOut = new Date(startOfToday);
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);

  const assignedProjectsWhere = {
    userId: profile.id,
    ...(deptScope && !deptScope.isHub
      ? { project: buildProjectDeptWhere(deptScope) }
      : {}),
  };

  const [ticketGroups, myProjectRows, weekEntries, activityRows, overdueGroups, dueWeekGroups] =
    await Promise.all([
      prisma.ticket.groupBy({
        by: ["subDepartmentId", "status", "projectId"],
        where: ticketWhere,
        _count: { _all: true },
      }),
      prisma.projectMember.findMany({
        where: assignedProjectsWhere,
        select: {
          project: { select: { id: true, name: true, slug: true, color: true } },
        },
      }),
      prisma.timeEntry.findMany({
        where: {
          profileId: profile.id,
          startedAt: { gte: startOfWeek, lt: endOfWeek },
          ...(deptScope
            ? {
                OR: [
                  { ticketId: null },
                  { ticket: { subDepartmentId: { in: deptScope.subDepartmentIds }, deletedAt: null } },
                ],
              }
            : {}),
        },
        select: {
          ticketId: true,
          startedAt: true,
          endedAt: true,
          durationSecs: true,
        },
      }),
      prisma.activityLog.findMany({
        // Personalized feed: things the user did, plus activity on tickets they
        // are assigned to or created.
        where: {
          AND: [
            deptScope
              ? { ticket: { subDepartmentId: { in: deptScope.subDepartmentIds }, deletedAt: null } }
              : {},
            {
              OR: [
                { actorId: profile.id },
                { ticket: { assigneeId: profile.id } },
                { ticket: { assignees: { some: { userId: profile.id } } } },
                { ticket: { creatorId: profile.id } },
              ],
            },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          actor: { select: { id: true, name: true, avatarUrl: true } },
          ticket: {
            select: { ticketNumber: true, subDepartment: { select: { prefix: true } } },
          },
        },
      }),
      prisma.ticket.groupBy({
        by: ["subDepartmentId", "status"],
        where: { ...ticketWhere, dueDate: { lt: startOfToday } },
        _count: { _all: true },
      }),
      prisma.ticket.groupBy({
        by: ["subDepartmentId", "status"],
        where: { ...ticketWhere, dueDate: { gte: startOfToday, lt: endOfWeek } },
        _count: { _all: true },
      }),
    ]);

  const secsByDay = [0, 0, 0, 0, 0, 0, 0];
  for (const e of weekEntries) {
    const dayIdx = (e.startedAt.getDay() + 6) % 7;
    secsByDay[dayIdx] += entryDuration(e, now);
  }
  // Status labels are needed both for the caller's own ticket sub-departments
  // and for any teams they lead (whose open/overdue counts we compute below).
  const statusSubDepartmentIds = [
    ...new Set([
      ...ticketGroups.map((t) => t.subDepartmentId),
      ...ledSubDepartmentIds,
    ]),
  ];
  const allSubDepartmentStatuses =
    statusSubDepartmentIds.length > 0
      ? await prisma.subDepartmentStatus.findMany({
          where: { subDepartmentId: { in: statusSubDepartmentIds } },
          select: { subDepartmentId: true, label: true, isComplete: true },
          orderBy: { order: "asc" },
        })
      : [];

  const completeBySubDepartment = new Map<string, Set<string>>();
  const inProgressBySubDepartment = new Map<string, Set<string>>();

  for (const s of allSubDepartmentStatuses) {
    if (s.isComplete) {
      const set = completeBySubDepartment.get(s.subDepartmentId) ?? new Set<string>();
      set.add(s.label);
      completeBySubDepartment.set(s.subDepartmentId, set);
    } else {
      const canonical = normalizeStatus(s.label);
      if (
        canonical === "In Progress" ||
        canonical === "Pull Request" ||
        canonical === "Blocked"
      ) {
        const set = inProgressBySubDepartment.get(s.subDepartmentId) ?? new Set<string>();
        set.add(s.label);
        inProgressBySubDepartment.set(s.subDepartmentId, set);
      }
    }
  }

  const isTicketComplete = (t: { subDepartmentId: string; status: string }) =>
    completeBySubDepartment.get(t.subDepartmentId)?.has(t.status) || normalizeStatus(t.status) === "Live";

  const isTicketInProgress = (t: { subDepartmentId: string; status: string }) =>
    !isTicketComplete(t) &&
    (inProgressBySubDepartment.get(t.subDepartmentId)?.has(t.status) ||
      normalizeStatus(t.status) === "In Progress" ||
      normalizeStatus(t.status) === "Pull Request" ||
      normalizeStatus(t.status) === "Blocked");

  // ── Teams I lead (sub-manager overview) ───────────────────────────────────
  // Aggregate stats, roster, and a recent-ticket feed for each sub-department
  // the caller leads. All counts come from groupBy so we never pull whole
  // ticket sets. Only runs when the user actually leads a team.
  const [ledOpenGroups, ledUnassignedGroups, ledOverdueGroups, ledMemberRows, ledSubDeptRows, recentLedTicketRows] =
    ledSubDepartmentIds.length > 0
      ? await Promise.all([
          prisma.ticket.groupBy({
            by: ["subDepartmentId", "status"],
            where: { subDepartmentId: { in: ledSubDepartmentIds }, deletedAt: null },
            _count: { _all: true },
          }),
          prisma.ticket.groupBy({
            by: ["subDepartmentId", "status"],
            where: { subDepartmentId: { in: ledSubDepartmentIds }, deletedAt: null, assigneeId: null },
            _count: { _all: true },
          }),
          prisma.ticket.groupBy({
            by: ["subDepartmentId", "status"],
            where: { subDepartmentId: { in: ledSubDepartmentIds }, deletedAt: null, dueDate: { lt: startOfToday } },
            _count: { _all: true },
          }),
          prisma.subDepartmentMembership.findMany({
            where: { subDepartmentId: { in: ledSubDepartmentIds }, isActive: true },
            select: {
              subDepartmentId: true,
              role: true,
              user: { select: { id: true, name: true, avatarUrl: true } },
            },
          }),
          prisma.subDepartment.findMany({
            where: { id: { in: ledSubDepartmentIds } },
            select: { id: true, name: true, prefix: true },
          }),
          prisma.ticket.findMany({
            where: { subDepartmentId: { in: ledSubDepartmentIds }, deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 6,
            select: {
              id: true,
              title: true,
              ticketNumber: true,
              status: true,
              priority: true,
              createdAt: true,
              subDepartment: { select: { prefix: true, name: true } },
              assignee: { select: { name: true } },
            },
          }),
        ])
      : [[], [], [], [], [], []];

  const countOpenBySub = (
    groups: { subDepartmentId: string; status: string; _count: { _all: number } }[],
  ) => {
    const m = new Map<string, number>();
    for (const g of groups) {
      if (isTicketComplete(g)) continue;
      m.set(g.subDepartmentId, (m.get(g.subDepartmentId) ?? 0) + g._count._all);
    }
    return m;
  };
  const openBySub = countOpenBySub(ledOpenGroups);
  const unassignedBySub = countOpenBySub(ledUnassignedGroups);
  const overdueBySub = countOpenBySub(ledOverdueGroups);

  const membersBySub = new Map<
    string,
    { id: string; name: string; avatarUrl: string | null; role: string }[]
  >();
  for (const m of ledMemberRows) {
    const list = membersBySub.get(m.subDepartmentId) ?? [];
    list.push({ id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl, role: m.role });
    membersBySub.set(m.subDepartmentId, list);
  }

  const ledSubDepartments: LedSubDepartment[] = ledSubDeptRows
    .map((sd) => ({
      id: sd.id,
      name: sd.name,
      prefix: sd.prefix,
      memberCount: membersBySub.get(sd.id)?.length ?? 0,
      openCount: openBySub.get(sd.id) ?? 0,
      unassignedCount: unassignedBySub.get(sd.id) ?? 0,
      overdueCount: overdueBySub.get(sd.id) ?? 0,
      members: (membersBySub.get(sd.id) ?? []).sort(
        (a, b) =>
          (a.role === "sub_manager" ? 0 : 1) - (b.role === "sub_manager" ? 0 : 1) ||
          a.name.localeCompare(b.name),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const subDepartmentTickets: SubDeptTicket[] = recentLedTicketRows.map((t) => ({
    id: t.id,
    ref: `${t.subDepartment.prefix}-${t.ticketNumber}`,
    title: t.title,
    priority: (PRIORITY_TO_UI[t.priority] ?? "medium") as SubDeptTicket["priority"],
    status: t.status,
    subDepartmentName: t.subDepartment.name,
    assignee: t.assignee?.name?.split(" ")[0] ?? null,
    createdLabel: timeAgo(t.createdAt, now),
  }));

  const sum = (groups: { _count: { _all: number } }[]) => groups.reduce((n, g) => n + g._count._all, 0);
  const openGroups = ticketGroups.filter((t) => !isTicketComplete(t));
  const completedCount = sum(ticketGroups.filter(isTicketComplete));
  const todoCount = sum(openGroups.filter((t) => !isTicketInProgress(t)));
  const inProgressCount = sum(ticketGroups.filter(isTicketInProgress));
  // Fetch details only for the attention list, not every historical assignment.
  const openStatuses = [...new Set(openGroups.map((t) => t.status))];
  const blockedStatuses = openStatuses.filter((s) => normalizeStatus(s) === "Blocked");
  const attentionRows = openStatuses.length ? await prisma.ticket.findMany({
    where: {
      ...ticketWhere,
      status: { in: openStatuses },
      OR: [{ dueDate: { lt: threeDaysOut } }, { status: { in: blockedStatuses } }],
    },
    select: {
      id: true, title: true, ticketNumber: true, priority: true, status: true,
      dueDate: true, subDepartmentId: true,
      subDepartment: { select: { prefix: true } },
    },
    orderBy: { createdAt: "desc" },
  }) : [];
  // A label may be complete in one team and open in another.
  const openTickets = attentionRows.filter((t) => !isTicketComplete(t));

  // ── Personal metrics ──────────────────────────────────────────────────────
  const overdueTickets = openTickets.filter(
    (t) => t.dueDate && t.dueDate < startOfToday && normalizeStatus(t.status) !== "Blocked",
  );
  const overdueCount = sum(overdueGroups.filter((t) => !isTicketComplete(t) && normalizeStatus(t.status) !== "Blocked"));
  const dueThisWeekCount = sum(dueWeekGroups.filter((t) => !isTicketComplete(t)));
  const timeTodaySecs = secsByDay[dayOfWeek];

  // ── Needs attention: overdue → due soon (3d) → blocked ────────────────────
  const isBlocked = (t: { status: string }) => normalizeStatus(t.status) === "Blocked";

  const toAttention = (
    t: (typeof openTickets)[number],
    kind: AttentionTask["kind"],
    dueLabel: string,
  ): AttentionTask => ({
    id: `${t.subDepartment.prefix}-${t.ticketNumber}`,
    dbId: t.id,
    title: t.title,
    priority: (PRIORITY_TO_UI[t.priority] ?? "medium") as AttentionTask["priority"],
    kind,
    dueLabel,
  });

  const attention: AttentionTask[] = [];

  for (const t of [...overdueTickets].sort(
    (a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0),
  )) {
    const d = Math.floor((startOfToday.getTime() - (t.dueDate as Date).getTime()) / 86_400_000);
    attention.push(toAttention(t, "overdue", d <= 0 ? "due today" : `${d}d overdue`));
  }

  const dueSoon = openTickets
    .filter((t) => t.dueDate && t.dueDate >= startOfToday && t.dueDate < threeDaysOut)
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
  for (const t of dueSoon) {
    const days = Math.round(((t.dueDate as Date).getTime() - startOfToday.getTime()) / 86_400_000);
    const label = days <= 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days}d`;
    attention.push(toAttention(t, "due_soon", label));
  }

  const added = new Set(attention.map((a) => a.dbId));
  for (const t of openTickets.filter((t) => isBlocked(t) && !added.has(t.id))) {
    attention.push(toAttention(t, "blocked", "blocked"));
  }

  // ── My projects (with my open-ticket counts) ──────────────────────────────
  const openByProject = new Map<string, number>();
  for (const t of openGroups) {
    if (t.projectId) openByProject.set(t.projectId, (openByProject.get(t.projectId) ?? 0) + t._count._all);
  }
  const projectById = new Map<string, { id: string; name: string; slug: string; color: string | null }>();
  for (const row of myProjectRows) {
    const p = row.project;
    if (p && !projectById.has(p.id)) projectById.set(p.id, p);
  }
  const projects: MyProject[] = [...projectById.values()]
    .map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      color: p.color ?? "#0a76b9",
      openCount: openByProject.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.openCount - a.openCount || a.name.localeCompare(b.name));

  const activity = activityRows.map((a, i) => {
    const humanId = `${a.ticket.subDepartment.prefix}-${a.ticket.ticketNumber}`;
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    let action: string;
    switch (a.action) {
      case "STATUS_CHANGED":
        action =
          meta.to === "Live"
            ? `closed ${humanId}`
            : `moved ${humanId} to ${String(meta.to)}`;
        break;
      case "ASSIGNED":
        action = meta.toName
          ? `assigned ${humanId} to ${meta.toName}`
          : `unassigned ${humanId}`;
        break;
      case "COMMENT_ADDED":
        action = `commented on ${humanId}`;
        break;
      case "ATTACHMENT_ADDED":
        action = `attached a file to ${humanId}`;
        break;
      case "MENTION":
        action = `mentioned ${meta.mentionedName ?? "someone"} on ${humanId}`;
        break;
      case "TICKET_DELETED":
        action = `deleted ${humanId}`;
        break;
      case "TICKET_CREATED":
        action = `created ${humanId}`;
        break;
      default:
        action = `updated ${humanId}`;
    }
    return {
      id: a.id,
      actor: a.actor.id === profile.id ? "You" : a.actor.name.split(" ")[0],
      actorAvatarUrl: a.actor.avatarUrl ?? null,
      action,
      timestamp: timeAgo(a.createdAt, now),
      avatarClass: AVATAR_CLASSES[i % AVATAR_CLASSES.length],
    };
  });

  return {
    dateLine: now.toLocaleDateString("en-GB", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    metrics: {
      open: sum(openGroups),
      overdue: overdueCount,
      dueThisWeek: dueThisWeekCount,
      inProgress: inProgressCount,
      completed: completedCount,
      todo: todoCount,
      timeTodaySecs,
      timeToday: formatDuration(timeTodaySecs),
    },
    attention,
    projects,
    activity,
    ledSubDepartments,
    subDepartmentTickets,
  };
}
