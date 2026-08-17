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

// GET — users not already in this department (for the "add member" picker)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: deptId } = await params
  const scopeError = await assertDeptScope(deptId, caller!)
  if (scopeError) return scopeError

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim().toLowerCase() ?? ""

  // Find team IDs in this department
  const teams = await prisma.team.findMany({
    where: { departmentId: deptId },
    select: { id: true },
  })
  const teamIds = teams.map((t) => t.id)

  // Users already in this department (via team membership)
  const existingMemberIds = teamIds.length > 0
    ? (await prisma.teamMembership.findMany({
        where: { teamId: { in: teamIds }, isActive: true },
        select: { userId: true },
      })).map((m) => m.userId)
    : []

  const candidates = await prisma.profile.findMany({
    where: {
      deletedAt: null,
      id: { notIn: existingMemberIds },
      ...(q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      } : {}),
    },
    select: { id: true, name: true, email: true, avatarUrl: true, role: true },
    orderBy: { name: "asc" },
    take: 30,
  })

  return NextResponse.json(candidates)
}
