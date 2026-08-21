import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminOrManager } from "@/lib/auth";
import { getProfileDeptScope } from "@/lib/dept-scope";

// GET /api/departments/[id]/mailbox-mail
// All mail seen by this department's mailbox connection(s): inbound
// TicketMessages (trusted/quarantined/system) filed against one of the
// department's tickets, plus auto-generated mail that never became a ticket
// (MailSuppressionLog, keyed by mailboxConnectionId).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager();
  if (error) return error;

  const { id: departmentId } = await params;
  if (caller!.role === "manager") {
    const deptScope = await getProfileDeptScope(caller!);
    if (!deptScope?.allowedDeptIds.includes(departmentId)) {
      return NextResponse.json({ error: "Department is outside your scope" }, { status: 403 });
    }
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, tenantId: true },
  });
  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const connections = await prisma.mailboxConnection.findMany({
    where: { departmentId },
    select: { id: true, address: true, status: true },
  });

  const [messages, suppressed] = await Promise.all([
    prisma.ticketMessage.findMany({
      where: {
        direction: "inbound",
        ticket: { subDepartment: { departmentId } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        ticketId: true,
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
  ]);

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
  });
}
