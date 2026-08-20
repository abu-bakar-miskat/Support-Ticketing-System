import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/audit-log"

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
  const managers = await prisma.departmentManager.findMany({
    where: { departmentId: id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
    orderBy: { assignedAt: "asc" },
  })
  return NextResponse.json(managers)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!(await canManageDept(profile!, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { userId } = body as { userId?: string }
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  const dept = await prisma.department.findUnique({ where: { id } })
  if (!dept) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [manager] = await Promise.all([
    prisma.departmentManager.upsert({
      where: { departmentId_userId: { departmentId: id, userId } },
      create: { departmentId: id, userId, assignedBy: profile!.id },
      update: {},
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
    }),
    // Also add manager as a direct department member
    prisma.departmentMember.upsert({
      where: { departmentId_userId: { departmentId: id, userId } },
      create: { departmentId: id, userId, addedBy: profile!.id },
      update: {},
    }),
  ])

  // Promote the user's role to manager if they're staff/lead
  const user = await prisma.profile.findUnique({ where: { id: userId }, select: { role: true } })
  if (user && (user.role === "agent" || user.role === "sub_manager")) {
    await prisma.profile.update({ where: { id: userId }, data: { role: "manager" } })
  }

  // NFR-09/DAT-05 (slice 20): permission grants (department manager) are audited.
  await recordAuditEvent({
    tenantId: dept.tenantId,
    actorId: profile!.id,
    action: "DEPARTMENT_MANAGER_GRANTED",
    targetType: "DepartmentManager",
    targetId: `${id}:${userId}`,
    before: null,
    after: { departmentId: id, userId },
  })

  return NextResponse.json(manager, { status: 201 })
}
