import "server-only";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export type MembershipRole = "admin" | "manager" | "sub_manager" | "agent";

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
