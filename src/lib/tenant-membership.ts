import "server-only";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export type MembershipRole = "admin" | "manager" | "sub_manager" | "staff";

/**
 * Apply a member's tenant role + department scope. Used both when adding an
 * existing user directly and when a tenant invite is accepted.
 *
 * - Ensures a `TenantMembership` with `role` (and marks it active).
 * - Sets `Profile.role` so the existing dept-scope logic treats them correctly.
 * - `admin`: tenant-wide — no department records.
 * - `manager`: a `DepartmentManager` for each selected department.
 * - `sub_manager`/`staff`: a `DepartmentMember` (direct membership) for each department.
 *
 * Department ids are filtered to those that actually belong to `tenantId`.
 */
export async function applyTenantMembership(
  db: Db,
  opts: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    departmentIds?: string[];
    actorId: string;
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

  for (const departmentId of deptIds) {
    if (role === "manager") {
      await db.departmentManager.upsert({
        where: { departmentId_userId: { departmentId, userId } },
        update: {},
        create: { departmentId, userId, assignedBy: actorId },
      });
    } else {
      await db.departmentMember.upsert({
        where: { departmentId_userId: { departmentId, userId } },
        update: {},
        create: { departmentId, userId, addedBy: actorId },
      });
    }
  }

  return { departmentIds: deptIds };
}
