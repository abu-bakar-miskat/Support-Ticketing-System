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
  return prisma.$transaction(async (tx) => {
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
    const before = (await Promise.all(params.changes.map((change) => currentGrant(tx, params.userId, change)))).filter(Boolean) as RoleChange[];
    if (stable(before) !== stable(params.expectedBefore)) throw new RoleChangeError("This role preview is stale. Refresh and review the current assignments.", "STALE_PREVIEW");
    for (let index = 0; index < params.changes.length; index++) {
      if (!canManage(actorNow, infos[index], before[index], params.changes[index])) throw new RoleChangeError("You cannot change this role assignment.", "FORBIDDEN");
    }
    for (const change of params.changes) await applyChange(tx, params.userId, params.actor.id, change);
    await synchronizeLegacyRoleAssignments(tx, params.userId);
    await recordAuditEvent({ client: tx, tenantId: infos[0].tenantId, actorId: params.actor.id, action: "ROLE_ASSIGNMENTS_CHANGED", targetType: "Profile", targetId: params.userId, before, after: params.changes });
    return { ...previewRoleChanges(before, params.changes), before, after: params.changes, tenantId: infos[0].tenantId };
  });
}

export function roleChangeHttpStatus(error: unknown) {
  if (!(error instanceof RoleChangeError)) return 500;
  return error.code === "STALE_PREVIEW" ? 409 : error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
}
