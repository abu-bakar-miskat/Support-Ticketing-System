import { NextRequest, NextResponse } from "next/server"
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { runAsSystem } from "@/lib/request-scope"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: ticketId } = await params
  const ticket = await runAsSystem(() => prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      tenantId: true,
      subDepartmentId: true,
      assigneeId: true,
      creatorId: true,
      deletedAt: true,
      assignees: { select: { userId: true } },
      subDepartment: { select: { departmentId: true } },
    },
  }))
  if (!ticket || ticket.deletedAt) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  const accessError = await assertTicketAccess(profile, ticket, { forWrite: false })
  if (accessError) return accessError

  const logs = await runAsSystem(() => prisma.ruleExecutionLog.findMany({
    where: { ticketId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      ruleName: true,
      matched: true,
      actionsApplied: true,
      stopProcessing: true,
      createdAt: true,
    },
  }))

  return NextResponse.json({
    logs: logs.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
    })),
  })
}
