import type { AuthProfile } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { subDepartmentInScope } from "@/lib/dept-scope"

export async function canManageSubDepartment(profile: AuthProfile, subDepartmentId: string): Promise<boolean> {
  if (!(await subDepartmentInScope(profile, subDepartmentId))) return false
  if (profile.role === "admin") return true
  if (profile.role === "manager") {
    const subDepartment = await prisma.subDepartment.findUnique({ where: { id: subDepartmentId }, select: { departmentId: true } })
    const managed = profile.managedDepartmentIds ?? []
    const granted = profile.grantedAccessDeptIds ?? []
    return !!subDepartment && [...managed, ...granted].includes(subDepartment.departmentId)
  }
  return profile.subDepartmentIds?.includes(subDepartmentId) ?? false
}
