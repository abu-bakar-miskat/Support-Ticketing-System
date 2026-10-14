import { prisma } from "@/lib/db"
import { presentPortalComment } from "@/lib/portal-comments"
import type { ConversationMessage } from "@/lib/ticket-sub-status"

/**
 * Portal API tickets have no email conversation: the requester-visible
 * comment thread replaces it. These helpers express that thread as the same
 * inbound/outbound ConversationMessage stream email tickets use, so the
 * "Waiting for assignee/customer" label, work-timer sync, and SLA pause rules
 * apply unchanged. A requester comment (portal marker) is inbound; any other
 * portal-visible comment is a staff reply and therefore outbound.
 */

/** Comments that make up the requester-visible portal reply thread. */
export const PORTAL_THREAD_WHERE = {
  deletedAt: null,
  messageId: null,
  portalVisible: true,
} as const

/** Prisma select fragment: the latest portal-thread comment on a ticket. */
export const latestPortalCommentSelect = {
  where: PORTAL_THREAD_WHERE,
  orderBy: { createdAt: "desc" as const },
  take: 1,
  select: { body: true, authorId: true, createdAt: true },
}

/** Prisma select fragment: intake fields needed to recognise requester comments. */
export const portalIntakeSelect = {
  select: { submitterName: true, apiKey: { select: { createdById: true } } },
}

type PortalIntake = {
  submitterName: string
  apiKey: { createdById: string } | null
} | null | undefined

type PortalThreadComment = { body: string; authorId: string; createdAt: Date }

type DirectedMessage = {
  direction: string
  status?: string | null
  createdAt: Date | string
}

export function portalCommentsAsConversation(
  comments: readonly PortalThreadComment[],
  intake: PortalIntake,
): ConversationMessage[] {
  if (!intake?.apiKey) return []
  return comments.map((c) => ({
    direction: presentPortalComment({
      body: c.body,
      authorId: c.authorId,
      apiKeyCreatedById: intake.apiKey?.createdById,
      submitterName: intake.submitterName,
    }).isPortalRequester
      ? "inbound"
      : "outbound",
    createdAt: c.createdAt,
  }))
}

/** Latest non-system direction across email messages and portal comments. */
export function latestConversationDirection(
  messages: readonly DirectedMessage[],
  portal: readonly ConversationMessage[] = [],
): "inbound" | "outbound" | null {
  let latest: { direction: string; at: number } | null = null
  for (const m of [...messages, ...portal]) {
    if (m.status === "system" || m.status === "quarantined") continue
    const at = new Date(m.createdAt).getTime()
    if (!latest || at >= latest.at) latest = { direction: m.direction, at }
  }
  if (!latest) return null
  return latest.direction === "inbound" ? "inbound" : "outbound"
}

/** Portal conversation per ticket (only portal API tickets appear in the map). */
export async function loadPortalConversations(
  ticketIds?: readonly string[],
): Promise<Map<string, ConversationMessage[]>> {
  const comments = await prisma.comment.findMany({
    where: {
      ...PORTAL_THREAD_WHERE,
      ...(ticketIds ? { ticketId: { in: [...ticketIds] } } : {}),
      ticket: { intake: { apiKeyId: { not: null } } },
    },
    select: {
      ticketId: true,
      body: true,
      authorId: true,
      createdAt: true,
      ticket: { select: { intake: portalIntakeSelect } },
    },
  })

  const byTicket = new Map<string, ConversationMessage[]>()
  for (const c of comments) {
    const [msg] = portalCommentsAsConversation([c], c.ticket.intake)
    if (!msg) continue
    const list = byTicket.get(c.ticketId) ?? []
    list.push(msg)
    byTicket.set(c.ticketId, list)
  }
  return byTicket
}

export async function loadPortalConversation(ticketId: string): Promise<ConversationMessage[]> {
  return (await loadPortalConversations([ticketId])).get(ticketId) ?? []
}
