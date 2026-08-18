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

// GET — list projects in this department, for the grant-access "select specific projects" picker.
export async function GET(_req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!(await canManageDept(profile!, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const projects = await prisma.project.findMany({
    where: { OR: [{ departmentId: id }, { subDepartment: { departmentId: id } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return NextResponse.json(projects)
}
