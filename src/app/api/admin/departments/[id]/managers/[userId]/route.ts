import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/audit-log"

type Params = { params: Promise<{ id: string; userId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id, userId } = await params

  if (profile!.role !== "admin" && !profile!.isSuperAdmin) {
    if (!(profile!.managedDepartmentIds ?? []).includes(id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // role-hierarchy.md: a plain department Manager may not remove an Admin — that
  // requires tenant-admin or department-Admin authority.
  const target = await prisma.departmentManager.findUnique({
    where: { departmentId_userId: { departmentId: id, userId } },
    select: { role: true },
  })
  const callerIsDeptAdmin =
    profile!.role === "admin" || profile!.isSuperAdmin || (profile!.departmentAdminIds ?? []).includes(id)
  if (target?.role === "admin" && !callerIsDeptAdmin) {
    return NextResponse.json({ error: "Only an admin of this department can remove an admin." }, { status: 403 })
  }

  const dept = await prisma.department.findUnique({ where: { id }, select: { name: true, tenantId: true } })

  await prisma.departmentManager.deleteMany({ where: { departmentId: id, userId } })

  // NFR-09/DAT-05 (slice 20): permission revocations (department manager) are audited.
  // Target the Profile so the audit UI shows the affected user's name, and
  // snapshot the department name so the entry reads meaningfully.
  if (dept) {
    await recordAuditEvent({
      tenantId: dept.tenantId,
      departmentId: id,
      actorId: profile!.id,
      action: "DEPARTMENT_MANAGER_REVOKED",
      targetType: "Profile",
      targetId: userId,
      before: { department: dept.name, role: target?.role ?? "manager" },
      after: null,
    })
  }

  // Rebuild the canonical RoleAssignment rows (and invalidate the cached scope)
  // so this department-manager revocation takes effect on reads immediately
  // (see lib/role-assignment).
  const { syncUserRoleAssignments } = await import("@/lib/role-assignment")
  await syncUserRoleAssignments(userId)

  return new NextResponse(null, { status: 204 })
}
