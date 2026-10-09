import "server-only";

import { unstable_cache } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getSubDepartmentStatuses } from "@/lib/board-data";
import {
  getMentionableProjectMembers,
  getMentionableUsersForTicketDept,
} from "@/lib/mentionable-users";
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people";
import { canEditTicket, canEditTicketDescription, canDeleteTicket } from "@/lib/ticket-date-permissions";
import { RESEND_RECEIVING_ENABLED } from "@/lib/email-config";
import { isDueOverdue, isBlockedStatus } from "@/lib/format";
import { serializeTicketDateIso } from "@/lib/ticket-datetime";
import { buildGitHubDevData } from "@/lib/github/dev-data";
import type { getProfile } from "@/lib/profile";
import { presentPortalComment } from "@/lib/portal-comments";
import { getMailboxTicketCustomer } from "@/lib/mailbox-ticket-customer";
import { findMailboxOriginMessageId } from "@/lib/mailbox-origin-message";

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

const PRIORITY_TO_UI: Record<string, string> = {
  Critical: "critical",
  Urgent: "urgent",
  High: "high",
  Medium: "medium",
  Low: "low",
};

const ticketCoreInclude = {
  subDepartment: {
    select: { id: true, prefix: true, name: true, departmentId: true },
  },
  project: { select: { name: true, color: true, kind: true, moduleSystemEnabled: true, departmentId: true } },
  module: { select: { id: true, name: true } },
  sprint: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  creator: { select: { id: true, name: true, avatarUrl: true } },
  assignees: {
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
      subDepartment: { select: { prefix: true } },
    },
  },
  subTickets: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" as const },
    include: {
      subDepartment: { select: { prefix: true } },
      assignee: { select: { name: true, avatarUrl: true } },
    },
  },
  intake: {
    include: {
      formConfig: { select: { name: true, allowCustomerReplies: true } },
      apiKey: { select: { createdById: true } },
    },
  },
  comments: {
    where: { parentId: null, messageId: null, deletedAt: null },
    orderBy: { createdAt: "asc" as const },
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
        orderBy: { createdAt: "asc" as const },
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
  },
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      attachments: {
        select: { id: true, storageUrl: true, fileName: true, fileSize: true },
      },
      notes: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" as const },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  },
  activityLogs: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
    include: { actor: { select: { name: true } } },
  },
  timeEntries: {
    orderBy: { startedAt: "asc" as const },
    include: {
      profile: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
} as const;

// ── Cached lookups ────────────────────────────────────────────────────────────
// These are semi-static (subDepartment/department config and membership) but cost many
// ~200ms round-trips to the remote database per ticket open. Short revalidate
// windows keep them fresh enough while making repeat opens fast.

export const getCachedSubDepartmentStatuses = (subDepartmentId: string) =>
  unstable_cache(
    () => getSubDepartmentStatuses(subDepartmentId),
    ["ticket-detail-team-statuses", subDepartmentId],
    { revalidate: 120 },
  )();

export const getCachedMentionableUsers = (
  departmentId: string | null,
  ticketSubDepartmentId: string,
) =>
  unstable_cache(
    () => getMentionableUsersForTicketDept(departmentId, ticketSubDepartmentId),
    ["ticket-detail-mentionable", departmentId ?? "none", ticketSubDepartmentId],
    { revalidate: 300 },
  )();

const getCachedProjectMembers = (projectId: string) =>
  unstable_cache(
    () => getMentionableProjectMembers(projectId),
    ["ticket-detail-project-members", projectId],
    { revalidate: 300 },
  )();

/**
 * @mention autocomplete audience: project members (if attached) plus everyone
 * mentionable in the ticket's subDepartment/department. Project-only lists
 * left manual tickets showing just the assignee. Server-side @all still
 * targets project members only (see lib/mentions.ts).
 */
export const getCachedTicketMentionable = async (
  projectId: string | null,
  departmentId: string | null,
  ticketSubDepartmentId: string,
) => {
  const [projectMembers, deptUsers] = await Promise.all([
    projectId ? getCachedProjectMembers(projectId) : Promise.resolve([]),
    getCachedMentionableUsers(departmentId, ticketSubDepartmentId),
  ]);
  const byUser = new Map(projectMembers.map((u) => [u.id, u]));
  for (const u of deptUsers) if (!byUser.has(u.id)) byUser.set(u.id, u);
  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
};

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
  subDepartmentName: string | null;
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
      subDepartmentName: u.subDepartmentName,
    });
  }

  for (const u of extras) {
    if (!byId.has(u.id)) {
      byId.set(u.id, {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl ?? null,
        departmentName: null,
        subDepartmentName: null,
      });
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Prisma `where` matching exactly who may be assigned to a ticket — kept in sync
 * with {@link assertUsersEligibleForTicketSubDepartment} so every user we offer
 * in the assignee picker passes the server-side eligibility check on save.
 * Tier 1: the ticket's own sub-department. Tier 2 (dept-wide grants): managers,
 * active department access grants, and direct department memberships.
 */
function ticketAssigneeEligibilityWhere(
  subDepartmentId: string,
  departmentId: string | null,
) {
  const or: Prisma.ProfileWhereInput[] = [
    { subDepartmentId },
    { memberships: { some: { subDepartmentId, isActive: true } } },
  ];
  if (departmentId) {
    or.push(
      { managedDepartments: { some: { departmentId } } },
      {
        departmentAccesses: {
          some: {
            departmentId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        },
      },
      { directDeptMemberships: { some: { departmentId } } },
    );
  }
  return { deletedAt: null, OR: or };
}

const fetchEligibleAssignees = (
  subDepartmentId: string,
  departmentId: string | null,
) =>
  prisma.profile.findMany({
    where: ticketAssigneeEligibilityWhere(subDepartmentId, departmentId),
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      subDepartment: {
        select: { name: true, department: { select: { name: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

const getCachedEligibleAssignees = (
  subDepartmentId: string,
  departmentId: string | null,
) =>
  unstable_cache(
    () => fetchEligibleAssignees(subDepartmentId, departmentId),
    ["ticket-detail-eligible-assignees", subDepartmentId, departmentId ?? "none"],
    { revalidate: 300 },
  )();

/** Users eligible to be this ticket's assignee/co-assignee, for the picker. */
export async function getEligibleAssigneesForTicket(
  subDepartmentId: string,
  departmentId: string | null,
  extras: AssignableUser[] = [],
): Promise<AssignableUser[]> {
  const people = await getCachedEligibleAssignees(subDepartmentId, departmentId);

  const byId = new Map<string, AssignableUser>();
  for (const u of people) {
    byId.set(u.id, {
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl ?? null,
      departmentName: u.subDepartment?.department?.name ?? null,
      subDepartmentName: u.subDepartment?.name ?? null,
    });
  }
  // Fold in current assignee/co-assignees so they always render, even if the
  // cached roster is briefly stale.
  for (const u of extras) {
    if (!byId.has(u.id)) byId.set(u.id, u);
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * SD-06: a ticket belongs to exactly one sub-department, so membership in a
 * *different* sub-department under the same parent department (what
 * buildProjectDepartmentPeopleWhere allows for department-wide Projects) must
 * not be enough to become its assignee/co-assignee — only real access to this
 * ticket's own sub-department, or a genuine department-wide grant, counts.
 * Batched so ticket creation can validate the primary assignee and every
 * co-assignee in a couple of queries instead of one round-trip each.
 */
export async function assertUsersEligibleForTicketSubDepartment(
  subDepartmentId: string,
  departmentId: string | null,
  userIds: string[],
): Promise<{ ok: true } | { ok: false; invalidIds: string[] }> {
  if (userIds.length === 0) return { ok: true };

  const onSubDepartment = await prisma.profile.findMany({
    where: {
      id: { in: userIds },
      OR: [
        { subDepartmentId },
        { memberships: { some: { subDepartmentId, isActive: true } } },
      ],
    },
    select: { id: true },
  });
  const onSubDepartmentSet = new Set(onSubDepartment.map((p) => p.id));
  const remaining = userIds.filter((id) => !onSubDepartmentSet.has(id));
  if (remaining.length === 0) return { ok: true };

  if (!departmentId) {
    return { ok: false, invalidIds: remaining };
  }

  const deptWide = await prisma.profile.findMany({
    where: {
      id: { in: remaining },
      OR: [
        { managedDepartments: { some: { departmentId } } },
        {
          departmentAccesses: {
            some: {
              departmentId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          },
        },
        { directDeptMemberships: { some: { departmentId } } },
      ],
    },
    select: { id: true },
  });
  const deptWideSet = new Set(deptWide.map((p) => p.id));
  const invalidIds = remaining.filter((id) => !deptWideSet.has(id));
  if (invalidIds.length > 0) return { ok: false, invalidIds };
  return { ok: true };
}

export async function assertAssigneeEligibleForTicket(
  ticket: { subDepartmentId: string; subDepartment: { departmentId: string | null } },
  assigneeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const assigneeProfile = await prisma.profile.findUnique({
    where: { id: assigneeId },
    select: { id: true },
  });
  if (!assigneeProfile) {
    return { ok: false, error: "Assignee not found" };
  }

  const eligibility = await assertUsersEligibleForTicketSubDepartment(
    ticket.subDepartmentId,
    ticket.subDepartment.departmentId,
    [assigneeId],
  );
  if (eligibility.ok) {
    return { ok: true };
  }
  return ticket.subDepartment.departmentId
    ? { ok: false, error: "Assignee must belong to the ticket's department" }
    : { ok: false, error: "Assignee must belong to the ticket's subDepartment" };
}

export async function getTicketDetailRecord(id: string) {
  return prisma.ticket.findUnique({
    where: { id },
    include: ticketCoreInclude,
  });
}

export async function getTicketDetailPayload(
  profile: Profile,
  _ticketId: string,
  ticket: NonNullable<Awaited<ReturnType<typeof getTicketDetailRecord>>>,
) {
  // Minimal assignee list — enough to render without a department-wide roster query.
  const assigneeFallback: AssignableUser[] = [
    ...(ticket.assignee
      ? [
          {
            id: ticket.assignee.id,
            name: ticket.assignee.name,
            avatarUrl: ticket.assignee.avatarUrl ?? null,
            departmentName: null,
            subDepartmentName: null,
          },
        ]
      : []),
    ...ticket.assignees.map((a) => ({
      id: a.user.id,
      name: a.user.name,
      avatarUrl: a.user.avatarUrl ?? null,
      departmentName: null,
      subDepartmentName: null,
    })),
  ];

  const ticketDeptId = ticket.subDepartment.departmentId;
  const comments = ticket.comments;
  const messages = ticket.messages;
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  const mailboxCustomer = !ticket.intake && !lastInbound?.fromEmail
    ? await getMailboxTicketCustomer(ticket.id)
    : null;
  const activityLogs = ticket.activityLogs;
  const ticketTimeEntries = ticket.timeEntries;
  // Statuses already load on the board via /api/sub-departments/:id/statuses.
  const subDepartmentStatuses: Awaited<
    ReturnType<typeof getCachedSubDepartmentStatuses>
  > = [];
  const ticketEditContext = {
    assigneeId: ticket.assigneeId,
    creatorId: ticket.creatorId,
    coAssigneeIds: ticket.assignees.map((a) => a.user.id),
    subDepartmentId: ticket.subDepartmentId,
    departmentId: ticketDeptId,
    projectId: ticket.projectId,
    viewerIsProjectMember: false,
  };

  // Users eligible to be assigned to THIS ticket — the ticket's own
  // sub-department plus department-wide grant holders. Kept in sync with the
  // server-side eligibility check so every option in the picker is accepted on
  // save (a whole-department roster would list members of sibling
  // sub-departments who then get rejected — see SD-06).
  // mentionableUsers feeds the @mention autocomplete in comment composers.
  const [mentionableUsers, subDepartmentMembers] = await Promise.all([
    getCachedTicketMentionable(ticket.projectId, ticketDeptId, ticket.subDepartmentId).catch(
      (e: unknown) => {
        console.error("[ticket-detail] mentionable users failed:", e);
        return [] as Awaited<ReturnType<typeof getCachedTicketMentionable>>;
      },
    ),
    getEligibleAssigneesForTicket(ticket.subDepartmentId, ticketDeptId, assigneeFallback),
  ]);
  const github = { pullRequests: [], commits: [] } as Awaited<
    ReturnType<typeof buildGitHubDevData>
  >;

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
  for (const entry of ticketTimeEntries) {
    const existing = timeByUser.get(entry.profileId) ?? {
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
    timeByUser.set(entry.profileId, existing);
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
      { humanId: `${s.subDepartment.prefix}-${s.ticketNumber}`, title: s.title },
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
    });
  }
  const subTicketTime = {
    totalSecs: subTicketTotalSecs,
    perTicket: ticket.subTickets
      .map((s) => ({
        dbId: s.id,
        humanId: `${s.subDepartment.prefix}-${s.ticketNumber}`,
        title: s.title,
        totalSecs: subPerTicketSecs.get(s.id) ?? 0,
      }))
      .filter((t) => t.totalSecs > 0)
      .sort((a, b) => b.totalSecs - a.totalSecs),
    sessions: subTicketSessions,
  };

  const myActiveEntry = ticketTimeEntries.find(
    (e) => e.profileId === profile.id && !e.endedAt,
  );
  const isCurrentUserAssignee =
    ticket.assigneeId === profile.id ||
    ticket.assignees.some((a) => a.user.id === profile.id);

  const now = Date.now();
  const openedDaysAgo = Math.max(
    0,
    Math.floor((now - ticket.createdAt.getTime()) / 86_400_000),
  );
  const dueOverdue =
    isDueOverdue(ticket.dueDate, new Date(now)) && !isBlockedStatus(ticket.status);

  // A sub-ticket counts as complete when its status is one flagged
  // `isComplete` on its own subDepartment. Sub-tickets may live on a different subDepartment
  // than the parent, so resolve the complete-status labels per subDepartment.
  const subSubDepartmentIds = [...new Set(ticket.subTickets.map((st) => st.subDepartmentId))];
  const completeStatusRows = subSubDepartmentIds.length
    ? await prisma.subDepartmentStatus.findMany({
        where: { subDepartmentId: { in: subSubDepartmentIds }, isComplete: true },
        select: { subDepartmentId: true, label: true },
      })
    : [];
  const completeSubStatuses = new Set(
    completeStatusRows.map((r) => `${r.subDepartmentId}::${r.label}`),
  );

  const canEdit = canEditTicket(profile, ticketEditContext);
  const canEditDescription = canEditTicketDescription(profile, ticketEditContext);

  return {
    dbId: ticket.id,
    ticketId: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
    projectId: ticket.projectId,
    subDepartmentId: ticket.subDepartmentId,
    projectName: ticket.project?.name ?? "Miscellaneous",
    projectColor: ticket.project?.color ?? "#0a76b9",
    projectKind: ticket.project?.kind ?? "standard",
    isPortalTicket: ticket.intake?.apiKeyId != null,
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
    transferredFromName: ticket.transferredFromName ?? null,
    transferredByName: ticket.transferredByName ?? null,
    transferredAtIso: ticket.transferredAt ? ticket.transferredAt.toISOString() : null,
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
    subTicketTime,
    myActiveTimerId: myActiveEntry?.id ?? null,
    myActiveTimerStartedAt: myActiveEntry?.startedAt.toISOString() ?? null,
    isCurrentUserAssignee,
    parentTicket: ticket.parent
      ? {
          dbId: ticket.parent.id,
          humanId: `${ticket.parent.subDepartment.prefix}-${ticket.parent.ticketNumber}`,
          title: ticket.parent.title,
        }
      : null,
    subDepartmentMembers,
    mentionableUsers,
    subDepartmentStatuses,
    subTickets: ticket.subTickets.map((st) => ({
      dbId: st.id,
      humanId: `${st.subDepartment.prefix}-${st.ticketNumber}`,
      title: st.title,
      status: st.status,
      done: completeSubStatuses.has(`${st.subDepartmentId}::${st.status}`),
      priority: PRIORITY_TO_UI[st.priority] ?? "medium",
      assigneeName: st.assignee?.name ?? null,
      assigneeAvatarUrl: st.assignee?.avatarUrl ?? null,
      canDelete: canDeleteTicket(profile, { creatorId: st.creatorId }),
    })),
    comments: comments.map((c) => {
      const presented = presentPortalComment({
        body: c.body,
        authorId: c.author.id,
        apiKeyCreatedById: ticket.intake?.apiKey?.createdById,
        submitterName: ticket.intake?.submitterName,
      });
      return {
        id: c.id,
        body: presented.body,
        createdAt: c.createdAt.toISOString(),
        editedAt: c.editedAt?.toISOString() ?? null,
        deletedAt: c.deletedAt?.toISOString() ?? null,
        authorId: c.author.id,
        authorName: presented.authorName ?? c.author.name,
        authorAvatarUrl: presented.isPortalRequester ? null : c.author.avatarUrl,
        externalAuthor: presented.isPortalRequester,
        portalVisible: c.portalVisible,
        attachments: c.attachments.map((a) => ({
          id: a.id,
          storageUrl: a.storageUrl,
          fileName: a.fileName,
          fileSize: a.fileSize,
        })),
        replies: c.replies.map((r) => {
          const replyPresented = presentPortalComment({
            body: r.body,
            authorId: r.author.id,
            apiKeyCreatedById: ticket.intake?.apiKey?.createdById,
            submitterName: ticket.intake?.submitterName,
          });
          return {
            id: r.id,
            body: replyPresented.body,
            createdAt: r.createdAt.toISOString(),
            editedAt: r.editedAt?.toISOString() ?? null,
            deletedAt: r.deletedAt?.toISOString() ?? null,
            authorId: r.author.id,
            authorName: replyPresented.authorName ?? r.author.name,
            authorAvatarUrl: replyPresented.isPortalRequester ? null : r.author.avatarUrl,
            externalAuthor: replyPresented.isPortalRequester,
            portalVisible: r.portalVisible,
            attachments: r.attachments.map((a) => ({
              id: a.id,
              storageUrl: a.storageUrl,
              fileName: a.fileName,
              fileSize: a.fileSize,
            })),
            replies: [],
          };
        }),
      };
    }),
    activity: activityLogs.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actor.name,
      createdAt: a.createdAt.toISOString(),
      metadata: (a.metadata ?? {}) as Record<string, unknown>,
    })),
    // Shown as the description; hidden from the reply thread.
    originMessageId: findMailboxOriginMessageId(
      { createdAt: ticket.createdAt, hasIntake: ticket.intake !== null },
      messages,
    ),
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
      const customerName = ticket.intake?.submitterName ?? lastInbound?.fromName ?? mailboxCustomer?.fromName ?? null;
      const customerEmail = ticket.intake?.submitterEmail ?? lastInbound?.fromEmail ?? mailboxCustomer?.fromEmail ?? null;
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
