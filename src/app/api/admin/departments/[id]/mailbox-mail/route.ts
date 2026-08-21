import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdminOrManager } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"

type Params = { params: Promise<{ id: string }> }

// GET /api/admin/departments/[id]/mailbox-mail
// Every email the department's mailbox connection(s) received, aggregated across
// all of its sub-departments: inbound TicketMessages filed against the
// department's tickets, plus auto-generated mail that never became a ticket
// (MailSuppressionLog, keyed by mailboxConnectionId).
export async function GET(_req: NextRequest, { params }: Params) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: departmentId } = await params
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  })
  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 })
  }

  if (caller!.role === "manager") {
    const deptScope = await getProfileDeptScope(caller!)
    if (!deptScope?.allowedDeptIds.includes(departmentId)) {
      return NextResponse.json({ error: "Department is outside your scope" }, { status: 403 })
    }
  }

  const connections = await prisma.mailboxConnection.findMany({
    where: { departmentId },
    select: { id: true, address: true, status: true, subDepartmentId: true },
  })

  const [messages, suppressed] = await Promise.all([
    prisma.ticketMessage.findMany({
      where: { direction: "inbound", ticket: { subDepartment: { departmentId } } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        status: true,
        fromName: true,
        fromEmail: true,
        bodyHtml: true,
        acceptedAt: true,
        acceptedBy: { select: { id: true, name: true } },
        createdAt: true,
        ticket: {
          select: {
            id: true,
            title: true,
            ticketNumber: true,
            subDepartmentId: true,
            subDepartment: { select: { prefix: true } },
          },
        },
      },
    }),
    connections.length
      ? prisma.mailSuppressionLog.findMany({
          where: { mailboxConnectionId: { in: connections.map((c) => c.id) } },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : Promise.resolve([]),
  ])

  return NextResponse.json({
    connections,
    messages: messages.map((m) => ({
      id: m.id,
      status: m.status,
      fromName: m.fromName,
      fromEmail: m.fromEmail,
      bodyHtml: m.bodyHtml,
      createdAt: m.createdAt,
      acceptedAt: m.acceptedAt,
      acceptedByName: m.acceptedBy?.name ?? null,
      subDepartmentId: m.ticket.subDepartmentId,
      ticket: {
        id: m.ticket.id,
        title: m.ticket.title,
        humanId: `${m.ticket.subDepartment.prefix}-${m.ticket.ticketNumber}`,
      },
    })),
    suppressed,
  })
}
