import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { recordAuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import { synchronizeLegacyRoleAssignments, type ScopeType } from "@/lib/role-assignment";

export type RoleChange = { scopeType: Exclude<ScopeType, "PLATFORM">; scopeId: string; role: Role };
export type RoleChangeActor = {
  id: string;
  isSuperAdmin?: boolean;
  activeTenantId?: string | null;
  tenantMemberships?: { tenantId: string; role: string }[];
  departmentAdminIds?: string[];
  managedDepartmentIds?: string[];
};

export class RoleChangeError extends Error {
  constructor(message: string, readonly code: "INVALID_SCOPE" | "FORBIDDEN" | "STALE_PREVIEW" | "NOT_FOUND") {
    super(message);
  }
}

const validRoles: Record<RoleChange["scopeType"], Role[]> = {
  TENANT: ["admin", "manager", "sub_manager", "agent"],
  DEPARTMENT: ["admin", "manager", "agent"],
  SUB_DEPARTMENT: ["sub_manager", "agent"],
};

export const SUB_DEPARTMENT_ROLES = validRoles.SUB_DEPARTMENT;

export function isValidSubDepartmentRole(role: string): role is Role {
  return SUB_DEPARTMENT_ROLES.includes(role as Role);
}

function stable(value: unknown) { return JSON.stringify(value); }

/** Pure, UI-safe preview for an exact set of scoped replacements. */
export function previewRoleChanges(before: RoleChange[], after: RoleChange[]) {
  const key = (change: RoleChange) => `${change.scopeType}:${change.scopeId}`;
  const afterByScope = new Map(after.map((change) => [key(change), change]));
  const beforeByScope = new Map(before.map((change) => [key(change), change]));
  return {
    removed: before.filter((change) => {
      const replacement = afterByScope.get(key(change));
      return replacement !== undefined && replacement.role !== change.role;
    }),
    added: after.filter((change) => {
      const previous = beforeByScope.get(key(change));
      return previous === undefined || previous.role !== change.role;
    }),
    retained: before.filter((change) => afterByScope.get(key(change))?.role === change.role),
  };
}

function validateChanges(changes: RoleChange[]) {
  if (changes.length === 0) throw new RoleChangeError("At least one scoped role change is required.", "INVALID_SCOPE");
  const scopes = new Set<string>();
  for (const change of changes) {
    if (!change.scopeId || !validRoles[change.scopeType].includes(change.role)) {
      throw new RoleChangeError("The role is not valid for this scope.", "INVALID_SCOPE");
    }
    const key = `${change.scopeType}:${change.scopeId}`;
    if (scopes.has(key)) throw new RoleChangeError("Each scope may be changed once per request.", "INVALID_SCOPE");
    scopes.add(key);
  }
}

async function scopeInfo(tx: Prisma.TransactionClient, change: RoleChange) {
  if (change.scopeType === "TENANT") {
    const row = await tx.tenant.findUnique({ where: { id: change.scopeId }, select: { id: true } });
    if (!row) throw new RoleChangeError("Tenant not found.", "NOT_FOUND");
    return { tenantId: row.id, departmentId: null };
  }
  if (change.scopeType === "DEPARTMENT") {
    const row = await tx.department.findUnique({ where: { id: change.scopeId }, select: { tenantId: true } });
    if (!row) throw new RoleChangeError("Department not found.", "NOT_FOUND");
    return { tenantId: row.tenantId, departmentId: change.scopeId };
  }
  const row = await tx.subDepartment.findUnique({ where: { id: change.scopeId }, select: { tenantId: true, departmentId: true } });
  if (!row) throw new RoleChangeError("Sub-department not found.", "NOT_FOUND");
  return row;
}

async function currentGrant(tx: Prisma.TransactionClient, userId: string, change: RoleChange): Promise<RoleChange | undefined> {
  if (change.scopeType === "TENANT") {
    const row = await tx.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: change.scopeId, userId } }, select: { role: true } });
    return row ? { ...change, role: row.role } : undefined;
  }
  if (change.scopeType === "DEPARTMENT") {
    const row = await tx.departmentManager.findUnique({ where: { departmentId_userId: { departmentId: change.scopeId, userId } }, select: { role: true } });
    return row ? { ...change, role: row.role === "admin" ? "admin" : "manager" } : { ...change, role: "agent" };
  }
  const row = await tx.subDepartmentMembership.findUnique({ where: { userId_subDepartmentId: { userId, subDepartmentId: change.scopeId } }, select: { role: true, isActive: true } });
  return row?.isActive ? { ...change, role: row.role } : undefined;
}

/** Read the current grant for one scope outside an open transaction (preview / legacy API). */
export async function readRoleGrant(userId: string, change: RoleChange): Promise<RoleChange | undefined> {
  return prisma.$transaction((tx) => currentGrant(tx, userId, change));
}

