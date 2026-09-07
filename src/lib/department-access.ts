import "server-only"
import { prisma } from "@/lib/db"

/**
 * Cross-department access (DepartmentAccess) is for department managers (and
 * tenant/platform admins) only. Agents and sub-managers collaborate across
 * sub-departments via SubDepartmentMembership instead.
 */
export async function isEligibleForDepartmentAccess(userId: string): Promise<boolean> {
  const [manager, tenantAdmin, profile] = await Promise.all([
    prisma.departmentManager.findFirst({
      where: { userId },
      select: { id: true },
    }),
    prisma.tenantMembership.findFirst({
      where: { userId, role: "admin", isActive: true },
      select: { id: true },
    }),
    prisma.profile.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true, role: true },
    }),
  ])

  if (manager || tenantAdmin) return true
  if (profile?.isSuperAdmin) return true
  // Profile.role may lag assignments; still accept explicit manager/admin labels.
  if (profile?.role === "manager" || profile?.role === "admin") return true
  return false
}

export const DEPARTMENT_ACCESS_ELIGIBILITY_ERROR =
  "Cross-department access is only for department managers. Add agents and sub-managers to a sub-department instead."
