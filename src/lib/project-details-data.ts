import "server-only";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, projectInScope } from "@/lib/dept-scope";
import { getBoardCards, getTeamStatuses, avatarColorFor } from "@/lib/board-data";
import type { ProjectDetailsResponse, ProjectAsset } from "@/lib/api/projects";
import { resolveLifecycleStages, visibleLifecycleStages } from "@/lib/project-lifecycle";
import {
  canAddProjectAssets,
  canDeleteProjectAssets,
  isPrivilegedProjectEditor,
} from "@/lib/project-assets";
import {
  memberTeamIdsFromProject,
  memberNamesByTeamId,
  parseEnabledBoardTeamIds,
  resolveBoardTeamSource,
  resolveEnabledBoardTeamIds,
} from "@/lib/project-boards";
import {
  canAccessProjectSettings,
  canManageProjectBoards,
  canManageProjectLifecycle,
  canModifyProjectContent,
} from "@/lib/project-permissions";
import { hasNativeDeptProjectViewAccess } from "@/lib/support-project";
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people";
import type { getProfile } from "@/lib/profile";

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

export async function getProjectDetailsData(
  profile: Profile,
  idOrSlug: string,
): Promise<ProjectDetailsResponse | null> {
  const project = await prisma.project.findFirst({
    where: { OR: [{ slug: idOrSlug }, { id: idOrSlug }] },
    include: {
      department: { select: { id: true, name: true } },
      team: { select: { id: true, name: true, prefix: true, departmentId: true } },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              teamId: true,
              memberships: {
                where: { isActive: true },
                select: { team: { select: { id: true, name: true, departmentId: true } } },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!project) return null;

  const projectDeptId = project.departmentId ?? project.team?.departmentId ?? null;
  const hasNativeDeptViewAccess = hasNativeDeptProjectViewAccess(profile, projectDeptId);

  const deptScope = await getProfileDeptScope(profile);
  if (!hasNativeDeptViewAccess && deptScope) {
    const teamDeptId = project.team?.departmentId ?? null;
    const inActiveDept =
      project.departmentId === deptScope.activeDeptId || teamDeptId === deptScope.activeDeptId;
    const isMember = project.members.some((m) => m.user.id === profile.id);

    if (deptScope.isCrossAccessOnly) {
      // Limited (non-full) cross-department access: the user may only open
      // projects they're explicitly a member of within this department — never
      // arbitrary projects, even ones in the active department.
      if (!inActiveDept || !isMember) return null;
    } else if (!inActiveDept) {
      const isHub =
        profile.isHubMember === true ||
        profile.role === "admin" ||
        profile.role === "manager";
      if (!(isHub && isMember)) return null;
    }
  }

  const profilePrefsRow = await prisma.profile.findUnique({
    where: { id: profile.id },
    select: { preferences: true },
  });
  const projectTabPrefs = (() => {
    const prefs = profilePrefsRow?.preferences;
    if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return {};
    const p = prefs as Record<string, unknown>;
    return p.projectTabPrefs &&
      typeof p.projectTabPrefs === "object" &&
      !Array.isArray(p.projectTabPrefs)
      ? (p.projectTabPrefs as Record<string, string>)
      : {};
  })();
  const defaultTab = projectTabPrefs[project.id] ?? null;

  const [tickets, cards, cardTeamIds, recentActivity, projectTimeEntries, projectModules] = await Promise.all([
    prisma.ticket.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        team: { select: { prefix: true, name: true } },
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        creator: { select: { id: true, name: true } },
        _count: { select: { comments: { where: { deletedAt: null } } } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { direction: true },
        },
      },
    }),
    getBoardCards({ projectId: project.id }),
    prisma.ticket.findMany({
      where: { projectId: project.id, deletedAt: null, parentId: null },
      select: { id: true, teamId: true },
    }),
    prisma.activityLog.findMany({
      where: { ticket: { projectId: project.id, deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        actor: { select: { name: true, avatarUrl: true } },
        ticket: {
          select: {
            id: true,
            title: true,
            ticketNumber: true,
            team: { select: { prefix: true } },
          },
        },
      },
    }),
    prisma.timeEntry.findMany({
      where: { ticket: { projectId: project.id, deletedAt: null } },
      include: { profile: { select: { id: true, name: true, avatarUrl: true } } },
    }),
    prisma.projectModule.findMany({
      where: { projectId: project.id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, status: true },
    }),
  ]);

  const projectTimeByUser = new Map<
    string,
    { userId: string; userName: string; avatarUrl: string | null; totalSecs: number }
  >();
  const projectQaTimeByUser = new Map<
    string,
    { userId: string; userName: string; avatarUrl: string | null; totalSecs: number }
  >();
  for (const entry of projectTimeEntries) {
    const secs = entry.durationSecs ?? 0;
    const target = entry.kind === "QA" ? projectQaTimeByUser : projectTimeByUser;
    const existing = target.get(entry.profileId) ?? {
      userId: entry.profileId,
      userName: entry.profile.name,
      avatarUrl: entry.profile.avatarUrl ?? null,
      totalSecs: 0,
    };
    existing.totalSecs += secs;
    target.set(entry.profileId, existing);
  }
  const timeStats = {
    totalSecs: [...projectTimeByUser.values()].reduce((s, e) => s + e.totalSecs, 0),
    byUser: [...projectTimeByUser.values()].sort((a, b) => b.totalSecs - a.totalSecs),
  };
  const qaTimeStats = {
    totalSecs: [...projectQaTimeByUser.values()].reduce((s, e) => s + e.totalSecs, 0),
    byUser: [...projectQaTimeByUser.values()].sort((a, b) => b.totalSecs - a.totalSecs),
  };

  const ticketTeamMap = new Map(cardTeamIds.map((t) => [t.id, t.teamId]));

  // Boards: department teams by default (set on project create). Managers can
  // remove empty boards and re-add from remaining department teams via +.
  const boardTeamIdSet = new Set(cardTeamIds.map((t) => t.teamId));
  if (project.teamId) boardTeamIdSet.add(project.teamId);

  const membersByTeamId = new Map<string, Set<string>>();
  for (const pm of project.members) {
    const activeTeamId = pm.user.memberships[0]?.team?.id ?? pm.user.teamId;
    if (!activeTeamId) continue;
    if (!membersByTeamId.has(activeTeamId)) membersByTeamId.set(activeTeamId, new Set());
    membersByTeamId.get(activeTeamId)!.add(pm.user.id);
  }

  const departmentTeamRows = projectDeptId
    ? await prisma.team.findMany({
        where: { departmentId: projectDeptId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  const departmentTeamIds = departmentTeamRows.map((t) => t.id);
  const memberNamesByTeam = memberNamesByTeamId(project.members);

  const storedBoardTeamIds = parseEnabledBoardTeamIds(project.enabledBoardTeamIds);
  const enabledBoardTeamIds = resolveEnabledBoardTeamIds({
    stored: storedBoardTeamIds,
    departmentTeamIds,
    ticketTeamIds: [...boardTeamIdSet],
    projectTeamId: project.teamId,
  });

  const boardTeams = enabledBoardTeamIds.length
    ? await prisma.team.findMany({
        where: { id: { in: enabledBoardTeamIds } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const addableTeamIdSet = new Set<string>();
  const memberTeamIds = memberTeamIdsFromProject(project.members);
  for (const id of [...departmentTeamIds, ...memberTeamIds]) {
    if (!enabledBoardTeamIds.includes(id)) addableTeamIdSet.add(id);
  }

  const addableBoardTeams = addableTeamIdSet.size
    ? await (async () => {
        const rows = await prisma.team.findMany({
          where: { id: { in: [...addableTeamIdSet] } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
        const statusesByTeam = await Promise.all(
          rows.map((team) => getTeamStatuses(team.id)),
        );
        return rows.map((team, idx) => {
          const source = departmentTeamIds.includes(team.id)
            ? ("department" as const)
            : ("member" as const);
          return {
            id: team.id,
            name: team.name,
            source,
            memberNames: memberNamesByTeam.get(team.id) ?? [],
            statuses: statusesByTeam[idx],
          };
        });
      })()
    : [];

  const groupStatuses = await Promise.all(boardTeams.map((t) => getTeamStatuses(t.id)));

  const deptPeople = await fetchProjectDepartmentPeople(projectDeptId);
  const personById = new Map(deptPeople.map((p) => [p.id, p]));

  const teamBoardGroups = boardTeams.map((team, idx) => {
    const groupCards = cards.filter((c) => ticketTeamMap.get(c.dbId) === team.id);
    const memberIds = new Set(membersByTeamId.get(team.id) ?? []);
    for (const card of groupCards) {
      if (card.assigneeId) memberIds.add(card.assigneeId);
    }
    const groupMembers = [...memberIds].flatMap((uid) => {
      const pm = project.members.find((m) => m.user.id === uid);
      const name = pm?.user.name ?? cards.find((c) => c.assigneeId === uid)?.assigneeName;
      if (!name) return [];
      return [
        {
          name,
          initials: name
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase(),
          bg: avatarColorFor(name),
        },
      ];
    });
    const teamMembersForCreate = [...memberIds].flatMap((uid) => {
      const person = personById.get(uid);
      if (person) {
        return [
          {
            id: person.id,
            name: person.name,
            avatarUrl: person.avatarUrl,
            departmentName: person.departmentName,
            teamName: person.teamName ?? team.name,
          },
        ];
      }
      const pm = project.members.find((m) => m.user.id === uid);
      if (!pm) return [];
      return [
        {
          id: pm.user.id,
          name: pm.user.name,
          avatarUrl: pm.user.avatarUrl ?? null,
          departmentName: null,
          teamName: team.name,
        },
      ];
    });
    return {
      teamId: team.id,
      teamName: team.name,
      cards: groupCards,
      members: groupMembers,
      statuses: groupStatuses[idx],
      teamMembersForCreate,
      boardSource: resolveBoardTeamSource(
        team.id,
        departmentTeamIds,
        memberNamesByTeam,
      ),
      memberNames: memberNamesByTeam.get(team.id) ?? [],
    };
  });

  const fallbackStatuses = await getTeamStatuses(project.team?.id ?? profile.teamId);

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  for (const t of tickets) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
  }
  const total = tickets.length;
  const open = tickets.filter((t) => t.status !== "Live").length;
  const closed = byStatus["Live"] ?? 0;
  const inProgress = byStatus["In Progress"] ?? 0;

  const seenMembers = new Map<string, { name: string; bg: string }>();
  for (const pm of project.members) {
    if (!seenMembers.has(pm.user.id)) {
      seenMembers.set(pm.user.id, {
        name: pm.user.name,
        bg: avatarColorFor(pm.user.name),
      });
    }
  }
  for (const t of tickets) {
    if (t.assignee && !seenMembers.has(t.assignee.id)) {
      seenMembers.set(t.assignee.id, {
        name: t.assignee.name,
        bg: avatarColorFor(t.assignee.name),
      });
    }
  }
  const members = [...seenMembers.values()].map((m) => ({
    ...m,
    initials: m.name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),
  }));

  const ticketRows = tickets.map((t) => ({
    id: t.id,
    humanId: `${t.team.prefix}-${t.ticketNumber}`,
    title: t.title,
    status: t.status,
    priority: t.priority as string,
    type: t.type as string,
    assigneeName: t.assignee?.name ?? null,
    assigneeColor: t.assignee ? avatarColorFor(t.assignee.name) : null,
    assigneeAvatarUrl: t.assignee?.avatarUrl ?? null,
    creatorName: t.creator.name,
    dueDate: t.dueDate?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    commentCount: t._count.comments,
    labels: t.labels,
    teamName: t.team.name,
    lastMessageDirection: (t.messages[0]?.direction as "inbound" | "outbound") ?? null,
  }));

  const statusDist = fallbackStatuses.map((s) => ({
    label: s.label,
    color: s.color,
    count: byStatus[s.label] ?? 0,
  }));

  const isPrivileged = isPrivilegedProjectEditor(profile);
  const canDeleteAssets = canDeleteProjectAssets(profile);

  const allProjectAssignees = deptPeople.map((p) => ({
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl,
    departmentName: p.departmentName,
    teamName: p.teamName,
  }));

  const projectMemberUsers = project.members.map((pm) => {
    const person = personById.get(pm.user.id);
    const teamName =
      pm.user.memberships[0]?.team?.name ??
      person?.teamName ??
      project.team?.name ??
      null;
    return {
      id: pm.user.id,
      name: pm.user.name,
      avatarUrl: pm.user.avatarUrl ?? null,
      departmentName: person?.departmentName ?? null,
      teamName,
    };
  });

  const currentUserIsProjectMember = project.members.some(
    (pm) => pm.user.id === profile.id,
  );
  const canModifyProject = canModifyProjectContent(profile, currentUserIsProjectMember);
  const canSelfJoinProject = await projectInScope(profile, project.id);
  const canManageProjectSettings = canAccessProjectSettings(profile, {
    projectDeptId,
    activeDeptId: deptScope?.activeDeptId ?? null,
    isProjectMember: currentUserIsProjectMember,
  });
  const canManageLifecycle = canManageProjectLifecycle(profile);
  const allLifecycleStages = resolveLifecycleStages(project);
  const lifecycleStages = visibleLifecycleStages(
    allLifecycleStages,
    project.projectStatus,
    canManageLifecycle,
  );

  return {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      kind: project.kind,
      color: project.color ?? "#0a76b9",
      avatarUrl: project.avatarUrl ?? null,
      description: project.description,
      teamId: project.teamId ?? null,
      teamName: project.team?.name ?? null,
      projectStatus: project.projectStatus ?? "pipeline",
      pipelineStartedAt: project.pipelineStartedAt?.toISOString() ?? null,
      developmentStartedAt: project.developmentStartedAt?.toISOString() ?? null,
      liveAt: project.liveAt?.toISOString() ?? null,
      lifecycleStages,
      departmentId: project.departmentId ?? project.team?.departmentId ?? null,
      departmentName: project.department?.name ?? null,
      moduleSystemEnabled: project.moduleSystemEnabled ?? false,
      modules: projectModules,
      githubRepo: project.githubRepo ?? null,
      projectUrl: project.projectUrl ?? null,
      analyticalLinks: Array.isArray(project.analyticalLinks)
        ? (project.analyticalLinks as { id: string; name: string; url: string }[])
        : [],
      guidelines: project.guidelines ?? null,
      assets: Array.isArray(project.assets) ? (project.assets as ProjectAsset[]) : [],
      createdAt: project.createdAt.toISOString(),
    },
    canEdit: isPrivileged && canModifyProject,
    canManageLifecycle,
    canManageProjectSettings,
    canManageBoards: canManageProjectBoards(profile),
    canModifyProject,
    canAddAssets: canModifyProject && (await canAddProjectAssets(profile, project.id, currentUserIsProjectMember)),
    canDeleteAssets,
    defaultTab,
    stats: { total, open, closed, inProgress, byPriority },
    timeStats,
    qaTimeStats,
    members,
    statusDist,
    tickets: ticketRows,
    boardStatuses: fallbackStatuses,
    teamBoardGroups,
    allProjectAssignees,
    projectMemberUsers,
    currentUserIsProjectMember,
    canSelfJoinProject,
    mainTeamId: project.teamId ?? profile.teamId ?? null,
    enabledBoardTeamIds,
    addableBoardTeams,
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      actorName: a.actor.name,
      actorAvatarUrl: a.actor.avatarUrl ?? null,
      action: a.action,
      metadata: (a.metadata ?? {}) as Record<string, unknown>,
      createdAt: a.createdAt.toISOString(),
      ticketId: a.ticket.id,
      ticketTitle: a.ticket.title,
      ticketHumanId: `${a.ticket.team.prefix}-${a.ticket.ticketNumber}`,
    })),
  };
}
