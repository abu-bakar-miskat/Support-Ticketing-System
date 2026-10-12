import { beforeEach, describe, expect, it, vi } from "vitest"

const findMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/db", () => ({ prisma: {
  ticket: { findMany },
  timeEntry: { groupBy: vi.fn().mockResolvedValue([]) },
  subDepartmentStatus: { findMany: vi.fn().mockResolvedValue([]) },
} }))

import { getBoardCards, toBoardCard } from "./board-data"
import { formatTaskTimeDisplay } from "@/components/board/board-types"

const createdAt = new Date("2026-10-12T13:14:00Z")
const ticket = {
  id: "mailbox-ticket", title: "Complete a mailbox ticket", ticketNumber: 46,
  priority: "Medium", status: "Open", labels: [], createdAt,
  estimatedTime: null, dueDate: null, startDate: null,
  subDepartment: { id: "team", prefix: "WEB", name: "Web" },
  creator: { id: "system", name: "System", avatarUrl: null },
  assignees: [], estimates: [], subTickets: [], comments: [], intake: null,
  _count: { comments: 0, attachments: 0, messages: 1 },
  messages: [], slaTimer: { source: "mailbox", resolutionTargetMins: 120 },
} as unknown as Parameters<typeof toBoardCard>[0]

beforeEach(() => vi.clearAllMocks())

describe("mailbox task list data", () => {
  it("shows the SLA target before any conversation or time logging", () => {
    const card = toBoardCard(ticket)
    expect(card.lastMessageDirection).toBeNull()
    expect(card.estimatedTime).toBeNull()
    expect(formatTaskTimeDisplay(card.userLoggedSecs, card.slaResolutionTargetMins ?? card.estimatedTime)).toBe("— / 2h")
  })

  it("keeps manual estimates and non-mailbox SLA targets separate", () => {
    const card = toBoardCard({ ...ticket, estimatedTime: 30, slaTimer: { source: "form", resolutionTargetMins: 120 } })
    expect(card.slaResolutionTargetMins).toBeNull()
    expect(formatTaskTimeDisplay(card.userLoggedSecs, card.slaResolutionTargetMins ?? card.estimatedTime)).toBe("— / 30m")
  })

  it("filters receipts and quarantined messages before selecting the latest reply", async () => {
    findMany.mockImplementation(async (args) => {
      const query = args?.select?.messages as {
        where?: { status?: string }; take?: number; select?: { status?: boolean }
      }
      expect(query.where).toEqual({ status: "trusted" })
      expect(query.take).toBe(1)
      expect(query.select?.status).toBe(true)
      const messages = [
        { direction: "inbound", status: "system", createdAt: new Date("2026-10-12T13:17:00Z") },
        { direction: "inbound", status: "quarantined", createdAt: new Date("2026-10-12T13:16:00Z") },
        { direction: "outbound", status: "trusted", createdAt: new Date("2026-10-12T13:15:00Z") },
      ].filter((m) => m.status === query.where?.status).slice(0, query.take)
      return [{ ...ticket, messages }] as never
    })
    const [card] = await getBoardCards()
    expect(card.lastMessageDirection).toBe("outbound")
  })
})
