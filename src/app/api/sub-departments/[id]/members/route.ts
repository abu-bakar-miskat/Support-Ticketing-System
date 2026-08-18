import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { teamInScope, canReadTeamData } from "@/lib/dept-scope"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: teamId } = await params

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      department: { select: { name: true } },
    },
  })

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 })
  }

  if (!(await canReadTeamData(profile, teamId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const members = await prisma.teamMembership.findMany({
    where: { teamId, isActive: true },
    orderBy: { joinedAt: "asc" },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  })

  return NextResponse.json(
    members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl ?? null,
      departmentName: team.department?.name ?? null,
      teamName: team.name,
    })),
  )
}
