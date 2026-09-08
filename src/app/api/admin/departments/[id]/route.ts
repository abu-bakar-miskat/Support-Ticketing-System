import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth, assertDepartmentAdmin } from "@/lib/auth"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const scopeError = assertDepartmentAdmin(profile!, id)
  if (scopeError) return scopeError
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
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const scopeError = assertDepartmentAdmin(profile!, id)
  if (scopeError) return scopeError

  const subDepartmentCount = await prisma.subDepartment.count({ where: { departmentId: id } })
  if (subDepartmentCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete this department while it still has ${subDepartmentCount} sub-department${subDepartmentCount === 1 ? "" : "s"}. Delete or move ${subDepartmentCount === 1 ? "it" : "them"} first.` },
      { status: 409 }
    )
  }

  try {
    await prisma.department.delete({ where: { id } })
  } catch (err) {
    // A FK constraint (e.g. tickets, projects, or members still attached) surfaces
    // as P2003 — translate it into a reason instead of a bare 500.
    if (err && typeof err === "object" && (err as { code?: string }).code === "P2003") {
      return NextResponse.json(
        { error: "Cannot delete this department because other records (tickets, projects, or members) are still linked to it. Remove them first." },
        { status: 409 }
      )
    }
    throw err
  }
  return new NextResponse(null, { status: 204 })
}