/** Load active legacy role grants for a user, optionally limited to one tenant. */
export async function loadUserRoleChanges(userId: string, tenantId?: string): Promise<RoleChange[]> {
  const tenantFilter = tenantId ? { tenantId } : {};
  const [tenantM, deptMgr, subDepartmentM] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { userId, isActive: true, ...tenantFilter },
      select: { role: true, tenantId: true },
    }),
    prisma.departmentManager.findMany({
      where: { userId, ...(tenantId ? { department: { tenantId } } : {}) },
      select: { departmentId: true, role: true },
    }),
    prisma.subDepartmentMembership.findMany({
      where: { userId, isActive: true, ...(tenantId ? { subDepartment: { tenantId } } : {}) },
      select: { role: true, subDepartmentId: true },
    }),
  ]);

  const changes: RoleChange[] = [];
  for (const row of tenantM) {
    changes.push({ scopeType: "TENANT", scopeId: row.tenantId, role: row.role });
  }
  for (const row of deptMgr) {
    changes.push({
      scopeType: "DEPARTMENT",
      scopeId: row.departmentId,
      role: row.role === "admin" ? "admin" : "manager",
    });
  }
  for (const row of subDepartmentM) {
    changes.push({ scopeType: "SUB_DEPARTMENT", scopeId: row.subDepartmentId, role: row.role });
  }
  return changes;
}

/**
 * Translate a department-context role pick from the members UI into explicit
 * scoped operations. Manager-to-Sub-manager removes the department manager grant
 * and creates/updates the sub-department grant in the same request.
 */
export function planLegacyDepartmentRoleUpdate(params: {
  departmentId: string;
  subDepartmentId?: string | null;
  newRole: Role;
  current: RoleChange[];
}): RoleChange[] {
  const { departmentId, subDepartmentId, newRole, current } = params;
  const byScope = new Map(current.map((change) => [`${change.scopeType}:${change.scopeId}`, change]));
  const deptGrant = byScope.get(`DEPARTMENT:${departmentId}`);
  const changes: RoleChange[] = [];

  if (newRole === "admin" || newRole === "manager") {
    changes.push({ scopeType: "DEPARTMENT", scopeId: departmentId, role: newRole });
    return changes;
  }

  if (newRole === "sub_manager") {
    if (!subDepartmentId) {
      throw new RoleChangeError("Sub-manager assignment requires a sub-department.", "INVALID_SCOPE");
    }
    if (deptGrant && (deptGrant.role === "manager" || deptGrant.role === "admin")) {
      changes.push({ scopeType: "DEPARTMENT", scopeId: departmentId, role: "agent" });
    }
    changes.push({ scopeType: "SUB_DEPARTMENT", scopeId: subDepartmentId, role: "sub_manager" });
    return changes;
  }

  if (deptGrant && deptGrant.role !== "agent") {
    changes.push({ scopeType: "DEPARTMENT", scopeId: departmentId, role: "agent" });
  }
  if (subDepartmentId) {
    changes.push({ scopeType: "SUB_DEPARTMENT", scopeId: subDepartmentId, role: "agent" });
  }
  if (changes.length === 0) {
    throw new RoleChangeError("No scoped role grant exists to update for this department.", "INVALID_SCOPE");
  }
  return changes;
}

export async function expectedBeforeForChanges(userId: string, changes: RoleChange[]): Promise<RoleChange[]> {
  const before: RoleChange[] = [];
  for (const change of changes) {
    const grant = await readRoleGrant(userId, change);
    if (grant) before.push(grant);
  }
  return before;
}

export function buildRoleChangeActor(profile: {
  id: string;
  isSuperAdmin?: boolean;
  activeTenantId?: string | null;
  tenantMemberships?: { tenantId: string; role: string }[];
  departmentAdminIds?: string[];
  managedDepartmentIds?: string[];
}): RoleChangeActor {
  return {
    id: profile.id,
    isSuperAdmin: profile.isSuperAdmin,
    activeTenantId: profile.activeTenantId,
    tenantMemberships: profile.tenantMemberships,
    departmentAdminIds: profile.departmentAdminIds,
    managedDepartmentIds: profile.managedDepartmentIds,
  };
}

function canManage(actor: RoleChangeActor, info: { tenantId: string; departmentId: string | null }, before: RoleChange | undefined, after: RoleChange) {
  if (actor.isSuperAdmin && actor.activeTenantId === info.tenantId) return true;
  if ((actor.tenantMemberships ?? []).some((m) => m.tenantId === info.tenantId && m.role === "admin")) return true;
  if (!info.departmentId) return false;
  const isAdminChange = before?.role === "admin" || after.role === "admin";
  if (isAdminChange) return (actor.departmentAdminIds ?? []).includes(info.departmentId);
  return (actor.departmentAdminIds ?? []).includes(info.departmentId) || (actor.managedDepartmentIds ?? []).includes(info.departmentId);
}

