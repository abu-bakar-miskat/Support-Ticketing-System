import { describe, expect, it } from "vitest"
import { findMailboxOriginMessageId } from "./mailbox-origin-message"

const created = new Date("2026-10-09T10:00:00.000Z")
const at = (ms: number) => new Date(created.getTime() + ms)

describe("findMailboxOriginMessageId", () => {
  it("returns the inbound email stored with the ticket", () => {
    expect(findMailboxOriginMessageId({ createdAt: created, hasIntake: false }, [
      { id: "reply", direction: "outbound", createdAt: at(600_000) },
      { id: "origin", direction: "inbound", createdAt: at(40) },
    ])).toBe("origin")
  })

  it("ignores form tickets", () => {
    expect(findMailboxOriginMessageId({ createdAt: created, hasIntake: true }, [
      { id: "m", direction: "inbound", createdAt: at(40) },
    ])).toBeNull()
  })

  it("does not hide a later customer reply on a ticket whose first email was never stored", () => {
    expect(findMailboxOriginMessageId({ createdAt: created, hasIntake: false }, [
      { id: "late", direction: "inbound", createdAt: at(3_600_000) },
    ])).toBeNull()
  })

  it("does not hide an agent message", () => {
    expect(findMailboxOriginMessageId({ createdAt: created, hasIntake: false }, [
      { id: "agent", direction: "outbound", createdAt: at(10) },
    ])).toBeNull()
  })
})
