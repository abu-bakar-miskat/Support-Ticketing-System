import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { subDepartmentInScope, canReadSubDepartmentData } from "@/lib/dept-scope"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: subDepartmentId } = await params

  const subDepartment = await prisma.subDepartment.findUnique({
    where: { id: subDepartmentId },
    select: {
      id: true,
      name: true,
      department: { select: { name: true } },
    },
  })

  if (!subDepartment) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 })
  }

  if (!(await canReadSubDepartmentData(profile, subDepartmentId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const members = await prisma.subDepartmentMembership.findMany({
    where: { subDepartmentId, isActive: true },
    orderBy: { joinedAt: "asc" },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  })

  return NextResponse.json(
    members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl ?? null,
      departmentName: subDepartment.department?.name ?? null,
      subDepartmentName: subDepartment.name,
    })),
  )
}
