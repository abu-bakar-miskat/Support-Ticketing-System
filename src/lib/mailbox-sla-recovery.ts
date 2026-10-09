import { prisma } from "@/lib/db"
import { prepareMailboxSla } from "@/lib/sla-engine"

/** Heal open email tickets created by an older webhook deployment. No delivery,
 * escalation, or completion hooks run here; existing clock stops/history survive. */
export async function recoverMailboxSla(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      tenantId: true, createdAt: true, assigneeId: true, subDepartmentId: true,
      closedAt: true, deletedAt: true, isDraft: true, intake: { select: { id: true } },
      subDepartment: { select: { departmentId: true } },
      slaTimer: { select: { source: true } },
    },
  })
  if (!ticket || ticket.closedAt || ticket.deletedAt || ticket.isDraft || ticket.intake || ticket.slaTimer?.source === "mailbox") return
  const origin = await prisma.activityLog.findFirst({
    where: { ticketId, action: "TICKET_CREATED", metadata: { path: ["source"], equals: "email" } },
    orderBy: { createdAt: "asc" }, select: { metadata: true },
  })
  if (!origin) return
  const metadata = origin.metadata as { rawPayload?: { mailboxConnectionId?: unknown } } | null
  let connectionId = metadata?.rawPayload?.mailboxConnectionId
  if (typeof connectionId !== "string") {
    // Older deployments stored the routing envelope on the initial message.
    const initial = await prisma.ticketMessage.findFirst({
      where: { ticketId, direction: "inbound", status: "trusted" },
      orderBy: { createdAt: "asc" }, select: { rawPayload: true },
    })
    const raw = initial?.rawPayload as { mailboxConnectionId?: unknown; envelopeTo?: unknown; to?: unknown } | null
    connectionId = raw?.mailboxConnectionId
    if (typeof connectionId !== "string") {
      const recipients = raw?.envelopeTo ?? raw?.to
      const addresses = (Array.isArray(recipients) ? recipients : [recipients])
        .filter((value): value is string => typeof value === "string")
        .map((value) => (value.match(/<([^>]+)>/)?.[1] ?? value).trim().toLowerCase())
      if (addresses.length) {
        const mailbox = await prisma.mailboxConnection.findFirst({
          where: { tenantId: ticket.tenantId, departmentId: ticket.subDepartment.departmentId, address: { in: addresses } },
          select: { id: true },
        })
        connectionId = mailbox?.id
      }
    }
  }
  const plan = await prepareMailboxSla(ticket.tenantId, ticket.subDepartment.departmentId, {
    mailboxConnectionId: typeof connectionId === "string" ? connectionId : null,
    subDepartmentId: ticket.subDepartmentId, assigneeId: ticket.assigneeId, now: ticket.createdAt,
  })
  if (!plan) return
  await prisma.$transaction(async (tx) => {
    // Serialize refreshes and completion against this ticket, including the
    // missing-timer case. Never reopen or replace a completed ticket's history.
    await tx.$queryRaw`SELECT "id" FROM "Ticket" WHERE "id" = ${ticketId} FOR UPDATE`
    const current = await tx.ticket.findUnique({ where: { id: ticketId }, select: { closedAt: true, deletedAt: true, isDraft: true } })
    if (!current || current.closedAt || current.deletedAt || current.isDraft) return
    const timer = await tx.slaTimer.findUnique({ where: { ticketId }, select: { source: true } })
    if (timer?.source === "mailbox") return
    if (timer) {
      await tx.slaTimer.update({ where: { ticketId }, data: {
        source: plan.source, mailboxConfig: plan.mailboxConfig, policyId: null,
        firstResponseTargetMins: plan.firstResponseTargetMins, resolutionTargetMins: plan.resolutionTargetMins,
      } })
    } else {
      await tx.slaTimer.create({ data: { ticketId, ...plan } })
    }
  })
}
