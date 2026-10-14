import { loadMailboxOrigins } from "@/lib/mailbox-ticket-origin"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdminOrManager } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { runAsSystem } from "@/lib/request-scope"
import { mailboxConnectionIdsForMessage } from "@/lib/mailbox-mail"

type Params = { params: Promise<{ id: string }> }

// GET /api/admin/sub-departments/[id]/mailbox-mail
// The original email that opened each ticket in this sub-department (the first
// inbound TicketMessage per ticket) — customer replies to an existing ticket are
// NOT listed here, only the mail that created a ticket. Plus auto-generated mail
// that never became a ticket (MailSuppressionLog, keyed by mailboxConnectionId).
export async function GET(_req: NextRequest, { params }: Params) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params
  const subDepartment = await runAsSystem(() =>
    prisma.subDepartment.findUnique({
      where: { id },
      select: { id: true, departmentId: true },
    }),
  )
  if (!subDepartment) {
    return NextResponse.json({ error: "Sub-department not found" }, { status: 404 })
  }

  if (caller!.role === "manager") {
    const deptScope = await getProfileDeptScope(caller!)
    if (!deptScope?.allowedDeptIds.includes(subDepartment.departmentId)) {
      return NextResponse.json({ error: "Sub-department is outside your scope" }, { status: 403 })
    }
  }

  const connections = await runAsSystem(() =>
    prisma.mailboxConnection.findMany({
      where: { subDepartmentId: id },
      select: { id: true, address: true, status: true, subDepartmentId: true },
    }),
  )

  const [messages, suppressed, origins] = await runAsSystem(() => Promise.all([
    prisma.ticketMessage.findMany({
      where: { direction: "inbound", status: { not: "system" }, ticket: { subDepartmentId: id } },
      // One row per ticket — its earliest inbound message, i.e. the email that
      // opened the ticket. `distinct` keeps the first row seen per ticketId in
      // the given order, so ticketId + createdAt asc yields the original mail and
      // drops every later reply. Re-sorted to newest-first below for display.
      orderBy: [{ ticketId: "asc" }, { createdAt: "asc" }],
      distinct: ["ticketId"],
      select: {
        id: true,
        status: true,
        fromName: true,
        fromEmail: true,
        bodyHtml: true,
        acceptedAt: true,
        rawPayload: true,
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
    loadMailboxOrigins({ subDepartmentId: id }),
  ]))

  const originTicketIds = new Set(origins.map((origin) => origin.ticket.id))
  const sortedMessages = [...messages.filter((message) => !originTicketIds.has(message.ticket.id)), ...origins]
    .map((message) => ({
      ...message,
      mailboxConnectionIds: mailboxConnectionIdsForMessage(message.rawPayload, connections),
    }))
    .filter((message) => message.mailboxConnectionIds.length > 0)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 200)

  return NextResponse.json({
    connections,
    messages: sortedMessages.map((m) => ({
      id: m.id,
      status: m.status,
      fromName: m.fromName,
      fromEmail: m.fromEmail,
      bodyHtml: m.bodyHtml,
      createdAt: m.createdAt,
      acceptedAt: m.acceptedAt,
      acceptedByName: m.acceptedBy?.name ?? null,
      subDepartmentId: m.ticket.subDepartmentId,
      mailboxConnectionIds: m.mailboxConnectionIds,
      ticket: {
        id: m.ticket.id,
        title: m.ticket.title,
        humanId: `${m.ticket.subDepartment.prefix}-${m.ticket.ticketNumber}`,
      },
    })),
    suppressed,
  })
}
