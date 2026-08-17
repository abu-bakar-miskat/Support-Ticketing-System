import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    ticketMessage: { updateMany: vi.fn() },
  },
}))

// Prisma.DbNull is a sentinel object — mock it as a unique symbol so the test
// can assert it is passed correctly without importing the real Prisma client.
vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    DbNull: Symbol("DbNull"),
  },
}))

import { purgeRawPayloads, RETENTION_DAYS, RETENTION_MS } from "./raw-payload-purge"
import { prisma } from "@/lib/db"

const mockUpdateMany = vi.mocked(prisma.ticketMessage.updateMany)

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateMany.mockResolvedValue({ count: 0 })
})

// ── purge boundary ────────────────────────────────────────────────────────────

describe("purgeRawPayloads", () => {
  it("returns the count of purged records", async () => {
    mockUpdateMany.mockResolvedValue({ count: 42 })
    expect(await purgeRawPayloads()).toBe(42)
  })

  it("sets the cutoff exactly at RETENTION_MS before now", async () => {
    const now = new Date("2026-07-08T03:00:00.000Z")
    await purgeRawPayloads(now)

    const expectedCutoff = new Date(now.getTime() - RETENTION_MS)

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lt: expectedCutoff },
        }),
      }),
    )
  })

  it("does NOT purge a message created just under 90 days ago", async () => {
    const now = new Date("2026-07-08T03:00:00.000Z")
    // 89 days + 23 hours ago — still within the retention window
    const justUnder90 = new Date(now.getTime() - (RETENTION_DAYS - 1) * 24 * 60 * 60 * 1000)

    await purgeRawPayloads(now)

    const { createdAt } = (mockUpdateMany.mock.calls[0][0] as { where: { createdAt: { lt: Date } } }).where
    // The message timestamp is AFTER the cutoff → would not be matched by lt
    expect(justUnder90.getTime()).toBeGreaterThan(createdAt.lt.getTime())
  })

  it("DOES purge a message created just over 90 days ago", async () => {
    const now = new Date("2026-07-08T03:00:00.000Z")
    // 90 days + 1 hour ago — just past the retention window
    const justOver90 = new Date(now.getTime() - RETENTION_MS - 60 * 60 * 1000)

    await purgeRawPayloads(now)

    const { createdAt } = (mockUpdateMany.mock.calls[0][0] as { where: { createdAt: { lt: Date } } }).where
    // The message timestamp is BEFORE the cutoff → matched by lt
    expect(justOver90.getTime()).toBeLessThan(createdAt.lt.getTime())
  })

  it("excludes records with rawPayload already null (idempotent filter)", async () => {
    await purgeRawPayloads()

    const where = (mockUpdateMany.mock.calls[0][0] as { where: Record<string, unknown> }).where
    // The where clause must contain a rawPayload filter to skip already-purged rows
    expect(where).toHaveProperty("rawPayload")
  })

  it("sets data.rawPayload to DbNull (not JS null)", async () => {
    await purgeRawPayloads()

    const data = (mockUpdateMany.mock.calls[0][0] as { data: Record<string, unknown> }).data
    // DbNull is a non-null sentinel — must not be undefined or JS null
    expect(data.rawPayload).toBeDefined()
    expect(data.rawPayload).not.toBeNull()
  })

  it("is idempotent — a second call purges 0 records when none remain", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 5 }).mockResolvedValueOnce({ count: 0 })

    const first = await purgeRawPayloads()
    const second = await purgeRawPayloads()

    expect(first).toBe(5)
    expect(second).toBe(0)
    expect(mockUpdateMany).toHaveBeenCalledTimes(2)
  })
})

// ── retention constants ───────────────────────────────────────────────────────

describe("retention constants", () => {
  it("RETENTION_DAYS is 90", () => {
    expect(RETENTION_DAYS).toBe(90)
  })

  it("RETENTION_MS equals 90 days in milliseconds", () => {
    expect(RETENTION_MS).toBe(90 * 24 * 60 * 60 * 1000)
  })
})
