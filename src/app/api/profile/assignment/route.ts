import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/audit-log"

// PATCH — let the current user opt themselves in/out of auto-assignment for one
// of their own sub-department memberships (self-service doNotAssign).
export async function PATCH(req: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const userId = profile!.id

  const body = await req.json()
  const { subDepartmentId, doNotAssign } = body as {
    subDepartmentId?: string
    doNotAssign?: boolean
  }
  if (!subDepartmentId || typeof doNotAssign !== "boolean") {
    return NextResponse.json({ error: "subDepartmentId and doNotAssign are required" }, { status: 400 })
  }

  const membership = await prisma.subDepartmentMembership.findUnique({
    where: { userId_subDepartmentId: { userId, subDepartmentId } },
    select: {
      doNotAssign: true,
      subDepartment: { select: { name: true, tenantId: true, departmentId: true } },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: "You are not a member of this sub department" }, { status: 404 })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.subDepartmentMembership.update({
      where: { userId_subDepartmentId: { userId, subDepartmentId } },
      data: { doNotAssign },
      select: { subDepartmentId: true, doNotAssign: true },
    })
    await recordAuditEvent({
      tenantId: membership.subDepartment.tenantId,
      departmentId: membership.subDepartment.departmentId,
      actorId: userId,
      action: "SUB_DEPARTMENT_MEMBER_UPDATED",
      targetType: "Profile",
      targetId: userId,
      before: { subDepartment: membership.subDepartment.name, doNotAssign: membership.doNotAssign },
      after: { subDepartment: membership.subDepartment.name, doNotAssign: saved.doNotAssign },
      client: tx,
    })
    return saved
  })

  return NextResponse.json(updated)
}
