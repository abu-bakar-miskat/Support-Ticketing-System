import { NextRequest, NextResponse } from "next/server"
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { syncWorkTimerWithLatestConversation } from "@/lib/timer-conversation-sync"

/**
 * Lightweight fallback used when a chat broadcast reaches this app before the
 * webhook instance that stored the message has synchronized its work timer.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: ticketId } = await params
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      tenantId: true,
      subDepartmentId: true,
      assigneeId: true,
      creatorId: true,
      deletedAt: true,
      assignees: { select: { userId: true } },
      subDepartment: { select: { departmentId: true } },
    },
  })
  if (!ticket || ticket.deletedAt) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  const accessError = await assertTicketAccess(profile, ticket, { forWrite: false })
  if (accessError) return accessError

  await syncWorkTimerWithLatestConversation(ticketId)
  return NextResponse.json({ ok: true })
}
