import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import type { AuthProfile } from "@/lib/auth"

async function assertSubDepartmentScope(subDepartmentId: string, caller: AuthProfile): Promise<NextResponse | null> {
  if (caller.role === "admin") return null
  const subDepartment = await prisma.subDepartment.findUnique({ where: { id: subDepartmentId }, select: { departmentId: true } })
  if (!subDepartment) return NextResponse.json({ error: "Team not found" }, { status: 404 })
  // Write operations restricted to directly-managed departments — cross-access grants do not apply
  const directlyManages: string[] = (caller as any).managedDepartmentIds ?? []
  if (!directlyManages.includes(subDepartment.departmentId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return null
}

// POST — assign a profile to a team (admin or manager scoped to their depts)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: subDepartmentId } = await params
  const scopeError = await assertSubDepartmentScope(subDepartmentId, caller!)
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

  const [subDepartment, profile] = await Promise.all([
    prisma.subDepartment.findUnique({ where: { id: subDepartmentId } }),
    prisma.profile.findUnique({ where: { id: userId } }),
  ])

  if (!subDepartment) return NextResponse.json({ error: "Team not found" }, { status: 404 })
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const trimmedName = nickname?.trim() || null

  await prisma.$transaction([
    (prisma.subDepartmentMembership as any).upsert({
      where: { userId_subDepartmentId: { userId, subDepartmentId } },
      create: { userId, subDepartmentId, role: (role as any) ?? "staff", nickname: trimmedName, isActive: isActive ?? true },
      update: { nickname: trimmedName, isActive: isActive ?? true, ...(role ? { role: role as any } : {}) },
    }),
    prisma.profile.updateMany({ where: { id: userId, subDepartmentId: null }, data: { subDepartmentId } }),
  ])

  const membership = await (prisma.subDepartmentMembership as any).findUnique({
    where: { userId_subDepartmentId: { userId, subDepartmentId } },
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

  const { id: subDepartmentId } = await params
  const scopeError = await assertSubDepartmentScope(subDepartmentId, caller!)
  if (scopeError) return scopeError

  const members = await prisma.subDepartmentMembership.findMany({
    where: { subDepartmentId },
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

  const { id: subDepartmentId } = await params
  const scopeError = await assertSubDepartmentScope(subDepartmentId, caller!)
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

  const updated = await (prisma.subDepartmentMembership as any).update({
    where: { userId_subDepartmentId: { userId, subDepartmentId } },
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

  const { id: subDepartmentId } = await params
  const scopeError = await assertSubDepartmentScope(subDepartmentId, caller!)
  if (scopeError) return scopeError

  const { userId } = await req.json()

  await prisma.subDepartmentMembership.deleteMany({
    where: { userId, subDepartmentId },
  })

  return new NextResponse(null, { status: 204 })
}
