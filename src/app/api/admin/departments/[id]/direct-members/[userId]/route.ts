import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

type Params = { params: Promise<{ id: string; userId: string }> }

async function canManageDept(profile: { role: string; managedDepartmentIds?: string[] }, deptId: string): Promise<boolean> {
  if (profile.role === "admin") return true
  if (profile.role === "manager") {
    return (profile.managedDepartmentIds ?? []).includes(deptId)
  }
  return false
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id, userId } = await params
  if (!(await canManageDept(profile!, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await prisma.departmentMember.deleteMany({
    where: { departmentId: id, userId },
  })

  return new NextResponse(null, { status: 204 })
}
