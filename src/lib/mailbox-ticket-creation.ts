import "server-only";
import { prisma } from "@/lib/db";
import { autoAssignTicket, recordAssignmentFailure } from "@/lib/assignment-engine";
import { resolveColumnIdForStatus } from "@/lib/board-columns";
import { getTeamStatuses } from "@/lib/board-data";
import { resolveSupportProjectForDepartment } from "@/lib/support-project";
import { ensureSystemUser } from "@/lib/intake-conversion";
import { ensureProjectMembers } from "@/lib/ensure-project-members";
import { startSlaTimers } from "@/lib/sla-engine";
import { createNotification } from "@/lib/notify";
import { sendAssignmentEmail } from "@/lib/email";

/**
 * EM-01/02/03: creates a brand-new ticket from an inbound email that matched
 * a configured `MailboxConnection` (no reply-token/header/subject match to an
 * existing ticket). Mirrors the ticket-creation block in
 * lib/intake-conversion.ts's runConversion — same ticketNumber-by-trigger,
 * board-column resolution, auto-assignment, and SLA-timer wiring — but there
 * is no Intake/form submission behind it, so it's simpler: no responses, no
 * versioned form values.
 */
export type CreateTicketFromEmailResult = {
  id: string;
  ticketNumber: number;
  teamPrefix: string;
  creatorId: string;
  assigneeId: string | null;
};

export async function createTicketFromInboundEmail(params: {
  departmentId: string;
  teamId: string;
  fromEmail: string;
  fromName: string;
  subject: string | null;
}): Promise<CreateTicketFromEmailResult> {
  const { departmentId, teamId, fromEmail, fromName, subject } = params;

  const [team, statuses, projectId, creatorId, managerRow] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { tenantId: true, prefix: true } }),
    getTeamStatuses(teamId),
    resolveSupportProjectForDepartment(departmentId),
    ensureSystemUser(),
    prisma.departmentManager.findFirst({ where: { departmentId }, select: { userId: true } }),
  ]);
  const status = statuses[0]?.label ?? "Not Started";
  const title = subject?.trim() || `Email from ${fromName || fromEmail}`;

  const assignResult = await autoAssignTicket({
    departmentId,
    teamId,
    formValues: {},
    excludeUserId: managerRow?.userId ?? null,
  });

  const boardColumnId = await resolveColumnIdForStatus(prisma, { departmentId, status });

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.ticket.create({
      data: {
        title,
        type: "Task",
        priority: "Medium",
        status,
        ticketNumber: 0, // stamped by DB trigger
        creatorId,
        tenantId: team.tenantId,
        teamId,
        projectId,
        assigneeId: assignResult.assigneeId,
        ...(boardColumnId ? { boardColumnId } : {}),
      },
      select: { id: true, ticketNumber: true },
    });

    await tx.activityLog.create({
      data: {
        ticketId: created.id,
        actorId: creatorId,
        action: "TICKET_CREATED",
        metadata: { source: "email", fromEmail, fromName },
      },
    });

    if (assignResult.nextRotaPointer !== undefined) {
      await tx.team.update({ where: { id: teamId }, data: { rotaPointer: assignResult.nextRotaPointer } });
    }

    return created;
  });

  if (assignResult.assigneeId && projectId) {
    await ensureProjectMembers(projectId, [assignResult.assigneeId]).catch(() => undefined);
  }

  await startSlaTimers(ticket.id, team.tenantId, departmentId, {});

  const humanId = `${team.prefix}-${ticket.ticketNumber}`;

  if (assignResult.failed) {
    await recordAssignmentFailure(ticket.id, departmentId, creatorId, title, humanId);
  } else if (assignResult.assigneeId) {
    const assignee = await prisma.profile.findUnique({
      where: { id: assignResult.assigneeId },
      select: { id: true, name: true, email: true },
    });
    if (assignee) {
      createNotification({
        recipientId: assignee.id,
        type: "assignment",
        ticketId: ticket.id,
        message: title,
      }).catch(() => undefined);
      sendAssignmentEmail({
        to: assignee.email,
        assigneeName: assignee.name,
        assigneeId: assignee.id,
        ticketId: ticket.id,
        humanId,
        ticketTitle: title,
        assignedByName: "System",
        assignedById: creatorId,
        departmentId,
      }).catch(() => undefined);
    }
  }

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    teamPrefix: team.prefix,
    creatorId,
    assigneeId: assignResult.assigneeId,
  };
}
