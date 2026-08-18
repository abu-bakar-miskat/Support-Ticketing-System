import { prisma } from "@/lib/db"
import { notifyTicketCompletion } from "@/lib/ticket-completion-notify"
import { cascadeCompleteToSubtickets } from "@/lib/ticket-cascade"
import { pickStatusMove, resolveTargetLabel, type GitHubStatusEvent } from "./status-map"

/**
 * Webhook-driven status change. Resolves the target label from the GitHub
 * event via the team's githubStatusMap override (or smart defaults) using
 * resolveTargetLabel, then applies it. Bypasses the sequential-transition
 * rule the user-facing status route enforces (that rule is for the human
 * workflow UI), but is forward-only and never auto-completes intake
 * tickets — see pickStatusMove. The STATUS_CHANGED ActivityLog entry is
 * written by the DB trigger; we stamp `app.activity_source` so the UI renders
 * it as an automation event ("moved to Live · PR merged to <base>") instead
 * of crediting a human. The actor falls back to the creator only to satisfy
 * the NOT NULL FK.
 */
export async function advanceTicketStatus(
  ticketId: string,
  event: GitHubStatusEvent,
  baseRef?: string | null,
): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      title: true,
      status: true,
      subDepartmentId: true,
      ticketNumber: true,
      creatorId: true,
      closedAt: true,
      deletedAt: true,
      subDepartment: { select: { prefix: true, githubStatusMap: true } },
      intake: { select: { id: true } },
    },
  })
  if (!ticket || ticket.deletedAt !== null) return

  const statuses = await prisma.subDepartmentStatus.findMany({
    where: { subDepartmentId: ticket.subDepartmentId },
    orderBy: { order: "asc" },
    select: { label: true, order: true, isComplete: true },
  })

  const targetLabel = resolveTargetLabel(event, statuses, ticket.subDepartment.githubStatusMap)
  if (!targetLabel) return

  const move = pickStatusMove(ticket.status, targetLabel, statuses, ticket.intake !== null)
  if (!move) return

  const activitySource = JSON.stringify({
    source: "github",
    event,
    ...(baseRef ? { base: baseRef } : {}),
  })

  // Optimistic guard: only update if the status hasn't changed since we read it.
  // Set the GUCs in the same transaction as the update so the ActivityLog
  // trigger stamps the automation source (and a FK-safe actor).
  const { count } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ticket.creatorId}, true)`
    await tx.$executeRaw`SELECT set_config('app.activity_source', ${activitySource}, true)`
    return tx.ticket.updateMany({
      where: { id: ticket.id, status: ticket.status },
      data: {
        status: move.label,
        closedAt: move.isComplete ? (ticket.closedAt ?? new Date()) : null,
      },
    })
  })
  if (count === 0 || !move.isComplete) return

  notifyTicketCompletion({
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    humanId: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
    subDepartmentId: ticket.subDepartmentId,
    creatorId: ticket.creatorId,
    actorId: ticket.creatorId,
    actorName: "GitHub",
  }).catch(() => undefined)
  cascadeCompleteToSubtickets(ticket.id).catch(() => undefined)
}
