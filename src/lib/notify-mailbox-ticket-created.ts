import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"

/** New mailbox arrivals go to the department and tenant managers. Assignment
 * notifications remain the assignee's separate notification. No email is sent. */
export async function notifyMailboxTicketCreated({ ticketId, tenantId, departmentId, mailboxConnectionId }: {
  ticketId: string; tenantId: string; departmentId: string; mailboxConnectionId?: string | null;
}) {
  const [departmentManagers, tenantManagers, mailbox] = await Promise.all([
    prisma.departmentManager.findMany({ where: { departmentId }, select: { userId: true } }),
    prisma.tenantMembership.findMany({ where: { tenantId, role: { in: ["admin", "manager"] }, isActive: true }, select: { userId: true } }),
    mailboxConnectionId ? prisma.mailboxConnection.findFirst({ where: { id: mailboxConnectionId, departmentId, tenantId }, select: { address: true } }) : null,
  ])
  const recipients = new Set([...departmentManagers, ...tenantManagers].map((manager) => manager.userId))
  await Promise.all([...recipients].map(async (recipientId) => {
    // The shared DB persists arrivals atomically, including older webhook
    // instances. Keep the app fallback without duplicating that stored alert.
    const existing = await prisma.notification.findFirst({ where: { recipientId, ticketId, type: "intake_manager_alert" }, select: { id: true } })
    if (existing) return
    await createNotification({
    recipientId, type: "intake_manager_alert", ticketId,
    message: mailbox ? `shared mailbox ${mailbox.address}` : "shared mailbox",
  })
  }))
}
