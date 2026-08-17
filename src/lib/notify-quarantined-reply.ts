import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"

/**
 * Fire `customer_reply_review` notifications when an inbound message is
 * quarantined (valid token, mismatched sender). Notifies the assignee when
 * set; otherwise notifies dept manager(s) and the ticket creator.
 */
export async function notifyQuarantinedReply({
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
      type: "customer_reply_review",
      ticketId,
      message: ticketTitle,
    }).catch(() => undefined)

  if (assigneeId) {
    await notify(assigneeId)
    return
  }

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
