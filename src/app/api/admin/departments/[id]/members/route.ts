import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { prisma } from "@/lib/db"
import type { AuthProfile } from "@/lib/auth"

async function assertDeptScope(deptId: string, caller: AuthProfile): Promise<NextResponse | null> {
  if (caller.role === "admin") return null
  const directlyManages: string[] = (caller as any).managedDepartmentIds ?? []
  if (!directlyManages.includes(deptId))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return null
}

// DELETE — remove a user from all teams in a specific department only.
// Other department memberships, cross-access grants, and manager roles are untouched.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: deptId } = await params
  const scopeError = await assertDeptScope(deptId, caller!)
  if (scopeError) return scopeError

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })

  // Find all teams in this department
  const teams = await prisma.team.findMany({
    where: { departmentId: deptId },
    select: { id: true },
  })
  const teamIds = teams.map((t) => t.id)

  if (teamIds.length === 0) return new NextResponse(null, { status: 204 })

  // Use an interactive transaction so we can find the remaining team after deletion
  await prisma.$transaction(async (tx) => {
    // 1. Remove only memberships for this department's teams
    await tx.teamMembership.deleteMany({ where: { userId, teamId: { in: teamIds } } })

    // 2. If profile.teamId was in this dept, point it to the next remaining active team
    //    (from any other department) rather than nulling it out entirely.
    const remaining = await tx.teamMembership.findFirst({
      where: { userId, isActive: true },
      orderBy: { joinedAt: "asc" },
      select: { teamId: true },
    })

    await tx.profile.updateMany({
      where: { id: userId, teamId: { in: teamIds } },
      data: { teamId: remaining?.teamId ?? null },
    })
  })

  return new NextResponse(null, { status: 204 })
}
