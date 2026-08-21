import { prisma } from "@/lib/db";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { avatarColorFor } from "@/lib/board-data";
import { listMailboxConnectionsForSubDepartment } from "@/lib/mailbox-connection";
import type { getProfile } from "@/lib/profile";

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

export type SubDepartmentDetail = {
  id: string;
  name: string;
  prefix: string;
  color: string;
  departmentId: string;
  departmentName: string;
  memberCount: number;
};

export type SubDepartmentMemberInfo = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  doNotAssign: boolean;
};

export type SubDepartmentAboutData = SubDepartmentDetail & {
  workloadThreshold: number;
  ticketsKeyed: number;
  projectCount: number;
  subManagers: SubDepartmentMemberInfo[];
  agents: SubDepartmentMemberInfo[];
  mailboxes: { address: string; status: "ACTIVE" | "AUTH_ERROR" | "UNREACHABLE" }[];
};

/**
 * Build the Prisma `where` restricting sub-departments to those the caller can
 * reach. Managers are limited to their managed/granted departments (or the
 * active one); admins see the whole active department, or the whole tenant when
 * no department is active.
 */
async function scopedWhere(profile: Profile) {
  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";

  const deptScope = await getProfileDeptScope(profile);
  const activeDeptId = deptScope?.activeDeptId ?? null;
  const tenantId = profile.activeTenantId ?? "__no_tenant__";

  const deptScopeList = activeDeptId
    ? [activeDeptId]
    : isManager
      ? [...new Set([...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])])]
      : null;

  return isAdmin
    ? activeDeptId
      ? { departmentId: activeDeptId }
      : { tenantId }
    : deptScopeList?.length
      ? { departmentId: { in: deptScopeList } }
      : { id: { in: [] as string[] } };
}

/**
 * Resolve a sub-department by its (URL-decoded) name within the caller's scope.
 * Lightweight — used by the layout to render the sidebar header. Returns null
 * when nothing matches in scope.
 */
export async function resolveSubDepartmentByName(
  name: string,
  profile: Profile,
): Promise<SubDepartmentDetail | null> {
  const where = await scopedWhere(profile);

  const subDepartment = await prisma.subDepartment.findFirst({
    where: { ...where, name },
    include: {
      department: { select: { id: true, name: true } },
      memberships: { where: { isActive: true }, select: { id: true } },
    },
  });

  if (!subDepartment) return null;

  return {
    id: subDepartment.id,
    name: subDepartment.name,
    prefix: subDepartment.prefix,
    color: subDepartment.color ?? avatarColorFor(subDepartment.name),
    departmentId: subDepartment.department.id,
    departmentName: subDepartment.department.name,
    memberCount: subDepartment.memberships.length,
  };
}

/**
 * Full About-page payload for a sub-department: roster split by role, routing
 * config, mailbox connections, and ticket-key stats. Scoped like
 * {@link resolveSubDepartmentByName}; returns null when out of scope.
 */
export async function getSubDepartmentAboutData(
  name: string,
  profile: Profile,
): Promise<SubDepartmentAboutData | null> {
  const where = await scopedWhere(profile);

  const subDepartment = await prisma.subDepartment.findFirst({
    where: { ...where, name },
    include: {
      department: { select: { id: true, name: true } },
      counter: { select: { lastNumber: true } },
      _count: { select: { projects: true } },
      memberships: {
        where: { isActive: true },
        orderBy: { joinedAt: "asc" },
        select: {
          role: true,
          doNotAssign: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    },
  });

  if (!subDepartment) return null;

  const toInfo = (m: (typeof subDepartment.memberships)[number]): SubDepartmentMemberInfo => ({
    userId: m.user.id,
    name: m.user.name,
    avatarUrl: m.user.avatarUrl ?? null,
    role: m.role,
    doNotAssign: m.doNotAssign,
  });

  const subManagers = subDepartment.memberships.filter((m) => m.role === "sub_manager").map(toInfo);
  const agents = subDepartment.memberships.filter((m) => m.role !== "sub_manager").map(toInfo);

  const mailboxes = (await listMailboxConnectionsForSubDepartment(subDepartment.id)).map((c) => ({
    address: c.address,
    status: c.status,
  }));

  return {
    id: subDepartment.id,
    name: subDepartment.name,
    prefix: subDepartment.prefix,
    color: subDepartment.color ?? avatarColorFor(subDepartment.name),
    departmentId: subDepartment.department.id,
    departmentName: subDepartment.department.name,
    memberCount: subDepartment.memberships.length,
    workloadThreshold: subDepartment.workloadThreshold,
    ticketsKeyed: subDepartment.counter?.lastNumber ?? 0,
    projectCount: subDepartment._count.projects,
    subManagers,
    agents,
    mailboxes,
  };
}
