import { prisma } from "@/lib/db"
import { Prisma } from "@/generated/prisma/client"

export const RETENTION_DAYS = 90
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000

/**
 * Purge raw inbound payloads older than the retention window.
 *
 * Sets `rawPayload` to NULL on matching TicketMessage rows, keeping `bodyHtml`
 * and all other columns intact so messages still render in the timeline.
 *
 * Idempotent: records already purged (rawPayload IS NULL) are excluded from
 * the update and incur no write.
 *
 * @param now - Reference point for the cutoff (default: current time). Pass an
 *              explicit value in tests to make boundary assertions deterministic.
 * @returns Number of records purged.
 */
export async function purgeRawPayloads(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_MS)

  const { count } = await prisma.ticketMessage.updateMany({
    where: {
      rawPayload: { not: Prisma.DbNull },
      createdAt: { lt: cutoff },
    },
    data: { rawPayload: Prisma.DbNull },
  })

  return count
}
