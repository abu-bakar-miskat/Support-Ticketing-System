import { prisma } from "@/lib/db"

/** Reopen boundaries reset the current display/SLA without deleting work history. */
export async function getWorkCycleStart(ticketId: string): Promise<Date | null> {
  const event = await prisma.activityLog.findFirst({
    where: { ticketId, action: "TIMER_RESET", metadata: { path: ["reopenCycle"], equals: true } },
    orderBy: { createdAt: "desc" }, select: { createdAt: true },
  })
  return event?.createdAt ?? null
}
