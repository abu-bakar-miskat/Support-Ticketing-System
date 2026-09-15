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
  const { userId, role: rawRole } = body as { userId?: string; role?: string }
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  // role-hierarchy.md: a plain department Manager may add Managers/Agents but not
  // manage Admins. Managing an Admin — granting it, or overwriting/downgrading an
  // existing Admin row — requires tenant-admin or department-Admin authority.
  const role = rawRole === "admin" ? "admin" : "manager"
  const callerIsDeptAdmin =
    profile!.role === "admin" || (profile!.departmentAdminIds ?? []).includes(id)
  const existing = await prisma.departmentManager.findUnique({
    where: { departmentId_userId: { departmentId: id, userId } },
    select: { role: true },
  })
  if ((role === "admin" || existing?.role === "admin") && !callerIsDeptAdmin) {
    return NextResponse.json({ error: "Only an admin of this department can manage admins." }, { status: 403 })
  }

  const dept = await prisma.department.findUnique({ where: { id } })
  if (!dept) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [manager] = await Promise.all([
    prisma.departmentManager.upsert({
      where: { departmentId_userId: { departmentId: id, userId } },
      create: { departmentId: id, userId, role, assignedBy: profile!.id },
      update: { role },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
    }),
  ])

  // Promote the user's role to manager if they're staff/lead
  const user = await prisma.profile.findUnique({ where: { id: userId }, select: { role: true } })
  if (user && (user.role === "agent" || user.role === "sub_manager")) {
    await prisma.profile.update({ where: { id: userId }, data: { role: "manager" } })
  }

  // NFR-09/DAT-05 (slice 20): permission grants (department manager) are audited.
  // Target the Profile (so the audit UI resolves & shows the affected user's
  // name), and snapshot the department name so the entry reads meaningfully.
  await recordAuditEvent({
    tenantId: dept.tenantId,
    departmentId: id,
    actorId: profile!.id,
    action: "DEPARTMENT_MANAGER_GRANTED",
    targetType: "Profile",
    targetId: userId,
    before: null,
    after: { department: dept.name, role },
  })

  // Rebuild the canonical RoleAssignment rows (and invalidate the cached scope)
  // so this department-manager grant takes effect on reads immediately
  // (see lib/role-assignment).
  const { syncUserRoleAssignments } = await import("@/lib/role-assignment")
  await syncUserRoleAssignments(userId)

  return NextResponse.json(manager, { status: 201 })
}
