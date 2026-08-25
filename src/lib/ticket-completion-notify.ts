import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"
import { sendTicketCompletedEmail } from "@/lib/email"

/**
 * Notifies the ticket creator and all department managers when a ticket is
 * completed by someone else. Skips the actor (the person who made the change).
 */
export async function notifyTicketCompletion({
  ticketId,
  ticketTitle,
  humanId,
  subDepartmentId,
  creatorId,
  actorId,
  actorName,
}: {
  ticketId: string
  ticketTitle: string
  humanId: string
  subDepartmentId: string
  creatorId: string
  actorId: string
  actorName: string
}) {
  // Resolve the department for this team
  const subDepartment = await prisma.subDepartment.findUnique({
    where: { id: subDepartmentId },
    select: { departmentId: true },
  })
  if (!subDepartment) return

  // Fetch department managers
  const deptManagers = await prisma.departmentManager.findMany({
    where: { departmentId: subDepartment.departmentId },
    select: { user: { select: { id: true, name: true, email: true } } },
  })

  // Build deduplicated recipient list: creator + all managers
  const byId = new Map<string, { id: string; name: string; email: string }>()

  const creator = await prisma.profile.findUnique({
    where: { id: creatorId },
    select: { id: true, name: true, email: true },
  })
  if (creator) byId.set(creator.id, creator)

  for (const { user } of deptManagers) {
    byId.set(user.id, user)
  }

  // Remove the actor — they made the change themselves
  byId.delete(actorId)

  for (const recipient of byId.values()) {
    // In-app notification (gated by user's "statusChanges" pref inside createNotification)
    createNotification({
      recipientId: recipient.id,
      actorId,
      type: "status_change",
      ticketId,
      message: "completed",
    }).catch(() => undefined)

    // Email (gated by user's "emailOnTicketComplete" pref inside sendTicketCompletedEmail)
    sendTicketCompletedEmail({
      to: recipient.email,
      recipientId: recipient.id,
      recipientName: recipient.name,
      ticketId,
      humanId,
      ticketTitle,
      completedByName: actorName,
      departmentId: subDepartment.departmentId,
      subDepartmentId,
    }).catch(() => undefined)
  }
}
