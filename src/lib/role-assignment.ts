import "server-only";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

/**
 * Canonical authorization model (SRS D-06), slice 01.
 *
 * `RoleAssignment` is the target source of truth. Until the slice-03 write-path
 * cutover, `resolveUserScope` keeps a user's rows in sync from the existing role
 * tables on read (see `syncUserRoleAssignments`), so the resolver reads
 * `RoleAssignment` yet never goes stale — access is identical to before.
 */

export type ScopeType = "PLATFORM" | "TENANT" | "DEPARTMENT" | "SUB_DEPARTMENT";

export type ScopeRow = { role: Role; scopeType: ScopeType; scopeId: string | null };

export type UserScope = {
  /** Super admin — access to everything, all tenants. */
  isPlatformAdmin: boolean;
  /** Tenants the user belongs to. */
  tenantIds: string[];
  /** Tenants where the user is a tenant admin (role=admin @ TENANT). */
  tenantAdminIds: string[];
  /** Departments the user has a direct DEPARTMENT-scoped role in. */
  departmentIds: string[];
  /** Departments where the user is admin/manager. */
  departmentAdminIds: string[];
  /** Sub-departments (teams) the user has a role in. */
  subDepartmentIds: string[];
};

const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * Pure: the caller's effective global role, derived from their canonical role
 * assignments (SRS D-06). This — not the `Profile.role` column — is the
 * authorization signal; `getProfile` computes `role` from here so every
 * downstream `profile.role` check reads a resolver-derived value.
 *
 * Precedence mirrors the legacy column semantics:
 *   platform / tenant-admin  → admin
 *   dept admin·manager / tenant-manager → manager
 *   any sub-department lead   → lead
 *   otherwise                 → staff
 */
export function deriveEffectiveRole(rows: ScopeRow[]): Role {
  const has = (pred: (r: ScopeRow) => boolean) => rows.some(pred);
  if (has((r) => r.scopeType === "PLATFORM")) return "admin";
  if (has((r) => r.scopeType === "TENANT" && r.role === "admin")) return "admin";
  if (has((r) => r.scopeType === "DEPARTMENT" && (r.role === "admin" || r.role === "manager"))) {
    return "manager";
  }
  if (has((r) => r.scopeType === "TENANT" && r.role === "manager")) return "manager";
  if (has((r) => r.role === "lead")) return "lead";
  return "staff";
}

/** Pure: fold RoleAssignment rows into a UserScope. Unit-tested. */
export function shapeScope(rows: ScopeRow[]): UserScope {
  const scope: UserScope = {
    isPlatformAdmin: false,
    tenantIds: [],
    tenantAdminIds: [],
    departmentIds: [],
    departmentAdminIds: [],
    subDepartmentIds: [],
  };
  for (const r of rows) {
    if (r.scopeType === "PLATFORM") {
      scope.isPlatformAdmin = true;
    } else if (r.scopeType === "TENANT" && r.scopeId) {
      scope.tenantIds.push(r.scopeId);
      if (r.role === "admin") scope.tenantAdminIds.push(r.scopeId);
    } else if (r.scopeType === "DEPARTMENT" && r.scopeId) {
      scope.departmentIds.push(r.scopeId);
      if (r.role === "admin" || r.role === "manager") scope.departmentAdminIds.push(r.scopeId);
    } else if (r.scopeType === "SUB_DEPARTMENT" && r.scopeId) {
      scope.subDepartmentIds.push(r.scopeId);
    }
  }
  scope.tenantIds = uniq(scope.tenantIds);
  scope.tenantAdminIds = uniq(scope.tenantAdminIds);
  scope.departmentIds = uniq(scope.departmentIds);
  scope.departmentAdminIds = uniq(scope.departmentAdminIds);
  scope.subDepartmentIds = uniq(scope.subDepartmentIds);
  return scope;
}

/**
 * Pure: decide whether a scope may access a department. `deptTenantId` is the
 * department's tenant; `subDeptDepartmentIds` is the set of department ids owning
 * the user's sub-departments (teams). Unit-tested.
 */
