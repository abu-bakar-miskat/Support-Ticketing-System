import type { BoardCardData, SubCardData, TeamStatusConfig } from "@/components/board/board-types";
import type { AssignedSubtask } from "@/lib/board-data";
import type { TicketDetailProps } from "@/components/tickets/ticket-detail-page";
import type { MentionableUser } from "@/lib/mentionable-users";
import type { UserListPerson } from "@/lib/user-list-person";

export type TicketShellSource = BoardCardData | SubCardData | AssignedSubtask;

type PlaceholderOpts = {
  teamStatuses?: TeamStatusConfig[];
  availableMembers?: UserListPerson[];
};

function isBoardCard(source: TicketShellSource): source is BoardCardData {
  return "subTicketCards" in source;
}

function isAssignedSubtask(source: TicketShellSource): source is AssignedSubtask {
  return "parentDbId" in source;
}

function toMentionable(members: UserListPerson[]): MentionableUser[] {
  return members.map((m) => ({
    id: m.id,
    name: m.name,
    avatarUrl: m.avatarUrl ?? null,
    departmentName: m.departmentName ?? null,
    teamName: m.teamName ?? null,
    role: "member",
  }));
}

export function buildTicketDetailPlaceholder(
  source: TicketShellSource,
  opts: PlaceholderOpts = {},
): TicketDetailProps {
  const members =
    opts.availableMembers?.map((m) => ({
      id: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl ?? null,
      departmentName: m.departmentName ?? null,
      teamName: m.teamName ?? null,
    })) ?? [];
  const mentionableUsers = toMentionable(opts.availableMembers ?? []);

  if (isBoardCard(source)) {
    const openedDaysAgo = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(source.createdIso).getTime()) / 86_400_000,
      ),
    );

    return {
      dbId: source.dbId,
      ticketId: source.humanId,
      projectId: source.projectId,
      teamId: source.teamId,
      projectName: source.project,
      projectColor: source.projectColor ?? "#0a76b9",
      projectKind: source.projectKind ?? "standard",
      title: source.title,
      description: null,
      status: source.status,
      priority: source.priority,
      labels: source.labels,
      openedBy: source.creatorName.split(" ")[0],
      openedDaysAgo,
      createdAtIso: source.createdIso,
      creatorName: source.creatorName,
      creatorAvatarUrl: source.creatorAvatarUrl ?? null,
      assigneeId: source.assigneeId,
      assigneeName: source.assigneeName,
      assigneeAvatarUrl: source.assigneeAvatarUrl ?? null,
      coAssignees: source.coAssignees.map((a) => ({
        id: a.id,
        name: a.name,
        avatarUrl: a.avatarUrl ?? null,
      })),
      startDateIso: source.startDateIso,
      dueDateIso: source.dueDateIso,
      dueDate: source.due,
      closedAtIso: null,
      dueOverdue: source.dueOverdue,
      canEditDates: false,
      canChangeStatus: false,
      canDelete: false,
      canEditTicket: false,
      canEditDescription: false,
      storyPoints: null,
      estimatedTime: source.estimatedTime,
      assetLinks: [],
      timeEntries: [],
      qaTimeEntries: [],
      myActiveTimerId: null,
      myActiveTimerStartedAt: null,
      isCurrentUserAssignee: false,
      isCurrentUserQa: false,
      parentTicket: null,
      teamMembers: members,
      mentionableUsers,
      teamStatuses: opts.teamStatuses ?? [],
      subTickets: source.subTicketCards.map((st) => ({
        dbId: st.dbId,
        humanId: st.humanId,
        title: st.title,
        status: st.status,
        done: false,
        priority: st.priority,
        assigneeName: st.assigneeName,
        assigneeAvatarUrl: st.assigneeAvatarUrl ?? null,
        canDelete: false,
      })),
      comments: [],
      activity: [],
      intake: null,
      github: null,
    };
  }

  if (isAssignedSubtask(source)) {
    return {
      dbId: source.dbId,
      ticketId: source.humanId,
      projectId: source.projectId,
      teamId: source.teamId,
      projectName: source.project,
      projectColor: source.projectColor ?? "#0a76b9",
      projectKind: "standard",
      title: source.title,
      description: null,
      status: source.status,
      priority: source.priority,
      labels: [],
      openedBy: "",
      openedDaysAgo: 0,
      createdAtIso: null,
      creatorName: "",
      creatorAvatarUrl: null,
      assigneeId: null,
      assigneeName: source.assigneeName,
      assigneeAvatarUrl: source.assigneeAvatarUrl ?? null,
      coAssignees: [],
      startDateIso: null,
      dueDateIso: null,
      dueDate: source.due,
      closedAtIso: null,
      dueOverdue: source.dueOverdue,
      canEditDates: false,
      canChangeStatus: false,
      canDelete: false,
      canEditTicket: false,
      canEditDescription: false,
      storyPoints: null,
      estimatedTime: null,
      assetLinks: [],
      timeEntries: [],
      qaTimeEntries: [],
      myActiveTimerId: null,
      myActiveTimerStartedAt: null,
      isCurrentUserAssignee: false,
      isCurrentUserQa: false,
      parentTicket: {
        dbId: source.parentDbId,
        humanId: source.parentHumanId,
        title: source.parentTitle,
      },
      teamMembers: members,
      mentionableUsers,
      teamStatuses: opts.teamStatuses ?? [],
      subTickets: [],
      comments: [],
      activity: [],
      intake: null,
      github: null,
    };
  }

  return {
    dbId: source.dbId,
    ticketId: source.humanId,
    projectId: "",
    teamId: "",
    projectName: "Miscellaneous",
    projectColor: "#0a76b9",
    projectKind: "standard",
    title: source.title,
    description: null,
    status: source.status,
    priority: source.priority,
    labels: [],
    openedBy: "",
    openedDaysAgo: 0,
    createdAtIso: null,
    creatorName: "",
    creatorAvatarUrl: null,
    assigneeId: source.assigneeId,
    assigneeName: source.assigneeName,
    assigneeAvatarUrl: source.assigneeAvatarUrl ?? null,
    coAssignees: [],
    startDateIso: source.startDateIso,
    dueDateIso: source.dueDateIso,
    dueDate: null,
    closedAtIso: null,
    dueOverdue: false,
    canEditDates: false,
    canChangeStatus: false,
    canDelete: false,
    canEditTicket: false,
    canEditDescription: false,
    storyPoints: null,
    estimatedTime: null,
    assetLinks: [],
    timeEntries: [],
    qaTimeEntries: [],
    myActiveTimerId: null,
    myActiveTimerStartedAt: null,
    isCurrentUserAssignee: false,
    isCurrentUserQa: false,
    parentTicket: null,
    teamMembers: members,
    mentionableUsers,
    teamStatuses: opts.teamStatuses ?? [],
    subTickets: [],
    comments: [],
    activity: [],
    intake: null,
    github: null,
  };
}
