import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { dedupeMiscProjects } from "@/lib/misc-project"
import { dedupeSupportProjects } from "@/lib/support-project"
import { assignedProjectsInDeptWhere } from "@/lib/cross-access"

export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const deptScope = await getProfileDeptScope(profile)
  const isAdmin = profile.role === "admin"
  const isManager = profile.role === "manager"

  const rawProjects = await (async () => {
    if (deptScope?.activeDeptId) {
      const id = deptScope.activeDeptId
      if (deptScope.isCrossAccessOnly) {
        return prisma.project.findMany({
          where: assignedProjectsInDeptWhere(profile.id, id),
          select: { id: true, name: true, color: true, slug: true, subDepartmentId: true, kind: true, departmentId: true },
          orderBy: { name: "asc" },
        })
      }
      return prisma.project.findMany({
        where: { OR: [{ departmentId: id }, { subDepartment: { departmentId: id } }] },
        select: { id: true, name: true, color: true, slug: true, subDepartmentId: true, kind: true, departmentId: true },
        orderBy: { name: "asc" },
      })
    }
    if (isAdmin || isManager) {
      const allowedDeptIds = [...new Set([...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])])]
      if (allowedDeptIds.length > 0) {
        return prisma.project.findMany({
          where: { OR: [{ departmentId: { in: allowedDeptIds } }, { subDepartment: { departmentId: { in: allowedDeptIds } } }] },
          select: { id: true, name: true, color: true, slug: true, subDepartmentId: true, kind: true, departmentId: true },
          orderBy: { name: "asc" },
        })
      }
      if (isAdmin) {
        return prisma.project.findMany({
          select: { id: true, name: true, color: true, slug: true, subDepartmentId: true, kind: true, departmentId: true },
          orderBy: { name: "asc" },
        })
      }
      return []
    }
    if (profile.role === "sub_manager" && profile.subDepartmentId) {
      return prisma.project.findMany({
        where: { subDepartmentId: profile.subDepartmentId },
        select: { id: true, name: true, color: true, slug: true, subDepartmentId: true, kind: true, departmentId: true },
        orderBy: { name: "asc" },
      })
    }
    const memberships = await prisma.projectMember.findMany({
      where: { userId: profile.id },
      select: {
        project: { select: { id: true, name: true, color: true, slug: true, subDepartmentId: true, kind: true, departmentId: true } },
      },
    })
    return memberships.map((m) => m.project)
  })()

  const projects = dedupeSupportProjects(dedupeMiscProjects(rawProjects)).map(
    ({ slug: _slug, subDepartmentId, departmentId: _departmentId, ...p }) => ({ ...p, subDepartmentId }),
  )

  return NextResponse.json(projects)
}
