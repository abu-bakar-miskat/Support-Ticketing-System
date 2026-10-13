import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { parseRawMime } from "./mime"

const raw = Buffer.from([
  "From: \"Jane Doe\" <jane@example.com>",
  "To: support@acme.com",
  "Cc: Ops <ops@acme.com>",
  "Subject: Printer on fire",
  "Message-ID: <abc123@example.com>",
  "In-Reply-To: <prev@acme.com>",
  "References: <root@acme.com>",
  " <prev@acme.com>",
  "MIME-Version: 1.0",
  "Content-Type: multipart/mixed; boundary=\"b1\"",
  "",
  "--b1",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Help please",
  "--b1",
  "Content-Type: text/plain; name=\"log.txt\"",
  "Content-Disposition: attachment; filename=\"log.txt\"",
  "",
  "error 42",
  "--b1--",
  "",
].join("\r\n"))

describe("parseRawMime", () => {
  it("normalizes headers, addresses, body and attachments", async () => {
    const email = await parseRawMime(raw, "provider-1")
    expect(email.providerMessageId).toBe("provider-1")
    expect(email.messageId).toBe("<abc123@example.com>")
    expect(email.from).toBe("Jane Doe <jane@example.com>")
    expect(email.to).toEqual(["support@acme.com", "ops@acme.com"])
    expect(email.subject).toBe("Printer on fire")
    expect(email.text?.trim()).toBe("Help please")
    expect(email.headers["in-reply-to"]).toBe("<prev@acme.com>")
    // Folded header lines are unfolded into one value.
    expect(email.headers["references"]).toBe("<root@acme.com> <prev@acme.com>")
    expect(email.attachments).toHaveLength(1)
    expect(email.attachments[0]).toMatchObject({ filename: "log.txt", contentType: "text/plain" })
    expect(email.attachments[0].content?.toString()).toBe("error 42")
  })
})
