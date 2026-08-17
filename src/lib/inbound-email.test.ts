import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  sanitizeInboundHtml,
  stripQuotedHistory,
  stripInlineImagePlaceholders,
  isAutoReply,
  pickBody,
  parseFromAddress,
  extractReferencedIds,
} from "./inbound-email"

// ── sanitizeInboundHtml ───────────────────────────────────────────────────────

describe("sanitizeInboundHtml", () => {
  it("removes <script> blocks and their contents", () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>'
    expect(sanitizeInboundHtml(html)).not.toContain("<script")
    expect(sanitizeInboundHtml(html)).not.toContain("alert")
    expect(sanitizeInboundHtml(html)).toContain("Hello")
    expect(sanitizeInboundHtml(html)).toContain("World")
  })

  it("removes <style> blocks and their contents", () => {
    const html = "<style>body { display:none }</style><p>Text</p>"
    expect(sanitizeInboundHtml(html)).not.toContain("<style")
    expect(sanitizeInboundHtml(html)).not.toContain("display")
    expect(sanitizeInboundHtml(html)).toContain("Text")
  })

  it("removes inline event handler attributes", () => {
    const html = '<a href="#" onclick="stealCookies()">Click</a>'
    expect(sanitizeInboundHtml(html)).not.toContain("onclick")
    expect(sanitizeInboundHtml(html)).not.toContain("stealCookies")
    expect(sanitizeInboundHtml(html)).toContain("Click")
  })

  it("removes onload and other on* attributes", () => {
    const html = '<img src="x" onerror="alert(1)" />'
    expect(sanitizeInboundHtml(html)).not.toContain("onerror")
    expect(sanitizeInboundHtml(html)).not.toContain("alert")
  })

  it("removes all <img> tags (remote images stripped)", () => {
    const html = '<p>See:</p><img src="https://evil.com/pixel.png" /><p>Done</p>'
    expect(sanitizeInboundHtml(html)).not.toContain("<img")
    expect(sanitizeInboundHtml(html)).toContain("See:")
    expect(sanitizeInboundHtml(html)).toContain("Done")
  })

  it("neutralises javascript: hrefs", () => {
    const html = '<a href="javascript:void(0)">Link</a>'
    expect(sanitizeInboundHtml(html)).not.toContain("javascript:")
    expect(sanitizeInboundHtml(html)).toContain("Link")
  })

  it("leaves safe content untouched", () => {
    const html = "<p><strong>Hello</strong> <em>world</em></p>"
    expect(sanitizeInboundHtml(html)).toBe(html)
  })
})

// ── stripQuotedHistory ────────────────────────────────────────────────────────

describe("stripQuotedHistory", () => {
  it("returns the full text when there is no quote boundary", () => {
    const { visible, quoted } = stripQuotedHistory("Hello there!")
    expect(visible).toBe("Hello there!")
    expect(quoted).toBeNull()
  })

  it("splits on 'On … wrote:' (Gmail / Apple Mail)", () => {
    const text = "Got it, thanks!\n\nOn Mon, 7 Jul 2026 at 09:00, Support <support@pen.com> wrote:\n> Original message here"
    const { visible, quoted } = stripQuotedHistory(text)
    expect(visible).toBe("Got it, thanks!")
    expect(quoted).toContain("wrote:")
  })

  it("splits on '-----Original Message-----'", () => {
    const text = "My reply\n\n-----Original Message-----\nFrom: support@pen.com"
    const { visible, quoted } = stripQuotedHistory(text)
    expect(visible).toBe("My reply")
    expect(quoted).toContain("Original Message")
  })

  it("splits on '-- ' signature delimiter", () => {
    const text = "Reply text\n-- \nJane Customer\njane@example.com"
    const { visible, quoted } = stripQuotedHistory(text)
    expect(visible).toBe("Reply text")
    expect(quoted).toContain("Jane Customer")
  })

  it("strips leading '>'-quoted lines as fallback", () => {
    const text = "New content\n> Old content line 1\n> Old content line 2"
    const { visible, quoted } = stripQuotedHistory(text)
    expect(visible).toBe("New content")
    expect(quoted).toContain("> Old content")
  })

  it("preserves the quoted text for raw payload", () => {
    const text = "Reply\n\n-----Original Message-----\nSome old text"
    const { quoted } = stripQuotedHistory(text)
    expect(quoted).toContain("Some old text")
  })
})

// ── isAutoReply ───────────────────────────────────────────────────────────────

