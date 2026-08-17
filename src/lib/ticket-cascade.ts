import "server-only"
import { prisma } from "@/lib/db"
import { syncResolutionTimerOnClosedAtChange } from "@/lib/sla-engine"

/**
 * When a parent ticket is moved to a complete status, automatically complete
 * all its sub-tickets that are not already in a complete status.
 * Each sub-ticket is updated to the first isComplete status configured for its team.
 */
export async function cascadeCompleteToSubtickets(
  parentId: string,
): Promise<void> {
  const subTickets = await prisma.ticket.findMany({
    where: { parentId, deletedAt: null },
    select: { id: true, teamId: true, status: true },
  })

  if (subTickets.length === 0) return

  const subTeamIds = [...new Set(subTickets.map((s) => s.teamId))]

  const completeStatuses = await prisma.teamStatus.findMany({
    where: { teamId: { in: subTeamIds }, isComplete: true },
    select: { teamId: true, label: true, order: true },
    orderBy: { order: "asc" },
  })

  // First complete status per team (lowest order)
  const firstCompleteByTeam = new Map<string, string>()
  for (const s of completeStatuses) {
    if (!firstCompleteByTeam.has(s.teamId)) {
      firstCompleteByTeam.set(s.teamId, s.label)
    }
  }

  const alreadyCompleteLabels = new Set(completeStatuses.map((s) => s.label))
  const now = new Date()

  await Promise.all(
    subTickets
      .filter((s) => !alreadyCompleteLabels.has(s.status))
      .map(async (sub) => {
        const completeStatus = firstCompleteByTeam.get(sub.teamId)
        if (!completeStatus) return
        await prisma.ticket.update({
          where: { id: sub.id },
          data: { status: completeStatus, closedAt: now },
        })
        await syncResolutionTimerOnClosedAtChange(sub.id, now)
      }),
  )
}
