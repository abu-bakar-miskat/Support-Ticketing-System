import { describe, expect, it } from "vitest"
import { mailboxConnectionIdsForMessage } from "./mailbox-mail"

const connections = [
  { id: "mailbox-1", address: "support@example.com" },
  { id: "mailbox-2", address: "billing@example.com" },
]

describe("mailboxConnectionIdsForMessage", () => {
  it("uses the resolved mailbox connection for new inbound records", () => {
    expect(mailboxConnectionIdsForMessage({
      mailboxConnectionId: "mailbox-1",
      to: ["forwarded@inbound.example"],
    }, connections)).toEqual(["mailbox-1"])
  })

  it("matches webhook envelope recipients when the fetched recipient was rewritten", () => {
    expect(mailboxConnectionIdsForMessage({
      envelopeTo: ["Support <SUPPORT@example.com>"],
      to: ["forwarded@inbound.example"],
    }, connections)).toEqual(["mailbox-1"])
  })

  it("keeps legacy direct-mail records visible by their saved recipient", () => {
    expect(mailboxConnectionIdsForMessage({
      to: ["Billing Team <billing@example.com>"],
    }, connections)).toEqual(["mailbox-2"])
  })

  it("excludes normal ticket replies addressed to a reply token", () => {
    expect(mailboxConnectionIdsForMessage({
      mailboxConnectionId: null,
      to: ["reply-token@reply.example.com"],
    }, connections)).toEqual([])
  })

  it("does not classify a known ticket reply as mailbox mail from its recipient fallback", () => {
    expect(mailboxConnectionIdsForMessage({
      mailboxConnectionId: null,
      envelopeTo: ["support@example.com"],
    }, connections)).toEqual([])
  })
})