async function applyChange(tx: Prisma.TransactionClient, userId: string, actorId: string, change: RoleChange) {
  if (change.scopeType === "TENANT") {
    await tx.tenantMembership.upsert({ where: { tenantId_userId: { tenantId: change.scopeId, userId } }, create: { tenantId: change.scopeId, userId, role: change.role, isActive: true }, update: { role: change.role, isActive: true } });
  } else if (change.scopeType === "DEPARTMENT") {
    if (change.role === "agent") await tx.departmentManager.deleteMany({ where: { departmentId: change.scopeId, userId } });
    else await tx.departmentManager.upsert({ where: { departmentId_userId: { departmentId: change.scopeId, userId } }, create: { departmentId: change.scopeId, userId, role: change.role, assignedBy: actorId }, update: { role: change.role } });
  } else {
    await tx.subDepartmentMembership.upsert({ where: { userId_subDepartmentId: { userId, subDepartmentId: change.scopeId } }, create: { userId, subDepartmentId: change.scopeId, role: change.role, isActive: true }, update: { role: change.role, isActive: true } });
  }
}

/**
 * Legacy-authority role change. `expectedBefore` is the current optimistic
 * concurrency token until the additive authorization-revision migration lands.
 */
export async function changeRoles(params: { userId: string; actor: RoleChangeActor; changes: RoleChange[]; expectedBefore: RoleChange[] }) {
  validateChanges(params.changes);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Profile" WHERE "id" = ${params.userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Profile" WHERE "id" = ${params.actor.id} FOR UPDATE`;
    const target = await tx.profile.findUnique({ where: { id: params.userId }, select: { id: true, deletedAt: true } });
    if (!target || target.deletedAt) throw new RoleChangeError("User not found.", "NOT_FOUND");
    const [actorProfile, actorMemberships, actorDepartments] = await Promise.all([
      tx.profile.findUnique({ where: { id: params.actor.id }, select: { isSuperAdmin: true, deletedAt: true } }),
      tx.tenantMembership.findMany({ where: { userId: params.actor.id, isActive: true }, select: { tenantId: true, role: true } }),
      tx.departmentManager.findMany({ where: { userId: params.actor.id }, select: { departmentId: true, role: true } }),
    ]);
    if (!actorProfile || actorProfile.deletedAt) throw new RoleChangeError("You cannot change this role assignment.", "FORBIDDEN");
    const actorNow: RoleChangeActor = {
      ...params.actor,
      isSuperAdmin: actorProfile.isSuperAdmin,
      tenantMemberships: actorMemberships,
      departmentAdminIds: actorDepartments.filter((row) => row.role === "admin").map((row) => row.departmentId),
      managedDepartmentIds: actorDepartments.map((row) => row.departmentId),
    };
    const infos = await Promise.all(params.changes.map((change) => scopeInfo(tx, change)));
    if (new Set(infos.map((info) => info.tenantId)).size !== 1) throw new RoleChangeError("A role change may affect only one tenant.", "INVALID_SCOPE");
    const beforeByChange = await Promise.all(params.changes.map((change) => currentGrant(tx, params.userId, change)));
    const before = beforeByChange.filter((grant): grant is RoleChange => grant !== undefined);
    if (stable(before) !== stable(params.expectedBefore)) {
      throw new RoleChangeError("This role preview is stale. Refresh and review the current assignments.", "STALE_PREVIEW");
    }
    for (let index = 0; index < params.changes.length; index++) {
      if (!canManage(actorNow, infos[index], beforeByChange[index], params.changes[index])) {
        throw new RoleChangeError("You cannot change this role assignment.", "FORBIDDEN");
      }
    }
    for (const change of params.changes) await applyChange(tx, params.userId, params.actor.id, change);
    await synchronizeLegacyRoleAssignments(tx, params.userId);
    // Attribute to a department when any changed scope is department-bound, so
    // the change is visible in that department's audit view as well as the tenant's.
    const auditDepartmentId = infos.find((info) => info.departmentId)?.departmentId ?? null;
    await recordAuditEvent({ client: tx, tenantId: infos[0].tenantId, departmentId: auditDepartmentId, actorId: params.actor.id, action: "ROLE_ASSIGNMENTS_CHANGED", targetType: "Profile", targetId: params.userId, before, after: params.changes });
    return { ...previewRoleChanges(before, params.changes), before, after: params.changes, tenantId: infos[0].tenantId };
  });
  // Role assignments are committed — drop the target's cached role scope so the
  // change takes effect immediately on this instance (Cache A). This path
  // rebuilds RoleAssignment via synchronizeLegacyRoleAssignments, not
  // syncUserRoleAssignments, so it needs its own invalidation.
  const { invalidateUserScope } = await import("@/lib/scope-cache");
  invalidateUserScope(params.userId);
  return result;
}

export function roleChangeHttpStatus(error: unknown) {
  if (!(error instanceof RoleChangeError)) return 500;
  return error.code === "STALE_PREVIEW" ? 409 : error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
}
