import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { randomBytes } from "node:crypto"
import { encryptMailboxCredentials, decryptMailboxCredentials } from "./mailbox-credentials"

const ORIGINAL_KEY = process.env.MAILBOX_CREDENTIALS_KEY

beforeEach(() => {
  process.env.MAILBOX_CREDENTIALS_KEY = randomBytes(32).toString("base64")
})

afterEach(() => {
  process.env.MAILBOX_CREDENTIALS_KEY = ORIGINAL_KEY
})

describe("encryptMailboxCredentials / decryptMailboxCredentials", () => {
  it("round-trips arbitrary plaintext", () => {
    const secret = JSON.stringify({ refreshToken: "abc123", tenant: "contoso" })
    const encrypted = encryptMailboxCredentials(secret)
    expect(decryptMailboxCredentials(encrypted)).toBe(secret)
  })

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptMailboxCredentials("same-secret")
    const b = encryptMailboxCredentials("same-secret")
    expect(a).not.toBe(b)
  })

  it("never contains the plaintext as a substring", () => {
    const secret = "super-secret-imap-password"
    expect(encryptMailboxCredentials(secret)).not.toContain(secret)
  })

  it("throws on a tampered ciphertext (auth tag mismatch)", () => {
    const encrypted = encryptMailboxCredentials("tamper-me")
    const bytes = Buffer.from(encrypted, "base64")
    bytes[bytes.length - 1] ^= 0xff
    expect(() => decryptMailboxCredentials(bytes.toString("base64"))).toThrow()
  })

  it("throws when decrypting with the wrong key", () => {
    const encrypted = encryptMailboxCredentials("secret")
    process.env.MAILBOX_CREDENTIALS_KEY = randomBytes(32).toString("base64")
    expect(() => decryptMailboxCredentials(encrypted)).toThrow()
  })

  it("throws when the key env var is missing", () => {
    delete process.env.MAILBOX_CREDENTIALS_KEY
    expect(() => encryptMailboxCredentials("x")).toThrow(/MAILBOX_CREDENTIALS_KEY/)
  })

  it("throws when the key does not decode to 32 bytes", () => {
    process.env.MAILBOX_CREDENTIALS_KEY = Buffer.from("too-short").toString("base64")
    expect(() => encryptMailboxCredentials("x")).toThrow(/32 bytes/)
  })
})
