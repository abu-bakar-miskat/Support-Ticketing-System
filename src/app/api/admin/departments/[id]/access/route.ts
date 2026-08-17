import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { createNotification } from "@/lib/notify"

type Params = { params: Promise<{ id: string }> }

async function canManageDept(profile: { role: string; managedDepartmentIds?: string[] }, deptId: string): Promise<boolean> {
  if (profile.role === "admin") return true
  if (profile.role === "manager") {
    return (profile.managedDepartmentIds ?? []).includes(deptId)
  }
  return false
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!(await canManageDept(profile!, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const grants = await prisma.departmentAccess.findMany({
    where: { departmentId: id },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      grantor: { select: { id: true, name: true } },
    },
    orderBy: { grantedAt: "desc" },
  })
  return NextResponse.json(grants)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!(await canManageDept(profile!, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { userId, expiresAt, reason, fullAccess, projectIds } = body as {
    userId?: string
    expiresAt?: string
    reason?: string
    fullAccess?: boolean
    projectIds?: string[]
  }
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  const dept = await prisma.department.findUnique({ where: { id } })
  if (!dept) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Check if this is a new grant (not an update) to avoid duplicate notifications
  const existing = await prisma.departmentAccess.findUnique({
    where: { departmentId_userId: { departmentId: id, userId } },
    select: { userId: true },
  })
  const isNew = !existing
  const isFullAccess = fullAccess === true

  const grant = await prisma.departmentAccess.upsert({
    where: { departmentId_userId: { departmentId: id, userId } },
    create: {
      departmentId: id,
      userId,
      grantedBy: profile!.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      reason: reason?.trim() || null,
      fullAccess: isFullAccess,
    },
    update: {
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      reason: reason?.trim() || null,
      grantedAt: new Date(),
      grantedBy: profile!.id,
      fullAccess: isFullAccess,
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      grantor: { select: { id: true, name: true } },
    },
  })

  // Specific-projects mode: assign the grantee to the chosen projects so the
  // restricted (non-fullAccess) scope in dept-scope.ts picks them up. Additive only.
  if (!isFullAccess && Array.isArray(projectIds) && projectIds.length > 0) {
    const validProjects = await prisma.project.findMany({
      where: {
        id: { in: projectIds },
        OR: [{ departmentId: id }, { team: { departmentId: id } }],
      },
      select: { id: true },
    })
    if (validProjects.length > 0) {
      await prisma.projectMember.createMany({
        data: validProjects.map((p) => ({ projectId: p.id, userId })),
        skipDuplicates: true,
      })
    }
  }

  if (isNew) {
    createNotification({
      recipientId: userId,
      actorId: profile!.id,
      type: "access_granted",
      message: `You now have access to the ${dept.name} department`,
    }).catch(() => undefined)
  }

  return NextResponse.json(grant, { status: 201 })
}
