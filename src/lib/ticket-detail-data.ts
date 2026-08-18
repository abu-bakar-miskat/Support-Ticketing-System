import "server-only";

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getTeamStatuses } from "@/lib/board-data";
import {
  getMentionableProjectMembers,
  getMentionableUsersForTicketDept,
} from "@/lib/mentionable-users";
import { fetchProjectDepartmentPeople, assertUsersEligibleForProjectDepartment } from "@/lib/project-department-people";
import { canEditTicket, canEditTicketDescription, canDeleteTicket } from "@/lib/ticket-date-permissions";
import { RESEND_RECEIVING_ENABLED } from "@/lib/email-config";
import { buildTicketEditContext } from "@/lib/cross-access";
import { isDueOverdue, isBlockedStatus } from "@/lib/format";
import { serializeTicketDateIso } from "@/lib/ticket-datetime";
import { buildGitHubDevData } from "@/lib/github/dev-data";
import type { getProfile } from "@/lib/profile";

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

const PRIORITY_TO_UI: Record<string, string> = {
  Critical: "critical",
  Urgent: "urgent",
  High: "high",
  Medium: "medium",
  Low: "low",
};

const ticketCoreInclude = {
  team: {
    select: { id: true, prefix: true, name: true, departmentId: true },
  },
  project: { select: { name: true, color: true, kind: true, moduleSystemEnabled: true } },
  module: { select: { id: true, name: true } },
  sprint: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  creator: { select: { id: true, name: true, avatarUrl: true } },
  assignees: {
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
  qaAssignees: {
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
  estimates: {
    select: { userId: true, estimatedMinutes: true, targetDate: true },
  },
  parent: {
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      team: { select: { prefix: true } },
    },
  },
  subTickets: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" as const },
    include: {
      team: { select: { prefix: true } },
      assignee: { select: { name: true, avatarUrl: true } },
    },
  },
  intake: {
    include: {
      formConfig: { select: { name: true, allowCustomerReplies: true } },
    },
  },
  pullRequests: { include: { pr: true } },
  commits: { orderBy: { createdAt: "desc" as const } },
} as const;

// ── Cached lookups ────────────────────────────────────────────────────────────
// These are semi-static (team/department config and membership) but cost many
// ~200ms round-trips to the remote database per ticket open. Short revalidate
// windows keep them fresh enough while making repeat opens fast.

export const getCachedTeamStatuses = (teamId: string) =>
  unstable_cache(
    () => getTeamStatuses(teamId),
    ["ticket-detail-team-statuses", teamId],
    { revalidate: 120 },
  )();

export const getCachedMentionableUsers = (
  departmentId: string | null,
  ticketTeamId: string,
) =>
  unstable_cache(
    () => getMentionableUsersForTicketDept(departmentId, ticketTeamId),
    ["ticket-detail-mentionable", departmentId ?? "none", ticketTeamId],
    { revalidate: 300 },
  )();

const getCachedProjectMembers = (projectId: string) =>
  unstable_cache(
    () => getMentionableProjectMembers(projectId),
    ["ticket-detail-project-members", projectId],
    { revalidate: 300 },
  )();

/** @all audience for a ticket: project members if attached, else team/dept. */
const getCachedTicketMentionable = (
  projectId: string | null,
  departmentId: string | null,
  ticketTeamId: string,
) =>
  projectId
    ? getCachedProjectMembers(projectId)
    : getCachedMentionableUsers(departmentId, ticketTeamId);

const getCachedDeptPeople = (departmentId: string | null) =>
  unstable_cache(
    () => fetchProjectDepartmentPeople(departmentId),
    ["ticket-detail-dept-people", departmentId ?? "none"],
    { revalidate: 300 },
  )();

export type AssignableUser = {
  id: string;
  name: string;
  avatarUrl: string | null;
  departmentName: string | null;
  teamName: string | null;
};

