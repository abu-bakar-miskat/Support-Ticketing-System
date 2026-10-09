vi.mock("@/lib/sla-engine", () => ({ startMailboxResolutionOnWork: vi.fn().mockResolvedValue(undefined) }))
import { beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn().mockResolvedValue({ profile: { id: "agent-1", name: "Agent" }, error: null }) }))
vi.mock("@/lib/db", () => ({ prisma: {
  ticket: { findUnique: vi.fn() },
  timeEntry: { findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
} }))
vi.mock("@/lib/dept-scope", () => ({ ticketsInScope: vi.fn().mockResolvedValue(true) }))
vi.mock("@/lib/timer-broadcast", () => ({ broadcastTimerChange: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/ticket-events", () => ({ broadcastTicketEvent: vi.fn().mockResolvedValue(undefined), appendTicketEvent: vi.fn() }))
vi.mock("@/lib/feature-flags", () => ({ assertFeatureEnabled: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock("@/lib/time-estimate-notify", () => ({ checkAndNotifyEstimateOverrun: vi.fn().mockResolvedValue(undefined) }))
import { prisma } from "@/lib/db"
import { POST } from "./route"
const request = (body: unknown) => new NextRequest("http://localhost/api/time", { method: "POST", body: JSON.stringify(body) })
beforeEach(() => vi.clearAllMocks())
it("rejects restarting work on a resolved ticket", async () => {
  vi.mocked(prisma.ticket.findUnique).mockResolvedValue({ id: "manual-1", deletedAt: null, closedAt: new Date() } as never)
  const response = await POST(request({ action: "start", ticketId: "manual-1" }))
  expect(response.status).toBe(409)
  expect(prisma.timeEntry.updateMany).not.toHaveBeenCalled()
})
it("caps a late stop at closedAt and guards against overwriting a concurrent stop", async () => {
  const start = new Date("2026-10-09T12:00:00Z")
  const closedAt = new Date("2026-10-09T12:01:01Z")
  vi.mocked(prisma.timeEntry.findFirst).mockResolvedValue({ id: "lap-1", ticketId: "manual-1", startedAt: start, endedAt: null } as never)
  vi.mocked(prisma.ticket.findUnique).mockResolvedValue({ closedAt } as never)
  vi.mocked(prisma.timeEntry.findUniqueOrThrow).mockResolvedValue({ id: "lap-1", ticketId: "manual-1", startedAt: start, endedAt: closedAt, durationSecs: 61 } as never)
  expect((await POST(request({ action: "stop" }))).status).toBe(200)
  expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith({
    where: { id: "lap-1", endedAt: null }, data: { endedAt: closedAt, durationSecs: 61 },
  })
})
