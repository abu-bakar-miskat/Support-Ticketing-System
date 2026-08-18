import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/audit-log"

type Params = { params: Promise<{ id: string; userId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id, userId } = await params

  if (profile!.role !== "admin") {
    if (!(profile!.managedDepartmentIds ?? []).includes(id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const dept = await prisma.department.findUnique({ where: { id }, select: { tenantId: true } })

  await prisma.departmentManager.deleteMany({ where: { departmentId: id, userId } })

  // NFR-09/DAT-05 (slice 20): permission revocations (department manager) are audited.
  if (dept) {
    await recordAuditEvent({
      tenantId: dept.tenantId,
      actorId: profile!.id,
      action: "DEPARTMENT_MANAGER_REVOKED",
      targetType: "DepartmentManager",
      targetId: `${id}:${userId}`,
      before: { departmentId: id, userId },
      after: null,
    })
  }

  return new NextResponse(null, { status: 204 })
}
