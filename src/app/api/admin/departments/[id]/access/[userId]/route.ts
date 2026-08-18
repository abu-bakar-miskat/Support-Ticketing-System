import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

type Params = { params: Promise<{ id: string; userId: string }> }

async function canManageDept(profile: { role: string; managedDepartmentIds?: string[] }, deptId: string): Promise<boolean> {
  if (profile.role === "admin") return true
  if (profile.role === "manager") return (profile.managedDepartmentIds ?? []).includes(deptId)
  return false
}

// GET — current grant fields plus which of the department's projects this user is assigned to,
// for prefilling the quick-edit panel.
export async function GET(_req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id, userId } = await params
  if (!(await canManageDept(profile!, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const grant = await prisma.departmentAccess.findUnique({
    where: { departmentId_userId: { departmentId: id, userId } },
  })
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const assigned = await prisma.projectMember.findMany({
    where: {
      userId,
      project: { OR: [{ departmentId: id }, { subDepartment: { departmentId: id } }] },
    },
    select: { projectId: true },
  })

  return NextResponse.json({
    fullAccess: grant.fullAccess,
    expiresAt: grant.expiresAt ? grant.expiresAt.toISOString() : null,
    reason: grant.reason,
    projectIds: assigned.map((a) => a.projectId),
  })
}

// PATCH — quick-edit an existing grant's duration/reason/access type, without revoke+regrant.
// When switching to (or staying in) specific-projects mode, reconciles ProjectMember rows to
// exactly match the given projectIds (unlike the additive-only initial grant).
export async function PATCH(req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id, userId } = await params
  if (!(await canManageDept(profile!, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { expiresAt, reason, fullAccess, projectIds } = body as {
    expiresAt?: string
    reason?: string
    fullAccess?: boolean
    projectIds?: string[]
  }
  const isFullAccess = fullAccess === true

  const existing = await prisma.departmentAccess.findUnique({
    where: { departmentId_userId: { departmentId: id, userId } },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const grant = await prisma.departmentAccess.update({
    where: { departmentId_userId: { departmentId: id, userId } },
    data: {
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      reason: reason?.trim() || null,
      fullAccess: isFullAccess,
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      grantor: { select: { id: true, name: true } },
    },
  })

  if (!isFullAccess && Array.isArray(projectIds)) {
    const validProjects = await prisma.project.findMany({
      where: {
        id: { in: projectIds },
        OR: [{ departmentId: id }, { subDepartment: { departmentId: id } }],
      },
      select: { id: true },
    })
    const validIds = new Set(validProjects.map((p) => p.id))

    const current = await prisma.projectMember.findMany({
      where: {
        userId,
        project: { OR: [{ departmentId: id }, { subDepartment: { departmentId: id } }] },
      },
      select: { projectId: true },
    })
    const currentIds = new Set(current.map((c) => c.projectId))

    const toAdd = [...validIds].filter((pid) => !currentIds.has(pid))
    const toRemove = [...currentIds].filter((pid) => !validIds.has(pid))

    await prisma.$transaction([
      ...(toAdd.length > 0
        ? [prisma.projectMember.createMany({
            data: toAdd.map((pid) => ({ projectId: pid, userId })),
            skipDuplicates: true,
          })]
        : []),
      ...(toRemove.length > 0
        ? [prisma.projectMember.deleteMany({
            where: { userId, projectId: { in: toRemove } },
          })]
        : []),
    ])
  }

  return NextResponse.json(grant)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id, userId } = await params

  if (profile!.role !== "admin") {
    if (!(profile!.managedDepartmentIds ?? []).includes(id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.departmentAccess.deleteMany({ where: { departmentId: id, userId } })
  return new NextResponse(null, { status: 204 })
}
