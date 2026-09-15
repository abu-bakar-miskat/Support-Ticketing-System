import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { prisma } from "@/lib/db"
import type { AuthProfile } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/audit-log"

async function assertDeptScope(deptId: string, caller: AuthProfile): Promise<NextResponse | null> {
  if (caller.role === "admin") return null
  const directlyManages: string[] = (caller as any).managedDepartmentIds ?? []
  if (!directlyManages.includes(deptId))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return null
}

// DELETE — remove a user from all subDepartments in a specific department only.
// Other department memberships, cross-access grants, and manager roles are untouched.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: deptId } = await params
  const scopeError = await assertDeptScope(deptId, caller!)
  if (scopeError) return scopeError

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })

  // Find the department (for the audit tenant scope) and its subDepartments.
  const department = await prisma.department.findUnique({
    where: { id: deptId },
    select: { tenantId: true },
  })
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  const subDepartments = await prisma.subDepartment.findMany({
    where: { departmentId: deptId },
    select: { id: true },
  })
  const subDepartmentIds = subDepartments.map((t) => t.id)

  // Use an interactive transaction so we can find the remaining subDepartment after deletion
  await prisma.$transaction(async (tx) => {
    const removedMemberships = await tx.subDepartmentMembership.findMany({
      where: { userId, subDepartmentId: { in: subDepartmentIds } },
      select: { subDepartmentId: true, role: true },
    })

    // 1. Remove only memberships for this department's subDepartments
    await tx.subDepartmentMembership.deleteMany({ where: { userId, subDepartmentId: { in: subDepartmentIds } } })

    // A direct membership can exist without a subDepartment (notably for managers).
    // Remove only this department's direct relationship; other departments remain intact.
    await tx.departmentMember.deleteMany({ where: { userId, departmentId: deptId } })

    // 2. If profile.teamId was in this dept, point it to the next remaining active subDepartment
    //    (from any other department) rather than nulling it out entirely.
    const remaining = await tx.subDepartmentMembership.findFirst({
      where: { userId, isActive: true },
      orderBy: { joinedAt: "asc" },
      select: { subDepartmentId: true },
    })

    await tx.profile.updateMany({
      where: { id: userId, subDepartmentId: { in: subDepartmentIds } },
      data: { subDepartmentId: remaining?.subDepartmentId ?? null },
    })

    await recordAuditEvent({
      tenantId: department.tenantId,
      departmentId: deptId,
      actorId: caller!.id,
      action: "DEPARTMENT_MEMBER_REMOVED",
      targetType: "Profile",
      targetId: userId,
      before: { subDepartments: removedMemberships },
      after: null,
      client: tx,
    })
  })

  // Rebuild the canonical RoleAssignment rows (and invalidate the cached scope)
  // so removing these sub-department memberships takes effect on reads immediately
  // (see lib/role-assignment).
  const { syncUserRoleAssignments } = await import("@/lib/role-assignment")
  await syncUserRoleAssignments(userId)

  return new NextResponse(null, { status: 204 })
}
