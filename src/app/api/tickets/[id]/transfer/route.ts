import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { requireAuth, assertTicketEditAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { transferTicket } from "@/lib/ticket-transfer"
import { notifyTicketTransfer } from "@/lib/ticket-transfer-notify"

// ASG-06: move a ticket to another department/sub-department (SubDepartment). Any
// agent with edit access to the ticket may transfer it — not just
// admins/managers — mirroring the existing status-move endpoint's access rule.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { targetTeamId } = body as { targetTeamId?: string }

  if (!targetTeamId?.trim()) {
    return NextResponse.json({ error: "targetTeamId is required" }, { status: 400 })
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      subDepartmentId: true,
      assigneeId: true,
      creatorId: true,
      deletedAt: true,
      isDraft: true,
      projectId: true,
      tenantId: true,
      assignees: { select: { userId: true } },
      subDepartment: { select: { departmentId: true } },
    },
  })
  if (!ticket || ticket.deletedAt) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  const accessError = await assertTicketEditAccess(profile!, ticket)
  if (accessError) return accessError

  const result = await transferTicket({ ticketId: id, targetTeamId, actorId: profile!.id })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  // Notify the source dept manager(s), source sub-manager(s), and destination
  // sub-manager(s) — best-effort, off the response path.
  after(() =>
    notifyTicketTransfer({
      ticketId: id,
      ticketTitle: result.ticketTitle,
      humanId: `${result.toPrefix}-${result.newTicketNumber}`,
      actorId: profile!.id,
      actorName: result.actorName,
      fromDepartmentId: result.fromDepartmentId,
      fromSubDepartmentId: result.fromTeamId,
      fromSubDepartmentName: result.fromSubDepartmentName,
      toDepartmentId: result.toDepartmentId,
      toSubDepartmentId: result.toTeamId,
      toSubDepartmentName: result.toSubDepartmentName,
    }).catch(() => undefined),
  )

  return NextResponse.json(result)
}
