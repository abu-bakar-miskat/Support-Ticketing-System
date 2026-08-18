import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import type { AuthProfile } from "@/lib/auth"

async function assertTeamScope(teamId: string, caller: AuthProfile): Promise<NextResponse | null> {
  if (caller.role === "admin") return null
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { departmentId: true } })
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 })
  // Write operations restricted to directly-managed departments — cross-access grants do not apply
  const directlyManages: string[] = (caller as any).managedDepartmentIds ?? []
  if (!directlyManages.includes(team.departmentId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return null
}

// POST — assign a profile to a team (admin or manager scoped to their depts)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: teamId } = await params
  const scopeError = await assertTeamScope(teamId, caller!)
  if (scopeError) return scopeError

  const body = await req.json()
  const { userId, nickname, isActive, role } = body as {
    userId: string
    nickname?: string
    isActive?: boolean
    role?: string
  }

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }

  const [team, profile] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId } }),
    prisma.profile.findUnique({ where: { id: userId } }),
  ])

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 })
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const trimmedName = nickname?.trim() || null

  await prisma.$transaction([
    (prisma.teamMembership as any).upsert({
      where: { userId_teamId: { userId, teamId } },
      create: { userId, teamId, role: (role as any) ?? "staff", nickname: trimmedName, isActive: isActive ?? true },
      update: { nickname: trimmedName, isActive: isActive ?? true, ...(role ? { role: role as any } : {}) },
    }),
    prisma.profile.updateMany({ where: { id: userId, teamId: null }, data: { teamId } }),
  ])

  const membership = await (prisma.teamMembership as any).findUnique({
    where: { userId_teamId: { userId, teamId } },
  })

  return NextResponse.json(membership, { status: 201 })
}

// GET — list current members of a team (admin or manager scoped to their depts)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: teamId } = await params
  const scopeError = await assertTeamScope(teamId, caller!)
  if (scopeError) return scopeError

  const members = await prisma.teamMembership.findMany({
    where: { teamId },
    orderBy: { joinedAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
    },
  })

  return NextResponse.json(members)
}

// PATCH — update membership flags (isActive, doNotAssign, role)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: teamId } = await params
  const scopeError = await assertTeamScope(teamId, caller!)
  if (scopeError) return scopeError

  const body = await req.json()
  const { userId, isActive, doNotAssign, role } = body as {
    userId: string
    isActive?: boolean
    doNotAssign?: boolean
    role?: string
  }

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (isActive !== undefined) data.isActive = isActive
  if (doNotAssign !== undefined) data.doNotAssign = doNotAssign
  if (role) data.role = role

  const updated = await (prisma.teamMembership as any).update({
    where: { userId_teamId: { userId, teamId } },
    data,
  })

  return NextResponse.json(updated)
}

// DELETE — remove a member from a team (admin or manager scoped to their depts)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: teamId } = await params
  const scopeError = await assertTeamScope(teamId, caller!)
  if (scopeError) return scopeError

  const { userId } = await req.json()

  await prisma.teamMembership.deleteMany({
    where: { userId, teamId },
  })

  return new NextResponse(null, { status: 204 })
}
