import "server-only";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, projectInScope } from "@/lib/dept-scope";
import { getBoardCards, getSubDepartmentStatuses, avatarColorFor } from "@/lib/board-data";
import type { ProjectDetailsResponse, ProjectAsset } from "@/lib/api/projects";
import { resolveLifecycleStages, visibleLifecycleStages } from "@/lib/project-lifecycle";
import {
  canAddProjectAssets,
  canDeleteProjectAssets,
  isPrivilegedProjectEditor,
} from "@/lib/project-assets";
import {
  memberSubDepartmentIdsFromProject,
  memberNamesBySubDepartmentId,
  parseEnabledBoardSubDepartmentIds,
  resolveBoardSubDepartmentSource,
  resolveEnabledBoardSubDepartmentIds,
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
      subDepartment: { select: { id: true, name: true, prefix: true, departmentId: true } },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              subDepartmentId: true,
              memberships: {
                where: { isActive: true },
                select: { subDepartment: { select: { id: true, name: true, departmentId: true } } },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!project) return null;

  const projectDeptId = project.departmentId ?? project.subDepartment?.departmentId ?? null;
  const hasNativeDeptViewAccess = hasNativeDeptProjectViewAccess(profile, projectDeptId);

  const deptScope = await getProfileDeptScope(profile);
  if (!hasNativeDeptViewAccess && deptScope) {
    const subDepartmentDeptId = project.subDepartment?.departmentId ?? null;
    const inActiveDept =
      project.departmentId === deptScope.activeDeptId || subDepartmentDeptId === deptScope.activeDeptId;
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

  const [tickets, cards, cardSubDepartmentIds, recentActivity, projectTimeEntries, projectModules] = await Promise.all([
    prisma.ticket.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        subDepartment: { select: { prefix: true, name: true } },
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
      select: { id: true, subDepartmentId: true },
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
            subDepartment: { select: { prefix: true } },
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
  for (const entry of projectTimeEntries) {
    const secs = entry.durationSecs ?? 0;
    const existing = projectTimeByUser.get(entry.profileId) ?? {
      userId: entry.profileId,
      userName: entry.profile.name,
      avatarUrl: entry.profile.avatarUrl ?? null,
      totalSecs: 0,
    };
    existing.totalSecs += secs;
    projectTimeByUser.set(entry.profileId, existing);
  }
  const timeStats = {
    totalSecs: [...projectTimeByUser.values()].reduce((s, e) => s + e.totalSecs, 0),
    byUser: [...projectTimeByUser.values()].sort((a, b) => b.totalSecs - a.totalSecs),
  };

  const ticketSubDepartmentMap = new Map(cardSubDepartmentIds.map((t) => [t.id, t.subDepartmentId]));

  // Boards: department teams by default (set on project create). Managers can
  // remove empty boards and re-add from remaining department teams via +.
  const boardSubDepartmentIdSet = new Set(cardSubDepartmentIds.map((t) => t.subDepartmentId));
  if (project.subDepartmentId) boardSubDepartmentIdSet.add(project.subDepartmentId);

  const membersBySubDepartmentId = new Map<string, Set<string>>();
  for (const pm of project.members) {
    const activeSubDepartmentId = pm.user.memberships[0]?.subDepartment?.id ?? pm.user.subDepartmentId;
    if (!activeSubDepartmentId) continue;
    if (!membersBySubDepartmentId.has(activeSubDepartmentId)) membersBySubDepartmentId.set(activeSubDepartmentId, new Set());
    membersBySubDepartmentId.get(activeSubDepartmentId)!.add(pm.user.id);
  }

  const departmentSubDepartmentRows = projectDeptId
    ? await prisma.subDepartment.findMany({
        where: { departmentId: projectDeptId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  const departmentSubDepartmentIds = departmentSubDepartmentRows.map((t) => t.id);
  const memberNamesBySubDepartment = memberNamesBySubDepartmentId(project.members);

  const storedBoardSubDepartmentIds = parseEnabledBoardSubDepartmentIds(project.enabledBoardSubDepartmentIds);
  const enabledBoardSubDepartmentIds = resolveEnabledBoardSubDepartmentIds({
    stored: storedBoardSubDepartmentIds,
    departmentSubDepartmentIds,
    ticketSubDepartmentIds: [...boardSubDepartmentIdSet],
    projectSubDepartmentId: project.subDepartmentId,
  });

  const boardSubDepartments = enabledBoardSubDepartmentIds.length
    ? await prisma.subDepartment.findMany({
        where: { id: { in: enabledBoardSubDepartmentIds } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const addableSubDepartmentIdSet = new Set<string>();
  const memberSubDepartmentIds = memberSubDepartmentIdsFromProject(project.members);
  for (const id of [...departmentSubDepartmentIds, ...memberSubDepartmentIds]) {
    if (!enabledBoardSubDepartmentIds.includes(id)) addableSubDepartmentIdSet.add(id);
  }

  const addableBoardSubDepartments = addableSubDepartmentIdSet.size
    ? await (async () => {
        const rows = await prisma.subDepartment.findMany({
          where: { id: { in: [...addableSubDepartmentIdSet] } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
        const statusesBySubDepartment = await Promise.all(
          rows.map((subDepartment) => getSubDepartmentStatuses(subDepartment.id)),
        );
        return rows.map((subDepartment, idx) => {
          const source = departmentSubDepartmentIds.includes(subDepartment.id)
            ? ("department" as const)
            : ("member" as const);
          return {
            id: subDepartment.id,
            name: subDepartment.name,
            source,
            memberNames: memberNamesBySubDepartment.get(subDepartment.id) ?? [],
            statuses: statusesBySubDepartment[idx],
          };
        });
      })()
    : [];

  const groupStatuses = await Promise.all(boardSubDepartments.map((t) => getSubDepartmentStatuses(t.id)));

  const deptPeople = await fetchProjectDepartmentPeople(projectDeptId);
  const personById = new Map(deptPeople.map((p) => [p.id, p]));

  const subDepartmentBoardGroups = boardSubDepartments.map((subDepartment, idx) => {
    const groupCards = cards.filter((c) => ticketSubDepartmentMap.get(c.dbId) === subDepartment.id);
    const memberIds = new Set(membersBySubDepartmentId.get(subDepartment.id) ?? []);
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
    const subDepartmentMembersForCreate = [...memberIds].flatMap((uid) => {
      const person = personById.get(uid);
      if (person) {
        return [
          {
            id: person.id,
            name: person.name,
            avatarUrl: person.avatarUrl,
            departmentName: person.departmentName,
            subDepartmentName: person.subDepartmentName ?? subDepartment.name,
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
          subDepartmentName: subDepartment.name,
        },
      ];
    });
    return {
      subDepartmentId: subDepartment.id,
      subDepartmentName: subDepartment.name,
      cards: groupCards,
      members: groupMembers,
      statuses: groupStatuses[idx],
      subDepartmentMembersForCreate,
      boardSource: resolveBoardSubDepartmentSource(
        subDepartment.id,
        departmentSubDepartmentIds,
        memberNamesBySubDepartment,
      ),
      memberNames: memberNamesBySubDepartment.get(subDepartment.id) ?? [],
    };
  });

  const fallbackStatuses = await getSubDepartmentStatuses(project.subDepartment?.id ?? profile.subDepartmentId);

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
    humanId: `${t.subDepartment.prefix}-${t.ticketNumber}`,
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
    subDepartmentName: t.subDepartment.name,
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
    subDepartmentName: p.subDepartmentName,
  }));

  const projectMemberUsers = project.members.map((pm) => {
    const person = personById.get(pm.user.id);
    const subDepartmentName =
      pm.user.memberships[0]?.subDepartment?.name ??
      person?.subDepartmentName ??
      project.subDepartment?.name ??
      null;
    return {
      id: pm.user.id,
      name: pm.user.name,
      avatarUrl: pm.user.avatarUrl ?? null,
      departmentName: person?.departmentName ?? null,
      subDepartmentName,
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
      subDepartmentId: project.subDepartmentId ?? null,
      subDepartmentName: project.subDepartment?.name ?? null,
      projectStatus: project.projectStatus ?? "pipeline",
      pipelineStartedAt: project.pipelineStartedAt?.toISOString() ?? null,
      developmentStartedAt: project.developmentStartedAt?.toISOString() ?? null,
      liveAt: project.liveAt?.toISOString() ?? null,
      lifecycleStages,
      departmentId: project.departmentId ?? project.subDepartment?.departmentId ?? null,
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
    members,
    statusDist,
    tickets: ticketRows,
    boardStatuses: fallbackStatuses,
    subDepartmentBoardGroups,
    allProjectAssignees,
    projectMemberUsers,
    currentUserIsProjectMember,
    canSelfJoinProject,
    mainSubDepartmentId: project.subDepartmentId ?? profile.subDepartmentId ?? null,
    enabledBoardSubDepartmentIds,
    addableBoardSubDepartments,
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      actorName: a.actor.name,
      actorAvatarUrl: a.actor.avatarUrl ?? null,
      action: a.action,
      metadata: (a.metadata ?? {}) as Record<string, unknown>,
      createdAt: a.createdAt.toISOString(),
      ticketId: a.ticket.id,
      ticketTitle: a.ticket.title,
      ticketHumanId: `${a.ticket.subDepartment.prefix}-${a.ticket.ticketNumber}`,
    })),
  };
}
