import { prisma } from "@/lib/db"

/** Sliding window length for the per-thread inbound rate limit. */
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

/** Max inbound messages per thread per window before notifications are suppressed. */
export const RATE_LIMIT_CAP = 20

/**
 * Returns true when the ticket already has ≥ RATE_LIMIT_CAP inbound messages
 * (trusted or quarantined) within the last RATE_LIMIT_WINDOW_MS.
 *
 * System (auto-reply) messages are excluded from the count — they are already
 * suppressed independently and should not inflate the burst counter.
 *
 * Call this BEFORE creating the new message so the count reflects the state
 * prior to the incoming message.
 */
export async function isOverRateLimit(ticketId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)
  const count = await prisma.ticketMessage.count({
    where: {
      ticketId,
      direction: "inbound",
      status: { in: ["trusted", "quarantined"] },
      createdAt: { gte: windowStart },
    },
  })
  return count >= RATE_LIMIT_CAP
}
