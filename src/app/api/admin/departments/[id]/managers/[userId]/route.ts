import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

type Params = { params: Promise<{ id: string; userId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id, userId } = await params

  if (profile!.role !== "admin") {
    if (!(profile!.managedDepartmentIds ?? []).includes(id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.departmentManager.deleteMany({ where: { departmentId: id, userId } })
  return new NextResponse(null, { status: 204 })
}
