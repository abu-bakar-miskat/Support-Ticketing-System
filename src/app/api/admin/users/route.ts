import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdmin, requireAuth } from "../_guard"
import { getProfileDeptScope } from "@/lib/dept-scope"

export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const isAdmin = profile.role === "admin"
  const isManager = profile.role === "manager"
  const deptScope = await getProfileDeptScope(profile)

  let userIdFilter: string[] | undefined

  if (isManager) {
    const teamIds = deptScope?.teamIds ?? []

    if (teamIds.length > 0) {
      const memberships = await prisma.teamMembership.findMany({
        where: { teamId: { in: teamIds }, isActive: true },
        select: { userId: true },
      })
      userIdFilter = memberships.map((m) => m.userId)
    } else {
      return NextResponse.json([])
    }
  }

  const users = await prisma.profile.findMany({
    where: isAdmin
      ? { tenantMemberships: { some: { tenantId: profile.activeTenantId ?? "__no_tenant__", isActive: true } } }
      : userIdFilter === undefined
        ? undefined
        : { id: { in: userIdFilter } },
    orderBy: { name: "asc" },
    include: { team: { select: { id: true, name: true } } },
  })
  return NextResponse.json(users)
}
