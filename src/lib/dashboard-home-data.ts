import "server-only";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, buildProjectDeptWhere } from "@/lib/dept-scope";
import { timeAgo, formatDuration } from "@/lib/format";
import { normalizeStatus } from "@/components/board/board-types";
import type { HomeDashboardData, AttentionTask, MyProject } from "@/components/dashboard/home-dashboard";
import type { getProfile } from "@/lib/profile";

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

const PRIORITY_TO_UI: Record<string, string> = {
  Critical: "critical",
  Urgent: "urgent",
  High: "high",
  Medium: "medium",
  Low: "low",
};

const AVATAR_CLASSES = ["bg-pen-blue", "bg-pen-purple", "bg-pen-green", "bg-pen-red"];

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

  const assignedProjectsWhere = {
    userId: profile.id,
    ...(deptScope && !deptScope.isHub
      ? { project: buildProjectDeptWhere(deptScope) }
      : {}),
  };

  const [myTickets, myProjectRows, weekEntries, qaWeekEntries, activityRows] =
    await Promise.all([
      prisma.ticket.findMany({
        where: {
          assigneeId: profile.id,
          deletedAt: null,
          ...(deptScope ? { teamId: { in: deptScope.teamIds } } : {}),
        },
        select: {
          id: true,
          title: true,
          ticketNumber: true,
          priority: true,
          status: true,
          dueDate: true,
          createdAt: true,
          teamId: true,
          projectId: true,
          project: { select: { id: true, name: true, slug: true, color: true } },
          team: { select: { prefix: true } },
          creator: { select: { name: true } },
          parent: {
            select: {
              ticketNumber: true,
              team: { select: { prefix: true } },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
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
          kind: "DEVELOPMENT",
          ...(deptScope
            ? {
                OR: [
                  { ticketId: null },
                  { ticket: { teamId: { in: deptScope.teamIds }, deletedAt: null } },
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
      prisma.timeEntry.findMany({
        where: {
          profileId: profile.id,
          startedAt: { gte: startOfWeek, lt: endOfWeek },
          kind: "QA",
          ...(deptScope
            ? {
                OR: [
                  { ticketId: null },
                  { ticket: { teamId: { in: deptScope.teamIds }, deletedAt: null } },
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
              ? { ticket: { teamId: { in: deptScope.teamIds }, deletedAt: null } }
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
            select: { ticketNumber: true, team: { select: { prefix: true } } },
          },
        },
      }),
    ]);

  const secsByDay = [0, 0, 0, 0, 0, 0, 0];
  for (const e of weekEntries) {
    const dayIdx = (e.startedAt.getDay() + 6) % 7;
    secsByDay[dayIdx] += entryDuration(e, now);
  }
  const qaSecsByDay = [0, 0, 0, 0, 0, 0, 0];
  for (const e of qaWeekEntries) {
    const dayIdx = (e.startedAt.getDay() + 6) % 7;
    qaSecsByDay[dayIdx] += entryDuration(e, now);
  }

  const teamIds = [...new Set(myTickets.map((t) => t.teamId))];
  const allTeamStatuses =
    teamIds.length > 0
      ? await prisma.teamStatus.findMany({
          where: { teamId: { in: teamIds } },
          select: { teamId: true, label: true, isComplete: true },
          orderBy: { order: "asc" },
        })
      : [];

  const completeByTeam = new Map<string, Set<string>>();
  const inProgressByTeam = new Map<string, Set<string>>();

  for (const s of allTeamStatuses) {
    if (s.isComplete) {
      const set = completeByTeam.get(s.teamId) ?? new Set<string>();
      set.add(s.label);
      completeByTeam.set(s.teamId, set);
    } else {
      const canonical = normalizeStatus(s.label);
      if (
        canonical === "In Progress" ||
        canonical === "Pull Request" ||
        canonical === "Blocked"
      ) {
        const set = inProgressByTeam.get(s.teamId) ?? new Set<string>();
        set.add(s.label);
        inProgressByTeam.set(s.teamId, set);
      }
    }
  }

  const isTicketComplete = (t: { teamId: string; status: string }) =>
    completeByTeam.get(t.teamId)?.has(t.status) || normalizeStatus(t.status) === "Live";

  const isTicketInProgress = (t: { teamId: string; status: string }) =>
    !isTicketComplete(t) &&
    (inProgressByTeam.get(t.teamId)?.has(t.status) ||
      normalizeStatus(t.status) === "In Progress" ||
      normalizeStatus(t.status) === "Pull Request" ||
      normalizeStatus(t.status) === "Blocked");

  const openTickets = myTickets.filter((t) => !isTicketComplete(t));
  const completedCount = myTickets.filter(isTicketComplete).length;
  const todoCount = myTickets.filter((t) => !isTicketComplete(t) && !isTicketInProgress(t)).length;
  const inProgressCount = myTickets.filter(isTicketInProgress).length;

  // ── Personal metrics ──────────────────────────────────────────────────────
  const overdueTickets = openTickets.filter(
    (t) => t.dueDate && t.dueDate < startOfToday && normalizeStatus(t.status) !== "Blocked",
  );
  const dueThisWeekTickets = openTickets.filter(
    (t) => t.dueDate && t.dueDate >= startOfToday && t.dueDate < endOfWeek,
  );
  const timeTodaySecs = secsByDay[dayOfWeek];
  const qaTimeTodaySecs = qaSecsByDay[dayOfWeek];

  // ── Needs attention: overdue → due soon (3d) → blocked ────────────────────
  const threeDaysOut = new Date(startOfToday);
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);
  const isBlocked = (t: { status: string }) => normalizeStatus(t.status) === "Blocked";

  const toAttention = (
    t: (typeof openTickets)[number],
    kind: AttentionTask["kind"],
    dueLabel: string,
  ): AttentionTask => ({
    id: `${t.team.prefix}-${t.ticketNumber}`,
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
  for (const t of openTickets) {
    if (t.projectId) openByProject.set(t.projectId, (openByProject.get(t.projectId) ?? 0) + 1);
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
    const humanId = `${a.ticket.team.prefix}-${a.ticket.ticketNumber}`;
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
      open: openTickets.length,
      overdue: overdueTickets.length,
      dueThisWeek: dueThisWeekTickets.length,
      inProgress: inProgressCount,
      completed: completedCount,
      todo: todoCount,
      timeTodaySecs,
      timeToday: formatDuration(timeTodaySecs),
      qaTimeTodaySecs,
      qaTimeToday: formatDuration(qaTimeTodaySecs),
    },
    attention,
    projects,
    activity,
  };
}
