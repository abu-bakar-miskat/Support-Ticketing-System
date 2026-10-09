import { checkAndNotifySla } from "@/lib/sla-engine"
import { prisma } from "@/lib/db"
import { startTimerOnStatusChange } from "@/lib/timer-autostart"
import { stopRunningTimersForWaitingCustomer } from "@/lib/timer-autostop"

/**
 * Keep work-time tracking aligned with the derived conversation label.
 * Agent reply: Waiting for customer -> pause every open timer on the ticket.
 * Customer reply: Waiting for assignee -> resume the primary assignee's timer,
 * but only while the ticket's workflow status is still In Progress.
 */
export async function syncWorkTimerWithConversation(
  ticketId: string,
  direction: "inbound" | "outbound",
): Promise<void> {
  if (direction === "outbound") {
    await stopRunningTimersForWaitingCustomer(ticketId)
    await checkAndNotifySla(ticketId)
    return
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      status: true,
      assignee: { select: { id: true, name: true, avatarUrl: true } },
    },
  })
  if (!ticket?.assignee) return

  await startTimerOnStatusChange(ticketId, ticket.status, ticket.assignee)
}

/**
 * Re-derive the conversation state from persisted messages and heal timer
 * state. Used by missed-email reconciliation, including when another deployed
 * instance stored the email before this app observed it.
 */
export async function syncWorkTimerWithLatestConversation(
  ticketId: string,
): Promise<void> {
  const latest = await prisma.ticketMessage.findFirst({
    where: { ticketId, status: { not: "system" } },
    orderBy: { createdAt: "desc" },
    select: { direction: true },
  })
  if (!latest) return

  await syncWorkTimerWithConversation(ticketId, latest.direction)
}
