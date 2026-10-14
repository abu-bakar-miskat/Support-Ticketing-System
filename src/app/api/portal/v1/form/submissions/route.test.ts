import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api-key-auth", () => ({ runWithApiKeyScope: vi.fn() }))
vi.mock("@/lib/department-setup", () => ({ assertDepartmentOperational: vi.fn() }))
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/form-validation", () => ({
  toFormFieldDef: vi.fn(),
  validateSubmission: vi.fn(),
}))
vi.mock("@/lib/intake-finalize", () => ({ createTicketFromPayload: vi.fn() }))
vi.mock("@/lib/portal-api", () => ({
  cleanString: vi.fn((value: unknown, max: number) =>
    typeof value === "string" ? value.trim().slice(0, max) : "",
  ),
  enforcePortalRateLimit: vi.fn(() => null),
  portalJson: vi.fn((body: unknown, init?: ResponseInit) => Response.json(body, init)),
  readPortalJson: vi.fn(async () => ({ data: {}, error: null })),
  requirePortalApiKey: vi.fn(async () => ({
    ctx: {
      keyId: "key-1",
      tenantId: "tenant-1",
      formConfigId: "form-1",
      createdById: "owner-1",
    },
    error: null,
  })),
}))

import { POST } from "./route"

describe("POST /api/portal/v1/form/submissions", () => {
  beforeEach(() => vi.clearAllMocks())

  it("requires an Idempotency-Key before attempting ticket creation", async () => {
    const response = await POST(new NextRequest("https://example.test/api/portal/v1/form/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Idempotency-Key header is required" })
  })
})
