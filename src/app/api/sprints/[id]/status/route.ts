import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { sprintInScope } from "@/lib/dept-scope"

type Params = { params: Promise<{ id: string }> }

const VALID_TRANSITIONS: Record<string, string> = {
  planned: "active",
  active: "completed",
}

export async function PATCH(request: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await sprintInScope(profile, id))) {
    return NextResponse.json({ error: "Sprint not found" }, { status: 404 })
  }

  const body = await request.json()
  const newStatus = (body.status as string)?.trim()

  if (!newStatus) {
    return NextResponse.json({ error: "status is required" }, { status: 400 })
  }

  const sprint = await prisma.sprint.findUnique({ where: { id } })
  if (!sprint) {
    return NextResponse.json({ error: "Sprint not found" }, { status: 404 })
  }

  const expectedNext = VALID_TRANSITIONS[sprint.status]
  if (expectedNext !== newStatus) {
    return NextResponse.json(
      {
        error: `Invalid transition: ${sprint.status} → ${newStatus}. Expected next status: ${expectedNext ?? "none (already completed)"}`,
      },
      { status: 422 },
    )
  }

  const updated = await prisma.sprint.update({
    where: { id },
    data: { status: newStatus as any },
  })

  return NextResponse.json(updated)
}
