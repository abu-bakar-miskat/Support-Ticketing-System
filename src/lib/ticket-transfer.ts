/**
 * Ticket transfer between departments/sub-departments (slice 13, ASG-06).
 * Team IS the sub-department scope tag (slice 05), so moving `teamId` moves
 * the ticket's effective department/sub-department in one step. Renumbers
 * into the destination team's own counter — `(teamId, ticketNumber)` is
 * unique per team, so the source number can collide with an existing
 * destination ticket — and remaps to the destination board's first OPEN
 * column (DAT-03: a ticket always sits in exactly one column of its own
 * department's board).
 */
import { prisma } from "@/lib/db";
import { firstColumnOfType } from "@/lib/board-columns";

export type TransferResult =
  | { ok: true; ticketId: string; fromTeamId: string; toTeamId: string; newTicketNumber: number }
  | { ok: false; error: string };

/**
 * Moves a ticket to `targetTeamId`. Clears the assignee unless they're still
 * an active member of the destination team, records a FORWARDED ActivityLog
 * entry, and grants the transferring user (`actorId`) permanent read access
 * to the ticket (ASG-06) — without this, SD-06 sub-department scoping would
 * otherwise drop their visibility the moment the ticket leaves their team.
 */
export async function transferTicket(params: {
  ticketId: string;
  targetTeamId: string;
  actorId: string;
}): Promise<TransferResult> {
  const { ticketId, targetTeamId, actorId } = params;

  const [ticket, targetTeam] = await Promise.all([
    prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        teamId: true,
        assigneeId: true,
        deletedAt: true,
        team: { select: { id: true, name: true, departmentId: true, tenantId: true } },
      },
    }),
    prisma.team.findUnique({
      where: { id: targetTeamId },
      select: { id: true, name: true, departmentId: true, tenantId: true },
    }),
  ]);

  if (!ticket || ticket.deletedAt) return { ok: false, error: "Ticket not found" };
  if (!targetTeam) return { ok: false, error: "Destination team not found" };
  if (targetTeam.tenantId !== ticket.team.tenantId) {
    return { ok: false, error: "Destination team is outside this tenant" };
  }
  if (targetTeam.id === ticket.teamId) {
    return { ok: false, error: "Ticket is already in that team" };
  }

  const [assigneeMembership, destColumns] = await Promise.all([
    ticket.assigneeId
      ? prisma.teamMembership.findUnique({
          where: { userId_teamId: { userId: ticket.assigneeId, teamId: targetTeam.id } },
          select: { isActive: true },
        })
      : Promise.resolve(null),
    prisma.boardColumn.findMany({
      where: { departmentId: targetTeam.departmentId },
      select: { id: true, statusType: true, order: true },
    }),
  ]);
  const nextAssigneeId = assigneeMembership?.isActive ? ticket.assigneeId : null;
  const destColumnId = firstColumnOfType(destColumns, "OPEN")?.id ?? null;

  const newTicketNumber = await prisma.$transaction(async (tx) => {
    const counter = await tx.teamTicketCounter.upsert({
      where: { teamId: targetTeam.id },
      create: { teamId: targetTeam.id, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });

    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        teamId: targetTeam.id,
        ticketNumber: counter.lastNumber,
        assigneeId: nextAssigneeId,
        ...(destColumnId ? { boardColumnId: destColumnId } : {}),
      },
    });

    await tx.activityLog.create({
      data: {
        ticketId,
        actorId,
        action: "FORWARDED",
        metadata: {
          fromTeamId: ticket.teamId,
          fromTeamName: ticket.team.name,
          fromDepartmentId: ticket.team.departmentId,
          toTeamId: targetTeam.id,
          toTeamName: targetTeam.name,
          toDepartmentId: targetTeam.departmentId,
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

  return { ok: true, ticketId, fromTeamId: ticket.teamId, toTeamId: targetTeam.id, newTicketNumber };
}
