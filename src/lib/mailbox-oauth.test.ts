import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

import { safeReturnPath, signOAuthState, verifyOAuthState } from "./mailbox-oauth"

const base = {
  provider: "microsoft" as const,
  actorId: "user-1",
  tenantId: "tenant-1",
  departmentId: "dept-1",
  teamId: "team-1",
  scopeType: "DEPARTMENT" as const,
  returnTo: "/mailboxes",
  nonce: "n1",
}

beforeEach(() => {
  process.env.MAILBOX_CREDENTIALS_KEY = Buffer.alloc(32, 7).toString("base64")
})

describe("OAuth state", () => {
  it("round-trips a signed state", () => {
    expect(verifyOAuthState(signOAuthState(base))).toMatchObject(base)
  })

  it("rejects a tampered payload", () => {
    const [payload, sig] = signOAuthState(base).split(".")
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), departmentId: "other" })).toString("base64url")
    expect(verifyOAuthState(`${forged}.${sig}`)).toBeNull()
  })

  it("rejects an expired state", () => {
    vi.useFakeTimers()
    const token = signOAuthState(base)
    vi.advanceTimersByTime(11 * 60_000)
    expect(verifyOAuthState(token)).toBeNull()
    vi.useRealTimers()
  })
})

describe("safeReturnPath", () => {
  it("allows only same-origin paths", () => {
    expect(safeReturnPath("/acme/mailboxes")).toBe("/acme/mailboxes")
    expect(safeReturnPath("//evil.com")).toBe("/")
    expect(safeReturnPath("https://evil.com")).toBe("/")
    expect(safeReturnPath(null)).toBe("/")
  })
})
