import { describe, expect, it, vi } from "vitest"
import { createRecoveryHandler } from "./db"

function connectionError() {
  const err = new Error("Connection terminated unexpectedly")
  ;(err as Error & { code: string }).code = "CONNECTION_CLOSED"
  return err
}

function maxConnError() {
  return new Error("Max client connections reached")
}

describe("createRecoveryHandler", () => {
  it("passes through successful queries untouched", async () => {
    const handler = createRecoveryHandler(vi.fn(), vi.fn())
    const query = vi.fn().mockResolvedValue({ id: "p1" })

    const result = await handler({
      model: "Profile",
      operation: "findUnique",
      args: { where: { id: "p1" } },
      query,
    })

    expect(result).toEqual({ id: "p1" })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it("retries the same query after backoff on max-connections errors", async () => {
    const handler = createRecoveryHandler(vi.fn(), vi.fn())
    const query = vi
      .fn()
      .mockRejectedValueOnce(maxConnError())
      .mockResolvedValueOnce([{ id: "t1" }])

    const result = await handler({
      model: "TeamMembership",
      operation: "findMany",
      args: {},
      query,
    })

    expect(result).toEqual([{ id: "t1" }])
    expect(query).toHaveBeenCalledTimes(2)
  })

  it("recreates the pool and re-dispatches reads on a fresh client after a connection error", async () => {
    const recreate = vi.fn().mockResolvedValue(undefined)
    const freshQuery = vi.fn().mockResolvedValue({ id: "p1" })
    const getFreshDelegateMethod = vi.fn().mockReturnValue(freshQuery)
    const handler = createRecoveryHandler(recreate, getFreshDelegateMethod)
    const query = vi.fn().mockRejectedValue(connectionError())

    const args = { where: { id: "p1" } }
    const result = await handler({ model: "Profile", operation: "findUnique", args, query })

    expect(result).toEqual({ id: "p1" })
    expect(recreate).toHaveBeenCalledTimes(1)
    expect(getFreshDelegateMethod).toHaveBeenCalledWith("Profile", "findUnique")
    expect(freshQuery).toHaveBeenCalledWith(args)
  })

  it("recreates the pool but rethrows for write operations", async () => {
    const recreate = vi.fn().mockResolvedValue(undefined)
    const getFreshDelegateMethod = vi.fn()
    const handler = createRecoveryHandler(recreate, getFreshDelegateMethod)
    const query = vi.fn().mockRejectedValue(connectionError())

    await expect(
      handler({ model: "Ticket", operation: "update", args: {}, query }),
    ).rejects.toThrow("Connection terminated unexpectedly")

    expect(recreate).toHaveBeenCalledTimes(1)
    expect(getFreshDelegateMethod).not.toHaveBeenCalled()
  })

  it("replays writes after a pool-checkout timeout (fails before the statement runs)", async () => {
    const handler = createRecoveryHandler(vi.fn(), vi.fn())
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"))
      .mockResolvedValueOnce({ id: "t1" })

    const result = await handler({ model: "Ticket", operation: "update", args: {}, query })

    expect(result).toEqual({ id: "t1" })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it("treats server-initiated disconnects (57P01) as connection errors", async () => {
    const recreate = vi.fn().mockResolvedValue(undefined)
    const freshQuery = vi.fn().mockResolvedValue({ id: "p1" })
    const handler = createRecoveryHandler(recreate, vi.fn().mockReturnValue(freshQuery))
    const err = new Error("terminating connection due to administrator command")
    ;(err as Error & { code: string }).code = "57P01"
    const query = vi.fn().mockRejectedValue(err)

    const result = await handler({ model: "Profile", operation: "findUnique", args: {}, query })

    expect(result).toEqual({ id: "p1" })
    expect(recreate).toHaveBeenCalledTimes(1)
  })

  it("treats a dead pg client marker as a connection error", async () => {
    const recreate = vi.fn().mockResolvedValue(undefined)
    const freshQuery = vi.fn().mockResolvedValue([])
    const handler = createRecoveryHandler(recreate, vi.fn().mockReturnValue(freshQuery))
    const query = vi
      .fn()
      .mockRejectedValue(new Error("Client has encountered a connection error and is not queryable"))

    const result = await handler({ model: "TeamMembership", operation: "findMany", args: {}, query })

    expect(result).toEqual([])
    expect(recreate).toHaveBeenCalledTimes(1)
  })

  it("rethrows non-connection errors without recovery", async () => {
    const recreate = vi.fn()
    const handler = createRecoveryHandler(recreate, vi.fn())
    const query = vi.fn().mockRejectedValue(new Error("Unique constraint failed"))

    await expect(
      handler({ model: "Profile", operation: "findUnique", args: {}, query }),
    ).rejects.toThrow("Unique constraint failed")

    expect(recreate).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(1)
  })
})
