import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api-key-auth", () => ({
  runWithApiKeyScope: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}))
vi.mock("@/lib/db", () => ({
  prisma: { ticket: { findFirst: vi.fn() } },
}))
vi.mock("@/lib/portal-api", () => ({
  enforcePortalRateLimit: vi.fn(() => null),
  portalJson: vi.fn((body: unknown, init?: ResponseInit) => Response.json(body, init)),
  requirePortalApiKey: vi.fn(async () => ({
    ctx: {
      keyId: "key-1",
      tenantId: "tenant-1",
      createdById: "owner-1",
    },
    error: null,
  })),
}))

import { prisma } from "@/lib/db"
import { GET } from "./route"

const mockTicketFindFirst = vi.mocked(prisma.ticket.findFirst)

describe("GET /api/portal/v1/tickets/[ticketId]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTicketFindFirst.mockResolvedValue(null)
  })

  it("filters out staff-only comments in the database query", async () => {
    await GET(
      new NextRequest("https://example.test/api/portal/v1/tickets/ticket-1"),
      { params: Promise.resolve({ ticketId: "ticket-1" }) },
    )

    expect(mockTicketFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          comments: expect.objectContaining({
            where: {
              deletedAt: null,
              messageId: null,
              portalVisible: true,
            },
          }),
        }),
      }),
    )
  })
})
