import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

import { withTenantGuc, runWithTenantGuc } from "./rls-guc"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("withTenantGuc — D-02/C-01", () => {
  it("sets app.tenant_id and app.is_platform_admin via set_config", async () => {
    const executeRaw = vi.fn().mockResolvedValue(0)
    const tx = { $executeRaw: executeRaw } as never

    await withTenantGuc(tx, { tenantId: "t1", isPlatformAdmin: false })

    expect(executeRaw).toHaveBeenCalledTimes(2)
  })

  it("passes an empty string when tenantId is null (platform-admin, no active tenant)", async () => {
    const calls: unknown[][] = []
    const executeRaw = vi.fn((..._args: unknown[]) => {
      calls.push(_args)
      return Promise.resolve(0)
    })
    const tx = { $executeRaw: executeRaw } as never

    await withTenantGuc(tx, { tenantId: null, isPlatformAdmin: true })

    expect(executeRaw).toHaveBeenCalledTimes(2)
  })
})

describe("runWithTenantGuc", () => {
  it("sets the GUCs inside the same transaction that runs fn", async () => {
    const executeRaw = vi.fn().mockResolvedValue(0)
    const tx = { $executeRaw: executeRaw }
    const prisma = {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    }

    const fn = vi.fn().mockResolvedValue("result")
    const result = await runWithTenantGuc(prisma, { tenantId: "t1", isPlatformAdmin: false }, fn as never)

    expect(result).toBe("result")
    expect(executeRaw).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith(tx)
  })
})