export function decideDepartmentAccess(
  scope: UserScope,
  departmentId: string,
  deptTenantId: string | null,
  subDeptDepartmentIds: string[],
): boolean {
  if (scope.isPlatformAdmin) return true;
  if (scope.departmentIds.includes(departmentId)) return true;
  if (deptTenantId && scope.tenantAdminIds.includes(deptTenantId)) return true;
  if (subDeptDepartmentIds.includes(departmentId)) return true;
  return false;
}

/** Derive the canonical assignments for a user from the existing role tables. */
async function deriveAssignments(userId: string): Promise<ScopeRow[]> {
  const [profile, tenantM, deptMgr, deptMem, deptAcc, teamM] = await Promise.all([
    prisma.profile.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }),
    prisma.tenantMembership.findMany({ where: { userId, isActive: true }, select: { role: true, tenantId: true } }),
    prisma.departmentManager.findMany({ where: { userId }, select: { departmentId: true } }),
    prisma.departmentMember.findMany({ where: { userId }, select: { departmentId: true } }),
    prisma.departmentAccess.findMany({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { departmentId: true },
    }),
    prisma.teamMembership.findMany({ where: { userId, isActive: true }, select: { role: true, teamId: true } }),
  ]);

  const rows: ScopeRow[] = [];
  if (profile?.isSuperAdmin) rows.push({ role: "admin", scopeType: "PLATFORM", scopeId: null });
  for (const t of tenantM) rows.push({ role: t.role, scopeType: "TENANT", scopeId: t.tenantId });
  for (const d of deptMgr) rows.push({ role: "manager", scopeType: "DEPARTMENT", scopeId: d.departmentId });
  for (const d of deptMem) rows.push({ role: "staff", scopeType: "DEPARTMENT", scopeId: d.departmentId });
  for (const a of deptAcc) rows.push({ role: "staff", scopeType: "DEPARTMENT", scopeId: a.departmentId });
  for (const tm of teamM) rows.push({ role: tm.role, scopeType: "SUB_DEPARTMENT", scopeId: tm.teamId });

  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.role}|${r.scopeType}|${r.scopeId ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Rebuild a user's RoleAssignment rows from the source tables. Idempotent.
 * Transitional bridge until slice 03 makes RoleAssignment the write source.
 */
export async function syncUserRoleAssignments(userId: string): Promise<void> {
  const derived = await deriveAssignments(userId);
  await prisma.$transaction([
    prisma.roleAssignment.deleteMany({ where: { userId } }),
    prisma.roleAssignment.createMany({
      data: derived.map((r) => ({ userId, role: r.role, scopeType: r.scopeType, scopeId: r.scopeId })),
    }),
  ]);
}

/** Resolve a user's effective scope, reading RoleAssignment (kept fresh). */
export async function resolveUserScope(userId: string): Promise<UserScope> {
  await syncUserRoleAssignments(userId);
  const rows = await prisma.roleAssignment.findMany({
    where: { userId },
    select: { role: true, scopeType: true, scopeId: true },
  });
  return shapeScope(rows as ScopeRow[]);
}

/** Whether a user may enter/see a department (first consumer of the resolver). */
export async function canAccessDepartment(userId: string, departmentId: string): Promise<boolean> {
  const scope = await resolveUserScope(userId);
  if (scope.isPlatformAdmin) return true;
  if (scope.departmentIds.includes(departmentId)) return true;

  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { tenantId: true },
  });
  if (!dept) return false;

  let subDeptDepartmentIds: string[] = [];
  if (scope.subDepartmentIds.length > 0) {
    const teams = await prisma.team.findMany({
      where: { id: { in: scope.subDepartmentIds } },
      select: { departmentId: true },
    });
    subDeptDepartmentIds = teams.map((t) => t.departmentId);
  }
  return decideDepartmentAccess(scope, departmentId, dept.tenantId, subDeptDepartmentIds);
}
