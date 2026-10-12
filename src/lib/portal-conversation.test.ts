import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

import { latestConversationDirection, portalCommentsAsConversation } from "./portal-conversation"

const intake = { submitterName: "Rina", apiKey: { createdById: "owner-1" } }
const requester = (at: string) => ({
  body: "[Portal — Rina]\nStill broken",
  authorId: "owner-1",
  createdAt: new Date(at),
})
const staff = (at: string) => ({ body: "Looking now", authorId: "agent-1", createdAt: new Date(at) })

describe("portalCommentsAsConversation", () => {
  it("maps requester comments to inbound and staff replies to outbound", () => {
    const conv = portalCommentsAsConversation(
      [requester("2026-10-08T09:00:00Z"), staff("2026-10-08T10:00:00Z")],
      intake,
    )
    expect(conv.map((m) => m.direction)).toEqual(["inbound", "outbound"])
  })

  it("treats a look-alike marker from another author as a staff reply", () => {
    const [m] = portalCommentsAsConversation(
      [{ ...requester("2026-10-08T09:00:00Z"), authorId: "agent-1" }],
      intake,
    )
    expect(m?.direction).toBe("outbound")
  })

  it("returns nothing for non-portal tickets", () => {
    expect(portalCommentsAsConversation([staff("2026-10-08T10:00:00Z")], null)).toEqual([])
    expect(
      portalCommentsAsConversation([staff("2026-10-08T10:00:00Z")], { submitterName: "Rina", apiKey: null }),
    ).toEqual([])
  })
})

describe("latestConversationDirection", () => {
  it("is null with no conversation", () => {
    expect(latestConversationDirection([], [])).toBeNull()
  })

  it("picks the latest across email messages and portal comments", () => {
    const portal = portalCommentsAsConversation([requester("2026-10-08T11:00:00Z")], intake)
    const email = [{ direction: "outbound", createdAt: new Date("2026-10-08T10:00:00Z") }]
    expect(latestConversationDirection(email, portal)).toBe("inbound")
  })

  it("ignores system messages", () => {
    const messages = [
      { direction: "inbound", status: "trusted", createdAt: new Date("2026-10-08T09:00:00Z") },
      { direction: "outbound", status: "system", createdAt: new Date("2026-10-08T10:00:00Z") },
    ]
    expect(latestConversationDirection(messages)).toBe("inbound")
  })
})


it("quarantined emails cannot change the customer-wait label", () => {
  expect(latestConversationDirection([
    { direction: "outbound", status: "trusted", createdAt: new Date("2026-10-12T09:00:00Z") },
    { direction: "inbound", status: "quarantined", createdAt: new Date("2026-10-12T10:00:00Z") },
  ])).toBe("outbound")
})
