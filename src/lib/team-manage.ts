import type { AuthProfile } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { teamInScope } from "@/lib/dept-scope"

export async function canManageTeam(profile: AuthProfile, teamId: string): Promise<boolean> {
  if (!(await teamInScope(profile, teamId))) return false
  if (profile.role === "admin") return true
  if (profile.role === "manager") {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { departmentId: true } })
    const managed = profile.managedDepartmentIds ?? []
    const granted = profile.grantedAccessDeptIds ?? []
    return !!team && [...managed, ...granted].includes(team.departmentId)
  }
  return profile.teamIds?.includes(teamId) ?? false
}