describe("isAutoReply", () => {
  it("returns true for Auto-Submitted: auto-replied", () => {
    expect(isAutoReply({ "Auto-Submitted": "auto-replied" })).toBe(true)
  })

  it("returns true for Auto-Submitted: auto-generated", () => {
    expect(isAutoReply({ "Auto-Submitted": "auto-generated" })).toBe(true)
  })

  it("returns false for Auto-Submitted: no", () => {
    expect(isAutoReply({ "Auto-Submitted": "no" })).toBe(false)
  })

  it("returns true for X-Autoreply: yes", () => {
    expect(isAutoReply({ "X-Autoreply": "yes" })).toBe(true)
  })

  it("returns true for X-Autorespond header", () => {
    expect(isAutoReply({ "X-Autorespond": "OOF" })).toBe(true)
  })

  it("returns true for Precedence: bulk", () => {
    expect(isAutoReply({ Precedence: "bulk" })).toBe(true)
  })

  it("returns false for a normal human reply (no auto headers)", () => {
    expect(isAutoReply({ "Content-Type": "text/plain", From: "jane@example.com" })).toBe(false)
  })

  it("is case-insensitive on header names and values", () => {
    expect(isAutoReply({ "auto-submitted": "AUTO-REPLIED" })).toBe(true)
  })
})

// ── pickBody ─────────────────────────────────────────────────────────────────

describe("pickBody", () => {
  it("prefers text/plain over HTML", () => {
    const { bodyHtml } = pickBody("Plain text", "<p>HTML</p>")
    expect(bodyHtml).toContain("Plain text")
    expect(bodyHtml).not.toContain("<p>HTML</p>")
  })

  it("converts newlines to <br /> in plain text", () => {
    const { bodyHtml } = pickBody("Line one\nLine two", null)
    expect(bodyHtml).toContain("<br />")
  })

  it("falls back to sanitized HTML when plain text is absent", () => {
    const { bodyHtml } = pickBody(null, '<p>Hello</p><script>bad()</script>')
    expect(bodyHtml).toContain("Hello")
    expect(bodyHtml).not.toContain("<script")
  })

  it("strips quotes from plain text and puts them in quoted", () => {
    const text = "My reply\n\n-----Original Message-----\nOld content"
    const { bodyHtml, quoted } = pickBody(text, null)
    expect(bodyHtml).toContain("My reply")
    expect(quoted).toContain("Old content")
  })

  it("returns empty bodyHtml when both parts are absent", () => {
    const { bodyHtml, quoted } = pickBody(null, null)
    expect(bodyHtml).toBe("")
    expect(quoted).toBeNull()
  })

  it("strips inline-image placeholders left in the plain-text part", () => {
    const { bodyHtml } = pickBody("I am just testing the reply.[86766363.png]", null)
    expect(bodyHtml).toBe("I am just testing the reply.")
  })
})

// ── stripInlineImagePlaceholders ──────────────────────────────────────────────

describe("stripInlineImagePlaceholders", () => {
  it("removes Gmail [image: …] placeholders", () => {
    expect(stripInlineImagePlaceholders("Hello [image: Screenshot] world")).toBe("Hello world")
  })

  it("removes bracketed image-filename placeholders", () => {
    expect(stripInlineImagePlaceholders("See this [86766363.png]")).toBe("See this")
    expect(stripInlineImagePlaceholders("[photo.JPEG] done")).toBe("done")
  })

  it("leaves non-image bracketed text untouched", () => {
    expect(stripInlineImagePlaceholders("Order [12345] shipped")).toBe("Order [12345] shipped")
  })
})

// ── parseFromAddress ─────────────────────────────────────────────────────────

describe("parseFromAddress", () => {
  it("parses display-name + angle-bracket form", () => {
    const { name, email } = parseFromAddress('"Jane Customer" <jane@example.com>')
    expect(name).toBe("Jane Customer")
    expect(email).toBe("jane@example.com")
  })

  it("parses display name without quotes", () => {
    const { name, email } = parseFromAddress("Jane Customer <jane@example.com>")
    expect(name).toBe("Jane Customer")
    expect(email).toBe("jane@example.com")
  })

  it("parses a bare email address", () => {
    const { name, email } = parseFromAddress("jane@example.com")
    expect(email).toBe("jane@example.com")
    expect(name).toBe("jane@example.com")
  })

  it("normalises email to lowercase", () => {
    const { email } = parseFromAddress("Jane <JANE@EXAMPLE.COM>")
    expect(email).toBe("jane@example.com")
  })
})

// ── extractReferencedIds ──────────────────────────────────────────────────────

describe("extractReferencedIds", () => {
  it("extracts the id from an In-Reply-To header", () => {
    const ids = extractReferencedIds("<abc123@resend.dev>", null)
    expect(ids).toContain("abc123@resend.dev")
  })

  it("extracts multiple ids from a References header", () => {
    const ids = extractReferencedIds(null, "<id1@resend.dev> <id2@resend.dev>")
    expect(ids).toContain("id1@resend.dev")
    expect(ids).toContain("id2@resend.dev")
  })

  it("deduplicates ids that appear in both headers", () => {
    const ids = extractReferencedIds("<id1@x.com>", "<id1@x.com> <id2@x.com>")
    expect(ids.filter((id) => id === "id1@x.com")).toHaveLength(1)
    expect(ids).toContain("id2@x.com")
  })

  it("returns an empty array when both headers are null", () => {
    expect(extractReferencedIds(null, null)).toEqual([])
  })
})
