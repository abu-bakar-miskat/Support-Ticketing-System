import { NextRequest, NextResponse } from "next/server"
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getSlaIndicatorViewForTicket } from "@/lib/sla-engine"
import { runAsSystem } from "@/lib/request-scope"

// GET /api/tickets/[id]/sla — the ticket's SLA indicator (SLA-06): status +
// remaining/overdue time for first-response and resolution. Returns
// { indicator: null } when no SLA policy applied to this ticket. Admins and the
// department's managers also receive `indicator.details`.
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
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })

  const accessError = await assertTicketAccess(profile, ticket, { forWrite: false })
  if (accessError) return accessError

  // Full breakdown (clock instants, breach history) is for tenant admins and the
  // ticket department's admins/managers; everyone else gets the badge summary.
  const departmentId = ticket.subDepartment.departmentId
  const includeDetails =
    profile.isSuperAdmin ||
    profile.role === "admin" ||
    (profile.managedDepartmentIds ?? []).includes(departmentId) ||
    (profile.departmentAdminIds ?? []).includes(departmentId)

  const indicator = await runAsSystem(() =>
    getSlaIndicatorViewForTicket(ticketId, new Date(), { includeDetails }),
  )
  return NextResponse.json({ indicator })
}
