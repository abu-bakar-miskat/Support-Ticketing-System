import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
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

const globalForRoleAssignments = globalThis as unknown as {
  roleAssignmentSyncs?: Map<string, Promise<void>>;
};

// A page bootstraps several scoped endpoints in parallel. They all resolve the
// same signed-in user's scope, so share one rebuild instead of queuing identical
// interactive transactions behind the single-connection DB pool.
const roleAssignmentSyncs =
  globalForRoleAssignments.roleAssignmentSyncs ?? new Map<string, Promise<void>>();
globalForRoleAssignments.roleAssignmentSyncs = roleAssignmentSyncs;

export type UserScope = {
  /** Super admin — access to everything, all tenants. */
  isPlatformAdmin: boolean;
  /** Tenants the user belongs to. */
  tenantIds: string[];
  /** Tenants where the user is a tenant admin (role=admin @ TENANT). */
  tenantAdminIds: string[];
  /** Departments the user has a direct DEPARTMENT-scoped role in. */
  departmentIds: string[];
  /** Departments where the user is Admin (role=admin @ DEPARTMENT). */
  departmentAdminIds: string[];
  /** Departments where the user is Manager or Admin (operational power). */
  departmentManagerIds: string[];
  /** Sub-departments (subDepartments) the user has a role in. */
  subDepartmentIds: string[];
};

const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * Pure: the caller's effective global role, derived from their canonical role
 * assignments (SRS D-06). This — not the `Profile.role` column — is the
 * authorization signal; `getProfile` computes `role` from here so every
 * downstream `profile.role` check reads a resolver-derived value.
 *
 * Precedence:
 *   tenant-admin              → admin
 *   dept admin·manager / tenant-manager → manager
 *   any sub-department lead   → sub_manager
 *   otherwise                 → agent
 *
 * PLATFORM (Super Admin) is **not** an authorization role here — Super Admin
 * is `isSuperAdmin` / `isPlatformAdmin` and must hold a tenant or department
 * Admin assignment to pass department-admin checks (role-hierarchy.md).
 */
export function deriveEffectiveRole(rows: ScopeRow[]): Role {
  const has = (pred: (r: ScopeRow) => boolean) => rows.some(pred);
  if (has((r) => r.scopeType === "TENANT" && r.role === "admin")) return "admin";
  if (has((r) => r.scopeType === "DEPARTMENT" && r.role === "admin")) {
    return "manager";
  }
  if (has((r) => r.scopeType === "DEPARTMENT" && r.role === "manager")) {
    return "manager";
  }
  if (has((r) => r.scopeType === "TENANT" && r.role === "manager")) return "manager";
  if (has((r) => r.role === "sub_manager")) return "sub_manager";
  return "agent";
}

/** Pure: fold RoleAssignment rows into a UserScope. Unit-tested. */
export function shapeScope(rows: ScopeRow[]): UserScope {
  const scope: UserScope = {
    isPlatformAdmin: false,
    tenantIds: [],
    tenantAdminIds: [],
    departmentIds: [],
    departmentAdminIds: [],
    departmentManagerIds: [],
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
      if (r.role === "admin") scope.departmentAdminIds.push(r.scopeId);
      if (r.role === "admin" || r.role === "manager") scope.departmentManagerIds.push(r.scopeId);
    } else if (r.scopeType === "SUB_DEPARTMENT" && r.scopeId) {
      scope.subDepartmentIds.push(r.scopeId);
    }
  }
  scope.tenantIds = uniq(scope.tenantIds);
  scope.tenantAdminIds = uniq(scope.tenantAdminIds);
  scope.departmentIds = uniq(scope.departmentIds);
  scope.departmentAdminIds = uniq(scope.departmentAdminIds);
  scope.departmentManagerIds = uniq(scope.departmentManagerIds);
  scope.subDepartmentIds = uniq(scope.subDepartmentIds);
  return scope;
}

/**
 * Pure: decide whether a scope may access a department. `deptTenantId` is the
 * department's tenant; `subDeptDepartmentIds` is the set of department ids owning
 * the user's sub-departments (subDepartments). Unit-tested.
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

/**
 * Pure: the set of sub-department (subDepartment) ids a caller may see *within one
 * department* (SRS SD-06). Returns `null` when the caller has whole-department
 * access — platform admin, an admin/manager of the department's tenant, or a
 * direct DEPARTMENT-scoped role — meaning "no sub-department restriction, all
 * subDepartments". Otherwise returns exactly the caller's granted sub-departments that
 * belong to this department; an empty set means the caller sees nothing here.
 *
 * `departmentTeamIds` is the department's full set of subDepartment (sub-department) ids;
 * `deptTenantId` is the department's tenant. Unit-tested.
 */
