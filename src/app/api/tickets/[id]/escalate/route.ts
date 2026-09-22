import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ticketsInScope } from "@/lib/dept-scope"
import { canEditTicket } from "@/lib/ticket-date-permissions"
import { buildTicketEditContext } from "@/lib/cross-access"
import { escalateTicket, ESCALATED_LABEL } from "@/lib/ticket-escalation"

export { ESCALATED_LABEL }

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      labels: true,
      subDepartmentId: true,
      deletedAt: true,
      closedAt: true,
      assigneeId: true,
      creatorId: true,
      assignees: { select: { userId: true } },
      subDepartment: { select: { departmentId: true } },
    },
  })
  if (!ticket || ticket.deletedAt) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  const editCtx = await buildTicketEditContext(profile, ticket)
  if (!canEditTicket(profile, editCtx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!(await ticketsInScope(profile, [id]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const result = await escalateTicket(id, {
    actorId: profile.id,
    timerActor: { id: profile.id, name: profile.name, avatarUrl: profile.avatarUrl },
  })
  if (result.status === "not_found") {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  return NextResponse.json({ id: result.id, status: result.ticketStatus, labels: result.labels })
}
