import { beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
vi.mock("@/lib/db", () => ({ prisma: {
  ticket: { findUnique: vi.fn(), update: vi.fn() },
  ticketEstimate: { createMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), aggregate: vi.fn() },
  profile: { findUnique: vi.fn().mockResolvedValue({ name: "Agent" }) },
} }))
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn().mockResolvedValue({ profile: { id: "co-agent" }, error: null }), assertTicketEditAccess: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/ticket-events", () => ({ appendTicketEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/time-estimate-notify", () => ({ checkAndNotifyEstimateOverrun: vi.fn().mockResolvedValue(undefined) }))
import { prisma } from "@/lib/db"
import { PUT, DELETE } from "./route"
import { personalEstimatesWithCreationFallback } from "@/lib/ticket-estimates"
const ticket = { id: "manual-1", assigneeId: "primary-agent", estimatedTime: 5, estimates: [], assignees: [{ userId: "co-agent" }] }
const context = { params: Promise.resolve({ id: ticket.id }) }
const request = (body: unknown) => new NextRequest("http://localhost/api/tickets/manual-1/estimates", { method: "PUT", body: JSON.stringify(body) })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.ticket.findUnique).mockResolvedValue(ticket as never)
  vi.mocked(prisma.ticketEstimate.aggregate).mockResolvedValue({ _sum: { estimatedMinutes: 7 } } as never)
})
it("preserves the original five-minute estimate when a co-assignee adds two minutes", async () => {
  expect((await PUT(request({ estimatedMinutes: 2 }), context)).status).toBe(200)
  expect(prisma.ticketEstimate.createMany).toHaveBeenCalledWith({
    data: [{ ticketId: ticket.id, userId: "primary-agent", estimatedMinutes: 5 }], skipDuplicates: true,
  })
  expect(prisma.ticketEstimate.upsert).toHaveBeenCalledWith(expect.objectContaining({
    create: expect.objectContaining({ userId: "co-agent", estimatedMinutes: 2 }),
  }))
  expect(prisma.ticket.update).toHaveBeenCalledWith({ where: { id: ticket.id }, data: { estimatedTime: 7 } })
})
it("does not seed again when personal estimates already exist", async () => {
  vi.mocked(prisma.ticket.findUnique).mockResolvedValue({ ...ticket, estimates: [{ userId: "primary-agent" }] } as never)
  await PUT(request({ estimatedMinutes: 2 }), context)
  expect(prisma.ticketEstimate.createMany).not.toHaveBeenCalled()
})
it("allows clearing an old creation estimate without resurrecting it on refresh", async () => {
  vi.mocked(prisma.ticketEstimate.aggregate).mockResolvedValue({ _sum: { estimatedMinutes: null } } as never)
  await DELETE(request({ userId: "primary-agent" }), context)
  expect(prisma.ticketEstimate.deleteMany).toHaveBeenCalledWith({ where: { ticketId: ticket.id, userId: "primary-agent" } })
  expect(prisma.ticket.update).toHaveBeenCalledWith({ where: { id: ticket.id }, data: { estimatedTime: null } })
  expect(personalEstimatesWithCreationFallback([], "primary-agent", null)).toEqual([])
})
it("shows the existing creation estimate for older tickets instead of an empty personal value", () => {
  expect(personalEstimatesWithCreationFallback([], "primary-agent", 5)).toEqual([
    { userId: "primary-agent", estimatedMinutes: 5, targetDateIso: null },
  ])
  const explicit = [{ userId: "primary-agent", estimatedMinutes: 3, targetDateIso: null }]
  expect(personalEstimatesWithCreationFallback(explicit, "primary-agent", 5)).toEqual(explicit)
})
