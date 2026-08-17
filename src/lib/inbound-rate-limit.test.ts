import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    ticketMessage: { count: vi.fn() },
  },
}))

import { isOverRateLimit, RATE_LIMIT_CAP } from "./inbound-rate-limit"
import { prisma } from "@/lib/db"

const mockCount = vi.mocked(prisma.ticketMessage.count)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("isOverRateLimit", () => {
  it("returns false when count is below the cap", async () => {
    mockCount.mockResolvedValue(RATE_LIMIT_CAP - 1)
    expect(await isOverRateLimit("ticket-1")).toBe(false)
  })

  it("returns true when count equals the cap (cap-th message triggers throttle)", async () => {
    mockCount.mockResolvedValue(RATE_LIMIT_CAP)
    expect(await isOverRateLimit("ticket-1")).toBe(true)
  })

  it("returns true when count exceeds the cap", async () => {
    mockCount.mockResolvedValue(RATE_LIMIT_CAP + 5)
    expect(await isOverRateLimit("ticket-1")).toBe(true)
  })

  it("returns false when no messages exist (fresh thread)", async () => {
    mockCount.mockResolvedValue(0)
    expect(await isOverRateLimit("ticket-1")).toBe(false)
  })

  it("queries only inbound trusted/quarantined messages (excludes system)", async () => {
    mockCount.mockResolvedValue(0)
    await isOverRateLimit("ticket-1")
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          direction: "inbound",
          status: { in: ["trusted", "quarantined"] },
        }),
      }),
    )
  })

  it("scopes the count to the given ticket", async () => {
    mockCount.mockResolvedValue(0)
    await isOverRateLimit("ticket-xyz")
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ticketId: "ticket-xyz" }),
      }),
    )
  })

  it("applies a createdAt window filter", async () => {
    mockCount.mockResolvedValue(0)
    await isOverRateLimit("ticket-1")
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    )
  })
})
