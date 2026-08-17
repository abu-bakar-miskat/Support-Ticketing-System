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
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!(await canManageDept(profile!, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { userId } = body as { userId?: string }
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  const dept = await prisma.department.findUnique({ where: { id } })
  if (!dept) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const member = await prisma.departmentMember.upsert({
    where: { departmentId_userId: { departmentId: id, userId } },
    create: { departmentId: id, userId, addedBy: profile!.id },
    update: {},
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } } },
  })

  return NextResponse.json(member, { status: 201 })
}