/** Dept members and cross-access grants eligible as assignees. */
export async function getAssignableUsersForTicketDepartment(
  departmentId: string | null,
  extras: Array<{ id: string; name: string; avatarUrl: string | null }> = [],
): Promise<AssignableUser[]> {
  const deptPeople = await getCachedDeptPeople(departmentId);

  const byId = new Map<string, AssignableUser>();

  for (const u of deptPeople) {
    byId.set(u.id, {
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      departmentName: u.departmentName,
      teamName: u.teamName,
    });
  }

  for (const u of extras) {
    if (!byId.has(u.id)) {
      byId.set(u.id, {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl ?? null,
        departmentName: null,
        teamName: null,
      });
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function assertAssigneeEligibleForTicket(
  ticket: { teamId: string; team: { departmentId: string | null } },
  assigneeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const assigneeProfile = await prisma.profile.findUnique({
    where: { id: assigneeId },
    select: { id: true, teamId: true, role: true },
  });
  if (!assigneeProfile) {
    return { ok: false, error: "Assignee not found" };
  }

  const deptId = ticket.team.departmentId;
  if (deptId) {
    const eligibility = await assertUsersEligibleForProjectDepartment(deptId, [
      assigneeId,
    ]);
    if (!eligibility.ok) {
      return {
        ok: false,
        error: "Assignee must belong to the ticket's department",
      };
    }
    return { ok: true };
  }

  const onTicketTeam =
    assigneeProfile.teamId === ticket.teamId ||
    !!(await prisma.teamMembership.findFirst({
      where: { userId: assigneeId, teamId: ticket.teamId, isActive: true },
      select: { userId: true },
    }));

  if (!onTicketTeam) {
    return { ok: false, error: "Assignee must belong to the ticket's team" };
  }

  return { ok: true };
}

async function fetchTicketComments(ticketId: string) {
  return prisma.comment.findMany({
    // messageId: null → exclude notes attached to a specific email message;
    // those render under their message, not in the general comments thread.
    where: { ticketId, parentId: null, messageId: null, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      attachments: {
        select: {
          id: true,
          storageUrl: true,
          fileName: true,
          fileSize: true,
        },
      },
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
          attachments: {
            select: {
              id: true,
              storageUrl: true,
              fileName: true,
              fileSize: true,
            },
          },
        },
      },
    },
  });
}

async function fetchTicketMessages(ticketId: string) {
  return prisma.ticketMessage.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      attachments: {
        select: { id: true, storageUrl: true, fileName: true, fileSize: true },
      },
      // Internal notes attached to this specific message (staff-only).
      notes: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  });
}

async function fetchTicketActivity(ticketId: string) {
  return prisma.activityLog.findMany({
    where: { ticketId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: { select: { name: true } } },
  });
}

export async function getTicketDetailRecord(id: string) {
  return prisma.ticket.findUnique({
    where: { id },
    include: ticketCoreInclude,
  });
}

