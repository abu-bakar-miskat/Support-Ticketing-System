import { beforeEach, describe, expect, it, vi } from "vitest"

const { requireAdmin, sendLoginCode } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  sendLoginCode: vi.fn(),
}))

vi.mock("../../_guard", () => ({ requireAdmin }))
vi.mock("@/lib/auth/send-login-code", () => ({ sendLoginCode }))

import { POST } from "./route"

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/admin/users/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdmin.mockResolvedValue({ profile: { id: "admin-1" } })
    sendLoginCode.mockResolvedValue({
      error: null,
      verificationType: "magiclink",
    })
  })

  it("sends a numeric login code through the code-only email flow", async () => {
    const response = await POST(makeRequest({ email: " New.User@Example.com " }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(sendLoginCode).toHaveBeenCalledOnce()
    expect(sendLoginCode).toHaveBeenCalledWith("new.user@example.com")
  })

  it("rejects invalid email addresses without sending", async () => {
    const response = await POST(makeRequest({ email: "not-an-email" }))

    expect(response.status).toBe(400)
    expect(sendLoginCode).not.toHaveBeenCalled()
  })

  it("returns an error when the code email cannot be sent", async () => {
    sendLoginCode.mockResolvedValue({ error: "Email provider rejected the message" })

    const response = await POST(makeRequest({ email: "user@example.com" }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: "Email provider rejected the message",
    })
  })
})