export function subDepartmentScopeForDepartment(
  scope: UserScope,
  departmentId: string,
  departmentSubDepartmentIds: string[],
  deptTenantId: string | null,
): Set<string> | null {
  if (scope.isPlatformAdmin) return null;
  if (deptTenantId && scope.tenantAdminIds.includes(deptTenantId)) return null;
  if (scope.departmentIds.includes(departmentId)) return null;
  // Sub-department-only caller: restrict to their granted subDepartments inside this dept.
  const allowed = new Set(departmentSubDepartmentIds.filter((t) => scope.subDepartmentIds.includes(t)));
  return allowed;
}

/**
 * Pure: the caller's GLOBAL (cross-department) sub-department team-id
 * allowlist for the non-bypassable Prisma scope extension (SD-06, see
 * `lib/prisma-scope.ts`'s `TicketScope.subDepartmentTeamIds`). Unlike
 * {@link subDepartmentScopeForDepartment}, which answers "which subDepartments within
 * *this* department", the scope extension applies one flat allowlist across
 * every ticket read regardless of department — so this expands DEPARTMENT-
 * and tenant-admin grants into their full subDepartment lists rather than leaving them
 * implicit.
 *
 * Returns `null` when the caller has no restriction anywhere (platform admin,
 * or admin of every tenant they belong to) — i.e. "whole-department access,
 * all subDepartments". Otherwise returns the finite set of every subDepartment id the caller
 * may see: their direct subDepartment memberships, every subDepartment in a department they
 * hold DEPARTMENT-scoped access to, and every subDepartment in a tenant they admin.
 * An empty (non-null) array correctly means "sees no tickets anywhere" for a
 * caller with no grants at all — callers must not collapse that to `null`.
 */
export function computeSubDepartmentTeamIds(
  scope: UserScope,
  departmentTeamIds: Record<string, string[]>,
  tenantTeamIds: Record<string, string[]>,
): string[] | null {
  if (scope.isPlatformAdmin) return null;
  if (scope.tenantIds.length > 0 && scope.tenantIds.every((t) => scope.tenantAdminIds.includes(t))) {
    return null;
  }

  const allowed = new Set(scope.subDepartmentIds);
  for (const deptId of scope.departmentIds) {
    for (const teamId of departmentTeamIds[deptId] ?? []) allowed.add(teamId);
  }
  for (const tenantId of scope.tenantAdminIds) {
    for (const teamId of tenantTeamIds[tenantId] ?? []) allowed.add(teamId);
  }
  return [...allowed];
}

/** DB layer for {@link computeSubDepartmentTeamIds}: fetches the subDepartment lists it needs. */
export async function resolveSubDepartmentTeamIds(userId: string): Promise<string[] | null> {
  const scope = await resolveUserScope(userId);
  if (scope.isPlatformAdmin) return null;
  if (scope.tenantIds.length > 0 && scope.tenantIds.every((t) => scope.tenantAdminIds.includes(t))) {
    return null;
  }

  // These lookups bootstrap the caller's own scope, so they must NOT re-enter the
  // tenant-scope extension: `subDepartment` is a scoped model, and resolving its
  // scope calls back into `resolveSubDepartmentTeamIds` → infinite recursion that
  // exhausts the pool and surfaces as P2028 (see lib/prisma-scope + lib/db). The
  // `where` clauses already restrict to the caller's own departments/tenants, so
  // running unscoped here leaks nothing.
  const [deptSubDepartments, tenantSubDepartments] = await runAsSystem(() =>
    Promise.all([
      scope.departmentIds.length > 0
        ? prisma.subDepartment.findMany({ where: { departmentId: { in: scope.departmentIds } }, select: { id: true, departmentId: true } })
        : Promise.resolve([]),
      scope.tenantAdminIds.length > 0
        ? prisma.subDepartment.findMany({ where: { tenantId: { in: scope.tenantAdminIds } }, select: { id: true, tenantId: true } })
        : Promise.resolve([]),
    ]),
  );

  const departmentTeamIds: Record<string, string[]> = {};
  for (const t of deptSubDepartments) (departmentTeamIds[t.departmentId] ??= []).push(t.id);
  const tenantTeamIds: Record<string, string[]> = {};
  for (const t of tenantSubDepartments) (tenantTeamIds[t.tenantId] ??= []).push(t.id);

  return computeSubDepartmentTeamIds(scope, departmentTeamIds, tenantTeamIds);
}

/**
 * Pure: the effective managers of a sub-department for authz + notification
 * routing (SRS SD-06). A sub-department's own assigned managers win; when it has
 * none, responsibility defaults up to the parent Department's admins/managers.
 * Returns a de-duplicated, order-stable list. Unit-tested.
 */
