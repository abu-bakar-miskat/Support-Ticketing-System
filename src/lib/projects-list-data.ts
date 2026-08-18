import { prisma } from "@/lib/db";
import { avatarColorFor } from "@/lib/board-data";
import { buildProjectDeptWhere, deptProjectsForDeptWhere, getProfileDeptScope } from "@/lib/dept-scope";
import { dedupeMiscProjects } from "@/lib/misc-project";
import {
  dedupeSupportProjects,
  getNativeDepartmentIds,
  type ProfileWithNativeDepts,
} from "@/lib/support-project";
import { assignedProjectsInDeptWhere } from "@/lib/cross-access";
import {
  resolveLifecycleStages,
  resolveCurrentStage,
  formatStageRange,
  visibleLifecycleStages,
  type LifecycleStage,
} from "@/lib/project-lifecycle";

type ProfileForProjects = ProfileWithNativeDepts & {
  id: string;
  role: string;
  subDepartmentId?: string | null;
  subDepartmentIds?: string[];
  isHubMember?: boolean;
};

export type ProjectListRow = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  color: string;
  avatarUrl?: string | null;
  description: string | null;
  projectStatus: string;
  departmentId: string | null;
  departmentName: string | null;
  moduleSystemEnabled: boolean;
  liveDomain: string | null;
  subDepartmentName: string | null;
  ticketCount: number;
  activeSprintCount: number;
  plannedSprintCount: number;
  statusLabel: string;
  statusColor: string;
  statusRange: string | null;
  lifecycleStages: LifecycleStage[];
  createdAt: string;
  members: {
    id: string;
    name: string;
    avatarColor: string;
    avatarUrl?: string | null;
    role?: string | null;
    email?: string | null;
  }[];
};

const projectInclude = {
  department: { select: { id: true, name: true } },
  subDepartment: { select: { id: true, name: true } },
  members: {
    include: {
      user: { select: { id: true, name: true, avatarUrl: true, role: true, email: true } },
    },
    take: 6,
  },
  sprints: {
    where: { status: { not: "completed" } },
    select: { status: true },
  },
  _count: {
    select: {
      tickets: { where: { deletedAt: null } },
    },
  },
} as const;

function mapProjectRow(
  p: Awaited<ReturnType<typeof prisma.project.findMany<{ include: typeof projectInclude }>>>[number],
  canViewFullLifecycle: boolean,
): ProjectListRow {
  const allStages = resolveLifecycleStages(p);
  const currentStage = resolveCurrentStage(allStages, p.projectStatus);
  const lifecycleStages = visibleLifecycleStages(
    allStages,
    p.projectStatus,
    canViewFullLifecycle,
  );
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    kind: p.kind,
    color: p.color ?? "#0a76b9",
    avatarUrl: p.avatarUrl ?? null,
    description: p.description ?? null,
    projectStatus: p.projectStatus ?? "pipeline",
    departmentId: p.department?.id ?? null,
    departmentName: p.department?.name ?? null,
    moduleSystemEnabled: p.moduleSystemEnabled ?? false,
    liveDomain: p.projectUrl ?? null,
    subDepartmentName: p.subDepartment?.name ?? null,
    ticketCount: p._count.tickets,
    activeSprintCount: p.sprints.filter((s) => s.status === "active").length,
    plannedSprintCount: p.sprints.filter((s) => s.status === "planned").length,
    statusLabel: currentStage?.label ?? "Pipeline",
    statusColor: currentStage?.color ?? "#94a3b8",
    statusRange: formatStageRange(currentStage),
    lifecycleStages,
    createdAt: p.createdAt.toISOString(),
    members: p.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatarColor: avatarColorFor(m.user.name),
      avatarUrl: m.user.avatarUrl ?? null,
      role: m.user.role ?? null,
      email: m.user.email ?? null,
    })),
  };
}

export async function fetchProjectsList(
  profile: ProfileForProjects,
  scope: "mine" | "all",
): Promise<ProjectListRow[]> {
  const isPrivileged =
    profile.role === "admin" || profile.role === "manager" || profile.role === "lead";

  const deptScope = await getProfileDeptScope(profile);

  // Cross-access: user is visiting a dept granted via DepartmentAccess/DepartmentMember, not one
  // they manage or natively belong to. Full-access grants are excluded from isCrossAccessOnly by
  // getProfileDeptScope, so full-access users fall through to normal dept-scoped visibility below.
  const isCrossAccessDept = deptScope?.isCrossAccessOnly === true;

  const memberWhere = { members: { some: { userId: profile.id } } };

  // "My projects" for managers also includes every project in departments they
  // manage (by project department or by team department), since project
  // creation does not add the creator as a member.
  const managedDeptIds = profile.managedDepartmentIds ?? [];
  const mineWhere =
    managedDeptIds.length > 0
      ? {
          OR: [
            memberWhere,
            { departmentId: { in: managedDeptIds } },
            { subDepartment: { departmentId: { in: managedDeptIds } } },
          ],
        }
      : memberWhere;

  let where: Record<string, unknown>;

  if (isCrossAccessDept && deptScope) {
    // Cross-access guests only see projects they're assigned to within the active department.
    where = assignedProjectsInDeptWhere(profile.id, deptScope.activeDeptId);
  } else if (scope === "mine") {
    if (!deptScope) {
      // No active dept context — show all assigned projects
      where = mineWhere;
    } else if (deptScope.isHub) {
      // Hub view — assigned (+ managed dept projects for managers) across departments
      where = mineWhere;
    } else {
      // Active department — assigned (+ managed) projects in that dept only
      where = { AND: [mineWhere, buildProjectDeptWhere(deptScope)] };
    }
  } else if (scope === "all") {
    if (deptScope) {
      where = deptProjectsForDeptWhere(deptScope.activeDeptId);
    } else {
      const nativeDeptIds = getNativeDepartmentIds(profile);
      if (nativeDeptIds.length === 1) {
        where = deptProjectsForDeptWhere(nativeDeptIds[0]);
      } else if (nativeDeptIds.length > 1) {
        where = { OR: nativeDeptIds.map((id) => deptProjectsForDeptWhere(id)) };
      } else if (isPrivileged) {
        where = { tenantId: profile.activeTenantId ?? "__no_tenant__" };
      } else {
        where = memberWhere;
      }
    }
  } else if (isPrivileged) {
    where = { tenantId: profile.activeTenantId ?? "__no_tenant__" };
  } else {
    where = memberWhere;
  }

  const projects = dedupeSupportProjects(
    dedupeMiscProjects(
      await prisma.project.findMany({
        where,
        orderBy: { name: "asc" },
        include: projectInclude,
      }),
    ),
  );

  const canViewFullLifecycle =
    profile.role === "admin" || profile.role === "manager";

  return projects.map((p) => mapProjectRow(p, canViewFullLifecycle));
}