export async function getTicketDetailPayload(
  profile: Profile,
  ticketId: string,
  ticket: NonNullable<Awaited<ReturnType<typeof getTicketDetailRecord>>>,
) {
  const ticketDeptId = ticket.team.departmentId;

  const [
    comments,
    messages,
    activityLogs,
    mentionableUsers,
    teamMembers,
    teamStatuses,
    ticketTimeEntries,
    ticketEditContext,
    github,
  ] = await Promise.all([
    fetchTicketComments(ticketId),
    fetchTicketMessages(ticketId),
    fetchTicketActivity(ticketId),
    getCachedTicketMentionable(ticket.projectId, ticketDeptId, ticket.teamId),
    getAssignableUsersForTicketDepartment(ticketDeptId, [
      ...(ticket.assignee
        ? [
            {
              id: ticket.assignee.id,
              name: ticket.assignee.name,
              avatarUrl: ticket.assignee.avatarUrl ?? null,
            },
          ]
        : []),
      ...ticket.assignees.map((a) => ({
        id: a.user.id,
        name: a.user.name,
        avatarUrl: a.user.avatarUrl ?? null,
      })),
      ...ticket.qaAssignees.map((a) => ({
        id: a.user.id,
        name: a.user.name,
        avatarUrl: a.user.avatarUrl ?? null,
      })),
    ]),
    getCachedTeamStatuses(ticket.teamId),
    prisma.timeEntry.findMany({
      where: { ticketId },
      include: {
        profile: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { startedAt: "asc" },
    }),
    buildTicketEditContext(profile, {
      assigneeId: ticket.assigneeId,
      creatorId: ticket.creatorId,
      teamId: ticket.teamId,
      projectId: ticket.projectId,
      team: ticket.team,
      assignees: ticket.assignees,
    }),
    buildGitHubDevData(ticket),
  ]);

  const timeByUser = new Map<
    string,
    {
      userId: string;
      userName: string;
      avatarUrl: string | null;
      totalSecs: number;
      isRunning: boolean;
      runningStartedAt: string | null;
      sessions: {
        id: string;
        startedAt: string;
        endedAt: string | null;
        durationSecs: number | null;
      }[];
    }
  >();
  const qaTimeByUser = new Map<
    string,
    {
      userId: string;
      userName: string;
      avatarUrl: string | null;
      totalSecs: number;
      isRunning: boolean;
      runningStartedAt: string | null;
      sessions: {
        id: string;
        startedAt: string;
        endedAt: string | null;
        durationSecs: number | null;
      }[];
    }
  >();
  for (const entry of ticketTimeEntries) {
    const target = entry.kind === "QA" ? qaTimeByUser : timeByUser;
    const existing = target.get(entry.profileId) ?? {
      userId: entry.profileId,
      userName: entry.profile.name,
      avatarUrl: entry.profile.avatarUrl ?? null,
      totalSecs: 0,
      isRunning: false,
      runningStartedAt: null,
      sessions: [],
    };
    if (entry.endedAt) {
      existing.totalSecs += entry.durationSecs ?? 0;
    } else {
      existing.isRunning = true;
      existing.runningStartedAt = entry.startedAt.toISOString();
    }
    // newest first
    existing.sessions.unshift({
      id: entry.id,
      startedAt: entry.startedAt.toISOString(),
      endedAt: entry.endedAt ? entry.endedAt.toISOString() : null,
      durationSecs: entry.durationSecs ?? null,
    });
    target.set(entry.profileId, existing);
  }

  // Roll up time logged on this ticket's sub-tickets, shown on the parent.
  const subTicketIds = ticket.subTickets.map((s) => s.id);
  const subTicketEntries = subTicketIds.length
    ? await prisma.timeEntry.findMany({
        where: { ticketId: { in: subTicketIds }, endedAt: { not: null } },
        include: { profile: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { startedAt: "desc" },
      })
    : [];

  const subInfo = new Map(
    ticket.subTickets.map((s) => [
      s.id,
      { humanId: `${s.team.prefix}-${s.ticketNumber}`, title: s.title },
    ]),
  );
  const subPerTicketSecs = new Map<string, number>();
  const subTicketSessions: {
    id: string;
    subTicketDbId: string;
    subTicketHumanId: string;
    subTicketTitle: string;
    userName: string;
    avatarUrl: string | null;
    startedAt: string;
    endedAt: string | null;
    durationSecs: number;
    kind: string;
  }[] = [];
  let subTicketTotalSecs = 0;
  for (const e of subTicketEntries) {
    const secs = e.durationSecs ?? 0;
    subTicketTotalSecs += secs;
    subPerTicketSecs.set(e.ticketId!, (subPerTicketSecs.get(e.ticketId!) ?? 0) + secs);
    const info = subInfo.get(e.ticketId!);
    subTicketSessions.push({
      id: e.id,
      subTicketDbId: e.ticketId!,
      subTicketHumanId: info?.humanId ?? "",
      subTicketTitle: info?.title ?? "",
      userName: e.profile.name,
      avatarUrl: e.profile.avatarUrl ?? null,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt ? e.endedAt.toISOString() : null,
      durationSecs: secs,
      kind: e.kind,
    });
  }
  const subTicketTime = {
    totalSecs: subTicketTotalSecs,
    perTicket: ticket.subTickets
      .map((s) => ({
        dbId: s.id,
        humanId: `${s.team.prefix}-${s.ticketNumber}`,
        title: s.title,
        totalSecs: subPerTicketSecs.get(s.id) ?? 0,
      }))
      .filter((t) => t.totalSecs > 0)
      .sort((a, b) => b.totalSecs - a.totalSecs),
    sessions: subTicketSessions,
  };

  const myActiveEntry = ticketTimeEntries.find(
    (e) => e.profileId === profile.id && !e.endedAt && e.kind !== "QA",
  );
    const isCurrentUserAssignee =
    ticket.assigneeId === profile.id ||
    ticket.assignees.some((a) => a.user.id === profile.id);
  const isCurrentUserQa = ticket.qaAssignees.some(
    (a) => a.user.id === profile.id,
  );

  const now = Date.now();
  const openedDaysAgo = Math.max(
    0,
    Math.floor((now - ticket.createdAt.getTime()) / 86_400_000),
  );
  const dueOverdue =
    isDueOverdue(ticket.dueDate, new Date(now)) && !isBlockedStatus(ticket.status);

  // A sub-ticket counts as complete when its status is one flagged
  // `isComplete` on its own team. Sub-tickets may live on a different team
  // than the parent, so resolve the complete-status labels per team.
  const subTeamIds = [...new Set(ticket.subTickets.map((st) => st.teamId))];
  const completeStatusRows = subTeamIds.length
    ? await prisma.teamStatus.findMany({
        where: { teamId: { in: subTeamIds }, isComplete: true },
        select: { teamId: true, label: true },
      })
    : [];
  const completeSubStatuses = new Set(
    completeStatusRows.map((r) => `${r.teamId}::${r.label}`),
  );

  const canEdit = canEditTicket(profile, ticketEditContext);
  const canEditDescription = canEditTicketDescription(profile, ticketEditContext);

  return {
    dbId: ticket.id,
    ticketId: `${ticket.team.prefix}-${ticket.ticketNumber}`,
    projectId: ticket.projectId,
    teamId: ticket.teamId,
    projectName: ticket.project?.name ?? "Miscellaneous",
    projectColor: ticket.project?.color ?? "#0a76b9",
    projectKind: ticket.project?.kind ?? "standard",
    projectModuleSystemEnabled: ticket.project?.moduleSystemEnabled ?? false,
    moduleId: ticket.moduleId ?? null,
    moduleName: ticket.module?.name ?? null,
    sprintId: ticket.sprintId ?? null,
    sprintName: ticket.sprint?.name ?? null,
    title: ticket.title,
    description: ticket.description,
    templateId: ticket.templateId ?? null,
    templateData:
      (ticket.templateData as Record<string, unknown> | null) ?? null,
    status: ticket.status,
    priority: PRIORITY_TO_UI[ticket.priority] ?? "medium",
    labels: ticket.labels,
    openedBy: ticket.creator.name.split(" ")[0],
    openedDaysAgo,
    createdAtIso: ticket.createdAt.toISOString(),
    creatorName: ticket.creator.name,
    creatorAvatarUrl: ticket.creator.avatarUrl ?? null,
    assigneeId: ticket.assignee?.id ?? null,
    assigneeName: ticket.assignee?.name ?? null,
    assigneeAvatarUrl: ticket.assignee?.avatarUrl ?? null,
    coAssignees: ticket.assignees.map((a) => ({
      id: a.user.id,
      name: a.user.name,
      avatarUrl: a.user.avatarUrl ?? null,
    })),
    qaAssignees: ticket.qaAssignees.map((a) => ({
      id: a.user.id,
      name: a.user.name,
      avatarUrl: a.user.avatarUrl ?? null,
    })),
    currentUserId: profile.id,
    currentUserName: profile.name,
    startDateIso: ticket.startDate ? serializeTicketDateIso(ticket.startDate, "start") : null,
    dueDateIso: ticket.dueDate ? serializeTicketDateIso(ticket.dueDate, "due") : null,
    dueDate: ticket.dueDate
      ? ticket.dueDate.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        })
      : null,
    closedAtIso: ticket.closedAt ? ticket.closedAt.toISOString() : null,
    dueOverdue,
    canEditDates: canEdit,
    canChangeStatus: canEdit,
    canDelete: canDeleteTicket(profile, { creatorId: ticket.creatorId }),
    canEditTicket: canEdit,
    canEditDescription,
    storyPoints: ticket.storyPoints ?? null,
    estimatedTime: ticket.estimatedTime ?? null,
    personalEstimates: ticket.estimates.map((e) => ({
      userId: e.userId,
      estimatedMinutes: e.estimatedMinutes ?? null,
      targetDateIso: e.targetDate ? serializeTicketDateIso(e.targetDate, "due") : null,
    })),
    assetLinks: (ticket.assetLinks as { label: string; url: string }[]) ?? [],
    timeEntries: [...timeByUser.values()],
    qaTimeEntries: [...qaTimeByUser.values()],
    subTicketTime,
    myActiveTimerId: myActiveEntry?.id ?? null,
    myActiveTimerStartedAt: myActiveEntry?.startedAt.toISOString() ?? null,
    isCurrentUserAssignee,
    isCurrentUserQa,
    parentTicket: ticket.parent
      ? {
          dbId: ticket.parent.id,
          humanId: `${ticket.parent.team.prefix}-${ticket.parent.ticketNumber}`,
          title: ticket.parent.title,
        }
      : null,
    teamMembers,
    mentionableUsers,
    teamStatuses,
    subTickets: ticket.subTickets.map((st) => ({
      dbId: st.id,
      humanId: `${st.team.prefix}-${st.ticketNumber}`,
      title: st.title,
      status: st.status,
      done: completeSubStatuses.has(`${st.teamId}::${st.status}`),
      priority: PRIORITY_TO_UI[st.priority] ?? "medium",
      assigneeName: st.assignee?.name ?? null,
      assigneeAvatarUrl: st.assignee?.avatarUrl ?? null,
      canDelete: canDeleteTicket(profile, { creatorId: st.creatorId }),
    })),
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      editedAt: c.editedAt?.toISOString() ?? null,
      deletedAt: c.deletedAt?.toISOString() ?? null,
      authorId: c.author.id,
      authorName: c.author.name,
      authorAvatarUrl: c.author.avatarUrl,
      attachments: c.attachments.map((a) => ({
        id: a.id,
        storageUrl: a.storageUrl,
        fileName: a.fileName,
        fileSize: a.fileSize,
      })),
      replies: c.replies.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        editedAt: r.editedAt?.toISOString() ?? null,
        deletedAt: r.deletedAt?.toISOString() ?? null,
        authorId: r.author.id,
        authorName: r.author.name,
        authorAvatarUrl: r.author.avatarUrl,
        attachments: r.attachments.map((a) => ({
          id: a.id,
          storageUrl: a.storageUrl,
          fileName: a.fileName,
          fileSize: a.fileSize,
        })),
        replies: [],
      })),
    })),
    activity: activityLogs.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actor.name,
      createdAt: a.createdAt.toISOString(),
      metadata: (a.metadata ?? {}) as Record<string, unknown>,
    })),
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      status: m.status,
      throttled: m.throttled,
      body: m.bodyHtml,
      fromName: m.fromName,
      fromEmail: m.fromEmail,
      authorId: m.author?.id ?? null,
      authorName: m.author?.name ?? null,
      authorAvatarUrl: m.author?.avatarUrl ?? null,
      createdAt: m.createdAt.toISOString(),
      attachments: m.attachments.map((a) => ({
        id: a.id,
        storageUrl: a.storageUrl,
        fileName: a.fileName,
        fileSize: a.fileSize,
      })),
      notes: m.notes.map((n) => ({
        id: n.id,
        body: n.body,
        authorId: n.author.id,
        authorName: n.author.name,
        authorAvatarUrl: n.author.avatarUrl ?? null,
        createdAt: n.createdAt.toISOString(),
        editedAt: n.editedAt?.toISOString() ?? null,
      })),
    })),
    customerReply: (() => {
      // Ticket #16: a mailbox-connection-originated ticket (#14) has no
      // `intake` row — fall back to the most recent inbound message's
      // sender so the Reply composer still works for those tickets.
      const lastInbound = ticket.intake
        ? null
        : [...messages].reverse().find((m) => m.direction === "inbound");
      const customerName = ticket.intake?.submitterName ?? lastInbound?.fromName ?? null;
      const customerEmail = ticket.intake?.submitterEmail ?? lastInbound?.fromEmail ?? null;
      return {
        // Composer shown only when receiving is configured, the form (when
        // there is one) permits replies, and there's a known customer address.
        enabled:
          RESEND_RECEIVING_ENABLED &&
          (!ticket.intake || ticket.intake.formConfig.allowCustomerReplies) &&
          !!customerEmail,
        customerName,
        customerEmail,
      };
    })(),
    intake: ticket.intake
      ? {
          submitterName: ticket.intake.submitterName,
          submitterEmail: ticket.intake.submitterEmail,
          submittedAt: ticket.intake.createdAt.toISOString(),
          formName: ticket.intake.formConfig.name,
          responses: (
            ticket.intake.responses as Array<{
              fieldId?: string;
              label?: string;
              type?: string;
              value?: string;
            }>
          )
            .filter((r) => r.fieldId && r.label && r.value)
            .map((r) => ({
              fieldId: r.fieldId as string,
              label: r.label as string,
              type: r.type ?? "text",
              value: r.value as string,
            })),
        }
      : null,
    github,
  };
}
