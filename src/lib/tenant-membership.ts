import "server-only";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export type MembershipRole = "admin" | "manager" | "sub_manager" | "agent";

/** Shown whenever someone tries to grant a second tenant-admin role. */
export const TENANT_ADMIN_EXCLUSIVE_ERROR =
  "This user is already a tenant admin of another organisation and cannot administer a second one.";

export class TenantAdminExclusiveError extends Error {
  constructor(message = TENANT_ADMIN_EXCLUSIVE_ERROR) {
    super(message);
    this.name = "TenantAdminExclusiveError";
  }
}

/**
 * A person may be tenant admin of at most one organisation. Returns the other
 * tenant when `userId` already holds an active admin membership outside
 * `forTenantId` (pass the tenant you're about to grant admin on).
 */
export async function findOtherTenantAdminConflict(
  db: Db,
  userId: string,
  forTenantId: string,
): Promise<{ tenantId: string; tenantName: string } | null> {
  const other = await db.tenantMembership.findFirst({
    where: {
      userId,
      role: "admin",
      isActive: true,
      tenantId: { not: forTenantId },
    },
    select: { tenantId: true, tenant: { select: { name: true } } },
  });
  if (!other) return null;
  return { tenantId: other.tenantId, tenantName: other.tenant.name };
}

/** True when the user already administers any tenant (used by create-tenant picker). */
export async function isTenantAdminAnywhere(db: Db, userId: string): Promise<boolean> {
  const row = await db.tenantMembership.findFirst({
    where: { userId, role: "admin", isActive: true },
    select: { userId: true },
  });
  return !!row;
}

/**
 * Ensure the user has an *active* `TenantMembership` in `tenantId`.
 *
 * Sub-department membership implies membership in that sub-department's tenant:
 * `getProfile` builds `profile.tenantIds` from `TenantMembership` rows, and the
 * tenant-scope Prisma extension gates every ticket read on it. Adding a user to a
 * sub-department in a tenant they don't already belong to — without this row —
 * makes every ticket there invisible (scoped `findUnique` returns null → the
 * ticket page 404s). Any path that grants a cross-tenant sub-department
 * membership MUST call this so the tenant scope lets them read their own tickets.
 *
 * Creates a least-privilege `agent` membership; never downgrades an existing
 * higher tenant role (sub-department power stays scoped via RoleAssignment).
 * Reactivates a deactivated row. Idempotent.
 */
export async function ensureTenantMembership(
  db: Db,
  tenantId: string,
  userId: string,
  baselineRole: MembershipRole = "agent",
): Promise<void> {
  await db.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: { isActive: true },
    create: { tenantId, userId, role: baselineRole as Role, isActive: true },
  });
}

/**
 * Apply a member's tenant role + department scope. Used both when adding an
 * existing user directly and when a tenant invite is accepted.
 *
 * - Ensures a `TenantMembership` with `role` (and marks it active).
 * - Sets `Profile.role` so the existing dept-scope logic treats them correctly.
 * - `admin`: tenant-wide — no department records.
 * - `manager`: a `DepartmentManager` for each selected department.
 * - `sub_manager`/`agent`: join a single sub-department (via `subDepartmentId`) —
 *   they are never department-scoped. Ignored for admin/manager.
 *
 * Department ids are filtered to those that actually belong to `tenantId`, and
 * `subDepartmentId` is only honoured when it belongs to `tenantId`.
 */
export async function applyTenantMembership(
  db: Db,
  opts: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    departmentIds?: string[];
    subDepartmentId?: string | null;
    actorId: string;
    /**
     * When false, skip RoleAssignment rebuild (caller will sync after its own
     * transaction commits). Default true. Never sync via a nested
     * `$transaction` while `db` is already an interactive transaction client —
     * that deadlocks the pool and makes invite/login verify hang.
     */
    syncRoles?: boolean;
  },
): Promise<{ departmentIds: string[] }> {
  const { tenantId, userId, role, actorId } = opts;

  // Tenant-admin is exclusive across organisations — never grant a second one.
  if (role === "admin") {
    const conflict = await findOtherTenantAdminConflict(db, userId, tenantId);
    if (conflict) {
      throw new TenantAdminExclusiveError();
    }
  }

  const requested = opts.departmentIds ?? [];
  const deptIds =
    role !== "admin" && requested.length > 0
      ? (
          await db.department.findMany({
            where: { id: { in: requested }, tenantId },
            select: { id: true },
          })
        ).map((d) => d.id)
      : [];

  await db.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: { role: role as Role, isActive: true },
    create: { tenantId, userId, role: role as Role },
  });

  // The app keys role checks off Profile.role, so reflect the chosen role there.
  await db.profile.update({ where: { id: userId }, data: { role: role as Role } });

  if (role === "manager") {
    for (const departmentId of deptIds) {
      await db.departmentManager.upsert({
        where: { departmentId_userId: { departmentId, userId } },
        update: {},
        create: { departmentId, userId, assignedBy: actorId },
      });
    }
  }

  // sub_manager/agent join a single sub-department (validated against the tenant).
  if ((role === "sub_manager" || role === "agent") && opts.subDepartmentId) {
    const sub = await db.subDepartment.findFirst({
      where: { id: opts.subDepartmentId, tenantId },
      select: { id: true },
    });
    if (sub) {
      await (db.subDepartmentMembership as any).upsert({
        where: { userId_subDepartmentId: { userId, subDepartmentId: sub.id } },
        update: { isActive: true, role: role as Role },
        create: { userId, subDepartmentId: sub.id, role: role as Role, isActive: true },
      });
      // Keep the legacy primary-membership pointer populated when unset.
      await db.profile.updateMany({
        where: { id: userId, subDepartmentId: null },
        data: { subDepartmentId: sub.id },
      });
    }
  }

  if (opts.syncRoles !== false) {
    // Root PrismaClient has $connect; interactive transaction clients do not.
    // Only the root client may open syncUserRoleAssignments' own transaction.
    if ("$connect" in db) {
      const { syncUserRoleAssignments } = await import("@/lib/role-assignment");
      await syncUserRoleAssignments(userId);
    } else {
      const { synchronizeLegacyRoleAssignments } = await import("@/lib/role-assignment");
      await synchronizeLegacyRoleAssignments(db, userId);
    }
  }

  return { departmentIds: deptIds };
}
