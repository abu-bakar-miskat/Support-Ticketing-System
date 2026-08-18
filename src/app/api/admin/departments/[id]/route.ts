import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdmin } from "../../_guard"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const name = (body.name as string)?.trim()

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const data: { name: string; isHub?: boolean } = { name }
  if (typeof body.isHub === "boolean") data.isHub = body.isHub

  const department = await prisma.department.update({
    where: { id },
    data,
  })
  return NextResponse.json(department)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params

  const subDepartmentCount = await prisma.subDepartment.count({ where: { departmentId: id } })
  if (subDepartmentCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: this department has ${subDepartmentCount} team${subDepartmentCount === 1 ? "" : "s"}` },
      { status: 409 }
    )
  }

  await prisma.department.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
