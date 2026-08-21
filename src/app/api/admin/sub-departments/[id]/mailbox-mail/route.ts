import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdminOrManager } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"

type Params = { params: Promise<{ id: string }> }

// GET /api/admin/sub-departments/[id]/mailbox-mail
// Every email this sub-department's mailbox connection(s) received: inbound
// TicketMessages filed against the team's tickets, plus auto-generated mail
// that never became a ticket (MailSuppressionLog, keyed by mailboxConnectionId).
export async function GET(_req: NextRequest, { params }: Params) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params
  const subDepartment = await prisma.subDepartment.findUnique({
    where: { id },
    select: { id: true, departmentId: true },
  })
  if (!subDepartment) {
    return NextResponse.json({ error: "Sub-department not found" }, { status: 404 })
  }

  if (caller!.role === "manager") {
    const deptScope = await getProfileDeptScope(caller!)
    if (!deptScope?.allowedDeptIds.includes(subDepartment.departmentId)) {
      return NextResponse.json({ error: "Sub-department is outside your scope" }, { status: 403 })
    }
  }

  const connections = await prisma.mailboxConnection.findMany({
    where: { subDepartmentId: id },
    select: { id: true, address: true, status: true },
  })

  const [messages, suppressed] = await Promise.all([
    prisma.ticketMessage.findMany({
      where: { direction: "inbound", ticket: { subDepartmentId: id } },
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
      ticket: {
        id: m.ticket.id,
        title: m.ticket.title,
        humanId: `${m.ticket.subDepartment.prefix}-${m.ticket.ticketNumber}`,
      },
    })),
    suppressed,
  })
}
