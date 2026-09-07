import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

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
  const members = await prisma.departmentMember.findMany({
    where: { departmentId: id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
    orderBy: { addedAt: "asc" },
  })
  return NextResponse.json(members)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error
  void params
  void req
  // Membership is sub-department-scoped only. Department-wide access is for
  // managers (DepartmentManager); agents/sub-managers join via sub-departments.
  return NextResponse.json(
    { error: "Department members are not supported. Add people to a sub-department instead." },
    { status: 410 },
  )
}
