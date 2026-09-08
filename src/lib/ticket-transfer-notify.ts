import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { sendTicketTransferredEmail } from "@/lib/email";

/**
 * Notifies everyone who owns a ticket's move between sub-departments (ASG-06):
 * the SOURCE department's manager(s), the SOURCE sub-department's sub-manager(s),
 * and the DESTINATION sub-department's sub-manager(s). Skips the actor who did
 * the transfer. In-app (type `ticket_transferred`) plus email, both best-effort.
 */
export async function notifyTicketTransfer({
  ticketId,
  ticketTitle,
  humanId,
  actorId,
  actorName,
  fromDepartmentId,
  fromSubDepartmentId,
  fromSubDepartmentName,
  toDepartmentId,
  toSubDepartmentId,
  toSubDepartmentName,
}: {
  ticketId: string;
  ticketTitle: string;
  humanId: string;
  actorId: string;
  actorName: string;
  fromDepartmentId: string;
  fromSubDepartmentId: string;
  fromSubDepartmentName: string;
  toDepartmentId: string;
  toSubDepartmentId: string;
  toSubDepartmentName: string;
}) {
  const [sourceDeptManagers, sourceSubManagers, destSubManagers] = await Promise.all([
    prisma.departmentManager.findMany({
      where: { departmentId: fromDepartmentId },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.subDepartmentMembership.findMany({
      where: { subDepartmentId: fromSubDepartmentId, role: "sub_manager", isActive: true },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.subDepartmentMembership.findMany({
      where: { subDepartmentId: toSubDepartmentId, role: "sub_manager", isActive: true },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  // Dedupe recipients, then drop the actor — they made the move themselves.
  const byId = new Map<string, { id: string; name: string; email: string }>();
  for (const { user } of [...sourceDeptManagers, ...sourceSubManagers, ...destSubManagers]) {
    byId.set(user.id, user);
  }
  byId.delete(actorId);

  const message = `from ${fromSubDepartmentName} to ${toSubDepartmentName}`;

  for (const recipient of byId.values()) {
    createNotification({
      recipientId: recipient.id,
      actorId,
      type: "ticket_transferred",
      ticketId,
      message,
    }).catch(() => undefined);

    sendTicketTransferredEmail({
      to: recipient.email,
      recipientId: recipient.id,
      recipientName: recipient.name,
      ticketId,
      humanId,
      ticketTitle,
      fromSubDepartmentName,
      toSubDepartmentName,
      transferredByName: actorName,
      departmentId: toDepartmentId,
      subDepartmentId: toSubDepartmentId,
    }).catch(() => undefined);
  }
}
