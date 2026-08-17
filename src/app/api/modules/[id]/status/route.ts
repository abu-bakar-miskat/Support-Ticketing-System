import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { moduleInScope } from "@/lib/dept-scope"
import { canManageModules } from "@/lib/module-permissions"

type Params = { params: Promise<{ id: string }> }

const VALID_STATUSES = ["planned", "in_progress", "completed"] as const
type ModuleStatus = (typeof VALID_STATUSES)[number]

/** Manual lifecycle status — any transition in any direction is allowed. */
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
  const status = body.status as ModuleStatus | undefined
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 422 },
    )
  }

  const updated = await prisma.projectModule.update({
    where: { id },
    data: { status },
  })

  return NextResponse.json(updated)
}
