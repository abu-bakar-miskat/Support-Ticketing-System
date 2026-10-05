import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/api-key-auth", () => ({ requireApiKey: vi.fn() }))
vi.mock("@/lib/public-rate-limit", () => ({
  clientIp: vi.fn(() => "127.0.0.1"),
  publicRateLimited: vi.fn(() => false),
}))

import { requireApiKey } from "@/lib/api-key-auth"
import { publicRateLimited } from "@/lib/public-rate-limit"
import { enforcePortalRateLimit, readPortalJson, requirePortalApiKey } from "./portal-api"

const mockRequire = vi.mocked(requireApiKey)
const mockLimited = vi.mocked(publicRateLimited)
const tenantKey = {
  keyId: "key-1",
  tenantId: "tenant-1",
  departmentId: null,
  formConfigId: "form-1",
  scope: "read_write",
  kind: "portal",
  createdById: "user-1",
  creatorName: "Admin",
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequire.mockResolvedValue({ ctx: tenantKey, error: null })
  mockLimited.mockReturnValue(false)
})

describe("tenant portal API guard", () => {
  it("accepts tenant-bound portal keys", async () => {
    const result = await requirePortalApiKey(new NextRequest("https://example.test/api"), { write: true })
    expect(result.error).toBeNull()
    expect(result.ctx?.tenantId).toBe("tenant-1")
  })

  it("rejects department-scoped keys", async () => {
    mockRequire.mockResolvedValue({
      ctx: { ...tenantKey, departmentId: "dept-1" },
      error: null,
    })
    const result = await requirePortalApiKey(new NextRequest("https://example.test/api"))
    expect(result.ctx).toBeNull()
    expect(result.error?.status).toBe(403)
  })

  it("rejects read-only keys for mutations", async () => {
    mockRequire.mockResolvedValue({ ctx: { ...tenantKey, scope: "read" }, error: null })
    const result = await requirePortalApiKey(new NextRequest("https://example.test/api"), { write: true })
    expect(result.ctx).toBeNull()
    expect(result.error?.status).toBe(403)
  })

  it("rate limits by API key and client IP", () => {
    mockLimited.mockReturnValue(true)
    const response = enforcePortalRateLimit(new NextRequest("https://example.test/api"), "key-1")
    expect(mockLimited).toHaveBeenCalledWith("portal:key-1:127.0.0.1", 60, 60_000)
    expect(response?.status).toBe(429)
    expect(response?.headers.get("retry-after")).toBe("60")
  })

  it("rejects non-JSON and oversized bodies before parsing", async () => {
    const nonJson = new NextRequest("https://example.test/api", {
      method: "POST",
      body: "hello",
      headers: { "content-type": "text/plain" },
    })
    expect((await readPortalJson(nonJson)).error?.status).toBe(415)

    const oversized = new NextRequest("https://example.test/api", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json", "content-length": "1000001" },
    })
    expect((await readPortalJson(oversized)).error?.status).toBe(413)
  })
})
