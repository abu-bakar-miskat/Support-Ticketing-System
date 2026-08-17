import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"

/**
 * Fire `customer_reply` in-app notifications when an inbound customer email is
 * received on a ticket. Targets the assignee when set; falls back to the
 * department manager(s) and ticket creator when unassigned.
 */
export async function notifyCustomerReply({
  ticketId,
  ticketTitle,
  teamId,
  assigneeId,
  creatorId,
}: {
  ticketId: string
  ticketTitle: string
  teamId: string
  assigneeId: string | null
  creatorId: string
}) {
  const notify = (recipientId: string) =>
    createNotification({
      recipientId,
      type: "customer_reply",
      ticketId,
      message: ticketTitle,
    }).catch(() => undefined)

  if (assigneeId) {
    await notify(assigneeId)
    return
  }

  // Unassigned: notify dept manager(s) + ticket creator (deduped)
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { departmentId: true },
  })
  if (!team) return

  const managers = await prisma.departmentManager.findMany({
    where: { departmentId: team.departmentId },
    select: { user: { select: { id: true } } },
  })

  const recipients = new Map<string, string>()
  recipients.set(creatorId, creatorId)
  for (const { user } of managers) recipients.set(user.id, user.id)

  await Promise.all([...recipients.values()].map(notify))
}