export function resolveEffectiveSubDepartmentManager(params: {
  subDepartmentManagerUserIds: string[];
  departmentAdminUserIds: string[];
}): string[] {
  const own = uniq(params.subDepartmentManagerUserIds);
  if (own.length > 0) return own;
  return uniq(params.departmentAdminUserIds);
}

type RoleDerivationClient = Pick<
  Prisma.TransactionClient,
  | "profile"
  | "tenantMembership"
  | "departmentManager"
  | "departmentMember"
  | "departmentAccess"
  | "subDepartmentMembership"
>;

/** Derive the canonical assignments for a user from the existing role tables. */
async function deriveAssignmentsFromClient(client: RoleDerivationClient, userId: string): Promise<ScopeRow[]> {
  const [profile, tenantM, deptMgr, deptMem, deptAcc, subDepartmentM] = await Promise.all([
    client.profile.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }),
    client.tenantMembership.findMany({ where: { userId, isActive: true }, select: { role: true, tenantId: true } }),
    client.departmentManager.findMany({ where: { userId }, select: { departmentId: true, role: true } }),
    client.departmentMember.findMany({ where: { userId }, select: { departmentId: true } }),
    client.departmentAccess.findMany({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { departmentId: true },
    }),
    client.subDepartmentMembership.findMany({ where: { userId, isActive: true }, select: { role: true, subDepartmentId: true } }),
  ]);

  const rows: ScopeRow[] = [];
  if (profile?.isSuperAdmin) rows.push({ role: "admin", scopeType: "PLATFORM", scopeId: null });
  for (const t of tenantM) rows.push({ role: t.role, scopeType: "TENANT", scopeId: t.tenantId });
  for (const d of deptMgr) {
    // A department-scoped Admin surfaces as DEPARTMENT+admin (→ departmentAdminIds);
    // any other value is operational Manager power.
    const role = d.role === "admin" ? "admin" : "manager";
    rows.push({ role, scopeType: "DEPARTMENT", scopeId: d.departmentId });
  }
  for (const d of deptMem) rows.push({ role: "agent", scopeType: "DEPARTMENT", scopeId: d.departmentId });
  for (const a of deptAcc) rows.push({ role: "agent", scopeType: "DEPARTMENT", scopeId: a.departmentId });
  for (const tm of subDepartmentM) rows.push({ role: tm.role, scopeType: "SUB_DEPARTMENT", scopeId: tm.subDepartmentId });

  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.role}|${r.scopeType}|${r.scopeId ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function deriveAssignments(userId: string): Promise<ScopeRow[]> {
  return deriveAssignmentsFromClient(prisma, userId);
}

/**
 * Rebuild RoleAssignment rows from legacy tables inside an open transaction.
 * Callers must hold a per-user lock before invoking when racing with readers.
 */
export async function synchronizeLegacyRoleAssignments(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const derived = await deriveAssignmentsFromClient(tx, userId);
  const data = derived.map((r) => ({ userId, role: r.role, scopeType: r.scopeType, scopeId: r.scopeId }));
  await tx.roleAssignment.deleteMany({ where: { userId } });
  if (data.length > 0) {
    await tx.roleAssignment.createMany({ data });
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err != null && typeof err === "object" && (err as { code?: string }).code === "P2002";
}

/**
 * Rebuild a user's RoleAssignment rows from the source tables. Idempotent.
 * Transitional bridge until slice 03 makes RoleAssignment the write source.
 */
async function rebuildUserRoleAssignments(userId: string): Promise<void> {
  // Interactive (callback) form — batch `$transaction([...])` binds PrismaPromises
  // to a single client so P2028 mid-flight cannot be replayed (see lib/db.ts).
  const write = () =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Profile" WHERE "id" = ${userId} FOR UPDATE`;
      await synchronizeLegacyRoleAssignments(tx, userId);
    });

  try {
    await write();
  } catch (err) {
    // Concurrent resolveUserScope calls (e.g. post-login burst) can race on the
    // unique index; replay once — deleteMany+createMany is idempotent.
    if (isUniqueViolation(err)) {
      await write();
      return;
    }
    throw err;
  }
}

export async function syncUserRoleAssignments(userId: string): Promise<void> {
  const existing = roleAssignmentSyncs.get(userId);
  if (existing) return existing;

  const sync = rebuildUserRoleAssignments(userId);
  roleAssignmentSyncs.set(userId, sync);
  try {
    await sync;
  } finally {
    if (roleAssignmentSyncs.get(userId) === sync) {
      roleAssignmentSyncs.delete(userId);
    }
  }
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
    const subDepartments = await prisma.subDepartment.findMany({
      where: { id: { in: scope.subDepartmentIds } },
      select: { departmentId: true },
    });
    subDeptDepartmentIds = subDepartments.map((t) => t.departmentId);
  }
  return decideDepartmentAccess(scope, departmentId, dept.tenantId, subDeptDepartmentIds);
}
