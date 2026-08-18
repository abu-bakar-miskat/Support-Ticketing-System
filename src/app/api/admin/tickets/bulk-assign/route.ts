import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { ensureProjectMembers } from "@/lib/ensure-project-members"

export async function POST(req: NextRequest) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const body = await req.json()
  const { ticketIds, assigneeId } = body as { ticketIds: string[]; assigneeId: string }

  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    return NextResponse.json({ error: "ticketIds must be a non-empty array" }, { status: 400 })
  }
  if (!assigneeId) {
    return NextResponse.json({ error: "assigneeId is required" }, { status: 400 })
  }

  // Verify assignee exists
  const assignee = await prisma.profile.findUnique({
    where: { id: assigneeId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!assignee) return NextResponse.json({ error: "Assignee not found" }, { status: 404 })

  // Managers can only reassign tickets within their department scope
  if (caller!.role === "manager") {
    const deptScope = await getProfileDeptScope(caller!)
    const subDepartmentIds = deptScope?.subDepartmentIds ?? []
    if (subDepartmentIds.length > 0) {
      const outOfScope = await prisma.ticket.findFirst({
        where: { id: { in: ticketIds }, subDepartmentId: { notIn: subDepartmentIds } },
        select: { id: true },
      })
      if (outOfScope) {
        return NextResponse.json({ error: "One or more tickets are outside your department scope" }, { status: 403 })
      }
    }
  }

  const result = await prisma.ticket.updateMany({
    where: { id: { in: ticketIds }, deletedAt: null },
    data: { assigneeId },
  })

  const projects = await prisma.ticket.findMany({
    where: { id: { in: ticketIds }, deletedAt: null, projectId: { not: null } },
    select: { projectId: true },
    distinct: ["projectId"],
  })
  await Promise.all(
    projects.map((t) => ensureProjectMembers(t.projectId, [assigneeId])),
  )

  return NextResponse.json({ updated: result.count })
}
