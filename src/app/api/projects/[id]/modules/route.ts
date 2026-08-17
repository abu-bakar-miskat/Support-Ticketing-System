import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { projectInScope } from "@/lib/dept-scope"
import { canManageModules } from "@/lib/module-permissions"

type Params = { params: Promise<{ id: string }> }

/** Picker list — module names are public to anyone who can see the project. */
export async function GET(_req: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await projectInScope(profile, id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      moduleSystemEnabled: true,
      modules: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          order: true,
        },
      },
    },
  })
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  return NextResponse.json({
    moduleSystemEnabled: project.moduleSystemEnabled,
    modules: project.modules,
  })
}

export async function POST(request: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error

  if (!canManageModules(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  if (!(await projectInScope(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { moduleSystemEnabled: true },
  })
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const body = await request.json()
  const name = (body.name as string | undefined)?.trim()
  const description = (body.description as string | undefined)?.trim() || null

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }

  const created = await prisma.$transaction(async (tx) => {
    // Creating a module turns the project's module system on automatically.
    if (!project.moduleSystemEnabled) {
      await tx.project.update({
        where: { id },
        data: { moduleSystemEnabled: true },
      })
    }

    const maxOrder = await tx.projectModule.aggregate({
      where: { projectId: id },
      _max: { order: true },
    })

    return tx.projectModule.create({
      data: {
        name,
        description,
        projectId: id,
        createdById: profile.id,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    })
  })

  return NextResponse.json(created, { status: 201 })
}
