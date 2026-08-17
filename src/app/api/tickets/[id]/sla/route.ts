import { NextRequest, NextResponse } from "next/server"
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getSlaIndicatorForTicket } from "@/lib/sla-engine"

// GET /api/tickets/[id]/sla — the ticket's SLA indicator (SLA-06): status +
// remaining/overdue time for first-response and resolution. Returns
// { indicator: null } when no SLA policy applied to this ticket.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: ticketId } = await params

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      tenantId: true,
      teamId: true,
      assigneeId: true,
      creatorId: true,
      deletedAt: true,
      assignees: { select: { userId: true } },
      team: { select: { departmentId: true } },
    },
  })
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })

  const accessError = await assertTicketAccess(profile, ticket, { forWrite: false })
  if (accessError) return accessError

  const indicator = await getSlaIndicatorForTicket(ticketId)
  return NextResponse.json({ indicator })
}
