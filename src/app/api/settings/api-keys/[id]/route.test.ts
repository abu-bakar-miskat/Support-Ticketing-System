import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  isActiveTenantAdmin: vi.fn(),
  apiKeyFindUnique: vi.fn(),
  apiKeyUpdate: vi.fn(),
  apiKeyDelete: vi.fn(),
  intakeCount: vi.fn(),
  formUpdate: vi.fn(),
  formDelete: vi.fn(),
  formFindFirst: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/tenant-admin", () => ({ isActiveTenantAdmin: mocks.isActiveTenantAdmin }))
vi.mock("@/lib/db", () => ({
  prisma: {
    apiKey: {
      findUnique: mocks.apiKeyFindUnique,
      update: mocks.apiKeyUpdate,
      delete: mocks.apiKeyDelete,
    },
    intake: { count: mocks.intakeCount },
    intakeFormConfig: {
      findFirst: mocks.formFindFirst,
      update: mocks.formUpdate,
      delete: mocks.formDelete,
    },
  },
}))

import { DELETE, PATCH } from "./route"

const params = { params: Promise.resolve({ id: "key-1" }) }

describe("portal API key lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({
      profile: {
        id: "00000000-0000-0000-0000-000000000001",
        activeTenantId: "tenant-1",
        departmentAdminIds: [],
      },
      error: null,
    })
    mocks.isActiveTenantAdmin.mockReturnValue(true)
    mocks.apiKeyFindUnique.mockResolvedValue({
      id: "key-1",
      revokedAt: null,
      tenantId: "tenant-1",
      departmentId: null,
      formConfigId: "form-1",
      kind: "portal",
      department: null,
    })
    mocks.apiKeyUpdate.mockResolvedValue({ id: "key-1" })
    mocks.apiKeyDelete.mockResolvedValue({ id: "key-1" })
    mocks.intakeCount.mockResolvedValue(0)
    mocks.formFindFirst.mockResolvedValue({ id: "form-2", isActive: true, apiKey: null })
  })

  it("revokes the key without deactivating its existing support form", async () => {
    const response = await DELETE(
      new NextRequest("https://example.test/api/settings/api-keys/key-1", { method: "DELETE" }),
      params,
    )

    expect(response).toBeDefined()
    expect(response!.status).toBe(200)
    expect(mocks.apiKeyUpdate).toHaveBeenCalledWith({
      where: { id: "key-1" },
      data: { revokedAt: expect.any(Date) },
    })
    expect(mocks.formUpdate).not.toHaveBeenCalled()
  })

  it("deletes an unused key without deleting its existing support form", async () => {
    const response = await DELETE(
      new NextRequest("https://example.test/api/settings/api-keys/key-1?permanent=true", {
        method: "DELETE",
      }),
      params,
    )

    expect(response).toBeDefined()
    expect(response!.status).toBe(200)
    expect(mocks.intakeCount).toHaveBeenCalledWith({ where: { apiKeyId: "key-1" } })
    expect(mocks.apiKeyDelete).toHaveBeenCalledWith({ where: { id: "key-1" } })
    expect(mocks.formDelete).not.toHaveBeenCalled()
  })

  it("changes the linked form while preserving the API key and existing form", async () => {
    const response = await PATCH(new NextRequest("https://example.test/api/settings/api-keys/key-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update-form", departmentId: "department-2", formConfigId: "form-2" }),
    }), params)

    expect(response?.status).toBe(200)
    expect(mocks.formFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "form-2", departmentId: "department-2", department: { tenantId: "tenant-1" } },
    }))
    expect(mocks.apiKeyUpdate).toHaveBeenCalledWith({
      where: { id: "key-1" }, data: { formConfigId: "form-2" },
    })
    expect(mocks.formUpdate).not.toHaveBeenCalled()
    expect(mocks.formDelete).not.toHaveBeenCalled()
  })

  it("rejects a form outside the selected department or tenant", async () => {
    mocks.formFindFirst.mockResolvedValue(null)
    const response = await PATCH(new NextRequest("https://example.test/api/settings/api-keys/key-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update-form", departmentId: "other-department", formConfigId: "other-form" }),
    }), params)

    expect(response?.status).toBe(404)
    expect(mocks.apiKeyUpdate).not.toHaveBeenCalled()
  })

  it("rejects forms connected to another key", async () => {
    mocks.formFindFirst.mockResolvedValue({ id: "form-2", isActive: true, apiKey: { id: "key-2" } })
    const response = await PATCH(new NextRequest("https://example.test/api/settings/api-keys/key-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update-form", departmentId: "department-2", formConfigId: "form-2" }),
    }), params)

    expect(response?.status).toBe(409)
    expect(mocks.apiKeyUpdate).not.toHaveBeenCalled()
  })
})
