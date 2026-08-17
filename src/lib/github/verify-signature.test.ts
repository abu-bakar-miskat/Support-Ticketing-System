import { describe, it, expect } from "vitest"
import { createHmac } from "node:crypto"
import { verifyGitHubSignature } from "./verify-signature"

const SECRET = "test-secret"

function sign(body: string, secret = SECRET) {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex")
}

describe("verifyGitHubSignature", () => {
  it("accepts a valid signature", () => {
    const body = JSON.stringify({ hello: "world" })
    expect(verifyGitHubSignature(body, sign(body), SECRET)).toBe(true)
  })

  it("rejects a signature computed with a different secret", () => {
    const body = "{}"
    expect(verifyGitHubSignature(body, sign(body, "wrong"), SECRET)).toBe(false)
  })

  it("rejects a signature for a different body", () => {
    expect(verifyGitHubSignature("{\"a\":2}", sign("{\"a\":1}"), SECRET)).toBe(false)
  })

  it("rejects a missing header", () => {
    expect(verifyGitHubSignature("{}", null, SECRET)).toBe(false)
  })

  it("rejects a header without the sha256= prefix", () => {
    const digest = createHmac("sha256", SECRET).update("{}").digest("hex")
    expect(verifyGitHubSignature("{}", digest, SECRET)).toBe(false)
  })

  it("rejects malformed hex without throwing", () => {
    expect(verifyGitHubSignature("{}", "sha256=nothex!!", SECRET)).toBe(false)
  })
})
