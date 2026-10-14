import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  isActiveTenantAdmin: vi.fn(),
  generateApiKey: vi.fn(),
  featureEnabled: vi.fn(),
  departmentFindFirst: vi.fn(),
  formFindFirst: vi.fn(),
  apiKeyCreate: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/tenant-admin", () => ({ isActiveTenantAdmin: mocks.isActiveTenantAdmin }))
vi.mock("@/lib/api-key-auth", () => ({ generateApiKey: mocks.generateApiKey }))
vi.mock("@/lib/template-catalogue", () => ({ assertTemplateFeatureEnabled: mocks.featureEnabled }))
vi.mock("@/lib/db", () => ({
  prisma: {
    department: { findFirst: mocks.departmentFindFirst },
    intakeFormConfig: { findFirst: mocks.formFindFirst },
    apiKey: { create: mocks.apiKeyCreate },
  },
}))

import { POST } from "./route"

const profile = {
  id: "00000000-0000-0000-0000-000000000001",
  activeTenantId: "tenant-1",
  departmentAdminIds: [],
}

function request(body: Record<string, unknown>) {
  return new NextRequest("https://example.test/api/settings/api-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/settings/api-keys portal key", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ profile, error: null })
    mocks.isActiveTenantAdmin.mockReturnValue(true)
    mocks.generateApiKey.mockReturnValue({
      raw: "pen_abcdefghijklmnopqrstuvwxyz123456",
      hashed: "hashed-key",
      suffix: "3456",
    })
    mocks.departmentFindFirst.mockResolvedValue({ id: "department-1" })
    mocks.formFindFirst.mockResolvedValue({
      id: "form-1",
      isActive: true,
      apiKey: null,
    })
    mocks.apiKeyCreate.mockResolvedValue({
      id: "key-1",
      name: "Customer portal",
      formConfigId: "form-1",
    })
  })

  it("requires a department and an existing support form", async () => {
    const response = await POST(request({ name: "Customer portal", purpose: "portal" }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Department and support form are required",
    })
    expect(mocks.apiKeyCreate).not.toHaveBeenCalled()
  })

  it("links the selected form without creating a new form", async () => {
    const response = await POST(request({
      name: "Customer portal",
      purpose: "portal",
      departmentId: "department-1",
      formConfigId: "form-1",
    }))

    expect(response.status).toBe(201)
    expect(mocks.formFindFirst).toHaveBeenCalledWith({
      where: {
        id: "form-1",
        departmentId: "department-1",
        department: { tenantId: "tenant-1" },
      },
      select: { id: true, isActive: true, apiKey: { select: { id: true } } },
    })
    expect(mocks.apiKeyCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        departmentId: null,
        formConfigId: "form-1",
        kind: "portal",
        tenantId: "tenant-1",
      }),
    }))
  })

  it("rejects a form that already has a connection", async () => {
    mocks.formFindFirst.mockResolvedValue({
      id: "form-1",
      isActive: true,
      apiKey: { id: "existing-key" },
    })

    const response = await POST(request({
      name: "Customer portal",
      purpose: "portal",
      departmentId: "department-1",
      formConfigId: "form-1",
    }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: "This support form is already connected to an API key",
    })
    expect(mocks.apiKeyCreate).not.toHaveBeenCalled()
  })
})
