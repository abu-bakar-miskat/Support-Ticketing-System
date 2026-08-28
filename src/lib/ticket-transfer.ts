/**
 * Ticket transfer between departments/sub-departments (slice 13, ASG-06).
 * SubDepartment IS the sub-department scope tag (slice 05), so moving `teamId` moves
 * the ticket's effective department/sub-department in one step. Renumbers
 * into the destination subDepartment's own counter — `(teamId, ticketNumber)` is
 * unique per subDepartment, so the source number can collide with an existing
 * destination ticket. The ticket keeps its `status`, which is what the
 * destination board groups on.
 */
import { prisma } from "@/lib/db";

export type TransferResult =
  | { ok: true; ticketId: string; fromTeamId: string; toTeamId: string; newTicketNumber: number }
  | { ok: false; error: string };

/**
 * Moves a ticket to `targetTeamId`. Clears the assignee unless they're still
 * an active member of the destination subDepartment, records a FORWARDED ActivityLog
 * entry, and grants the transferring user (`actorId`) permanent read access
 * to the ticket (ASG-06) — without this, SD-06 sub-department scoping would
 * otherwise drop their visibility the moment the ticket leaves their subDepartment.
 */
export async function transferTicket(params: {
  ticketId: string;
  targetTeamId: string;
  actorId: string;
}): Promise<TransferResult> {
  const { ticketId, targetTeamId, actorId } = params;

  const [ticket, targetSubDepartment] = await Promise.all([
    prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subDepartmentId: true,
        assigneeId: true,
        deletedAt: true,
        subDepartment: { select: { id: true, name: true, departmentId: true, tenantId: true } },
      },
    }),
    prisma.subDepartment.findUnique({
      where: { id: targetTeamId },
      select: { id: true, name: true, departmentId: true, tenantId: true },
    }),
  ]);

  if (!ticket || ticket.deletedAt) return { ok: false, error: "Ticket not found" };
  if (!targetSubDepartment) return { ok: false, error: "Destination subDepartment not found" };
  if (targetSubDepartment.tenantId !== ticket.subDepartment.tenantId) {
    return { ok: false, error: "Destination subDepartment is outside this tenant" };
  }
  if (targetSubDepartment.id === ticket.subDepartmentId) {
    return { ok: false, error: "Ticket is already in that subDepartment" };
  }

  const assigneeMembership = ticket.assigneeId
    ? await prisma.subDepartmentMembership.findUnique({
        where: { userId_subDepartmentId: { userId: ticket.assigneeId, subDepartmentId: targetSubDepartment.id } },
        select: { isActive: true },
      })
    : null;
  const nextAssigneeId = assigneeMembership?.isActive ? ticket.assigneeId : null;

  const newTicketNumber = await prisma.$transaction(async (tx) => {
    const counter = await tx.subDepartmentTicketCounter.upsert({
      where: { subDepartmentId: targetSubDepartment.id },
      create: { subDepartmentId: targetSubDepartment.id, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });

    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        subDepartmentId: targetSubDepartment.id,
        ticketNumber: counter.lastNumber,
        assigneeId: nextAssigneeId,
      },
    });

    await tx.activityLog.create({
      data: {
        ticketId,
        actorId,
        action: "FORWARDED",
        metadata: {
          fromTeamId: ticket.subDepartmentId,
          fromSubDepartmentName: ticket.subDepartment.name,
          fromDepartmentId: ticket.subDepartment.departmentId,
          toTeamId: targetSubDepartment.id,
          toSubDepartmentName: targetSubDepartment.name,
          toDepartmentId: targetSubDepartment.departmentId,
        },
      },
    });

    await tx.ticketAccessGrant.upsert({
      where: { ticketId_userId: { ticketId, userId: actorId } },
      create: { ticketId, userId: actorId, reason: "transfer" },
      update: {},
    });

    return counter.lastNumber;
  });

  return { ok: true, ticketId, fromTeamId: ticket.subDepartmentId, toTeamId: targetSubDepartment.id, newTicketNumber };
}
