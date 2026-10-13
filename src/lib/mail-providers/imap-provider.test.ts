import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("imapflow", () => ({ ImapFlow: vi.fn() }))

import { parseImapCredentials } from "./imap-provider"

describe("parseImapCredentials", () => {
  it("accepts the JSON the connect form posts", () => {
    expect(parseImapCredentials(JSON.stringify({ host: "imap.acme.com", port: 993, secure: true, username: "u", password: "p" })))
      .toEqual({ kind: "imap", host: "imap.acme.com", port: 993, secure: true, username: "u", password: "p" })
  })

  it("defaults the port to 993 with TLS", () => {
    expect(parseImapCredentials({ host: "imap.acme.com", username: "u", password: "p" }))
      .toMatchObject({ port: 993, secure: true })
  })

  it("rejects missing or malformed settings", () => {
    expect(parseImapCredentials("not json")).toEqual({ error: "IMAP settings are required" })
    expect(parseImapCredentials({ host: "bad host!", username: "u", password: "p" })).toHaveProperty("error")
    expect(parseImapCredentials({ host: "imap.acme.com", port: 70000, username: "u", password: "p" })).toHaveProperty("error")
    expect(parseImapCredentials({ host: "imap.acme.com", username: "u" })).toHaveProperty("error")
  })
})
