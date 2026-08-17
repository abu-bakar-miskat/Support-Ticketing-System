import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { moduleInScope } from "@/lib/dept-scope"
import { canManageModules } from "@/lib/module-permissions"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error

  if (!canManageModules(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  if (!(await moduleInScope(profile, id))) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 })
  }

  const body = await request.json()
  const name = (body.name as string | undefined)?.trim()
  const description =
    "description" in body
      ? ((body.description as string | undefined)?.trim() || null)
      : undefined
  const order =
    "order" in body && body.order != null ? Math.round(Number(body.order)) : undefined

  if (name !== undefined && !name) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 })
  }
  if (order !== undefined && !Number.isFinite(order)) {
    return NextResponse.json({ error: "order must be a number" }, { status: 400 })
  }

  const updated = await prisma.projectModule.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(order !== undefined && { order }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error

  if (!canManageModules(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  if (!(await moduleInScope(profile, id))) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 })
  }

  // Detach tickets back to Module 0 before deleting
  await prisma.$transaction([
    prisma.ticket.updateMany({ where: { moduleId: id }, data: { moduleId: null } }),
    prisma.projectModule.delete({ where: { id } }),
  ])

  return new NextResponse(null, { status: 204 })
}
