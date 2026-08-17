import { describe, it, expect, vi, beforeEach } from "vitest"

function checkRunsResponse(runs: Array<{ status: string; conclusion: string | null }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ check_runs: runs }),
  } as Response
}

function commitStatusResponse(state: string, contexts: string[] = ["Vercel"]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ state, statuses: contexts.map((c) => ({ context: c, state })) }),
  } as Response
}

beforeEach(() => {
  vi.resetModules() // fresh module → fresh cache per test
  vi.unstubAllGlobals()
  process.env.GITHUB_TOKEN = "test-token"
  process.env.GITHUB_REPO = "PlanetEducationNetworks/PEN-Ticketing-System"
})

async function loadGetCheckState() {
  const mod = await import("./checks")
  return mod.getCheckState
}

describe("getCheckState", () => {
  it("returns null when GITHUB_TOKEN is not set", async () => {
    delete process.env.GITHUB_TOKEN
    const getCheckState = await loadGetCheckState()
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    expect(await getCheckState("main")).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("returns passing when all runs completed successfully", async () => {
    const getCheckState = await loadGetCheckState()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      checkRunsResponse([
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "skipped" },
      ]),
    ))
    expect(await getCheckState("branch-a")).toBe("passing")
  })

  it("returns failing when any run failed", async () => {
    const getCheckState = await loadGetCheckState()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      checkRunsResponse([
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "failure" },
      ]),
    ))
    expect(await getCheckState("branch-b")).toBe("failing")
  })

  it("returns pending when runs are still in progress", async () => {
    const getCheckState = await loadGetCheckState()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      checkRunsResponse([{ status: "in_progress", conclusion: null }]),
    ))
    expect(await getCheckState("branch-c")).toBe("pending")
  })

  it("returns null when there are no check runs and no commit statuses", async () => {
    const getCheckState = await loadGetCheckState()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(checkRunsResponse([])))
    expect(await getCheckState("branch-d")).toBeNull()
  })

  it("falls back to commit statuses when there are no check runs", async () => {
    const getCheckState = await loadGetCheckState()
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(checkRunsResponse([]))
      .mockResolvedValueOnce(commitStatusResponse("success"))
    vi.stubGlobal("fetch", fetchSpy)
    expect(await getCheckState("branch-i")).toBe("passing")
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(String(fetchSpy.mock.calls[1][0])).toContain("/status")
  })

  it("maps commit status failure and pending states", async () => {
    const getCheckState = await loadGetCheckState()
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(checkRunsResponse([]))
      .mockResolvedValueOnce(commitStatusResponse("failure")))
    expect(await getCheckState("branch-j")).toBe("failing")

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(checkRunsResponse([]))
      .mockResolvedValueOnce(commitStatusResponse("pending")))
    expect(await getCheckState("branch-k")).toBe("pending")
  })

  it("falls back to commit statuses when the token lacks the checks permission (403)", async () => {
    const getCheckState = await loadGetCheckState()
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403 } as Response)
      .mockResolvedValueOnce(commitStatusResponse("success"))
    vi.stubGlobal("fetch", fetchSpy)
    expect(await getCheckState("branch-l")).toBe("passing")
  })

  it("prefers check runs over commit statuses when runs exist", async () => {
    const getCheckState = await loadGetCheckState()
    const fetchSpy = vi.fn().mockResolvedValue(
      checkRunsResponse([{ status: "completed", conclusion: "failure" }]),
    )
    vi.stubGlobal("fetch", fetchSpy)
    expect(await getCheckState("branch-m")).toBe("failing")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("returns null and does not throw on API errors", async () => {
    const getCheckState = await loadGetCheckState()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response))
    expect(await getCheckState("branch-e")).toBeNull()
  })

  it("caches results per ref for the TTL", async () => {
    const getCheckState = await loadGetCheckState()
    const fetchSpy = vi.fn().mockResolvedValue(
      checkRunsResponse([{ status: "completed", conclusion: "success" }]),
    )
    vi.stubGlobal("fetch", fetchSpy)
    await getCheckState("branch-f")
    await getCheckState("branch-f")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("returns the stale cached value when a refetch after TTL expiry fails", async () => {
    vi.useFakeTimers()
    try {
      const getCheckState = await loadGetCheckState()
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce(
          checkRunsResponse([{ status: "completed", conclusion: "success" }]),
        )
        .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      vi.stubGlobal("fetch", fetchSpy)

      expect(await getCheckState("branch-g")).toBe("passing")
      vi.advanceTimersByTime(61_000)
      expect(await getCheckState("branch-g")).toBe("passing")
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("re-fetches after the TTL expires and returns the new state", async () => {
    vi.useFakeTimers()
    try {
      const getCheckState = await loadGetCheckState()
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce(
          checkRunsResponse([{ status: "completed", conclusion: "success" }]),
        )
        .mockResolvedValueOnce(
          checkRunsResponse([{ status: "completed", conclusion: "failure" }]),
        )
      vi.stubGlobal("fetch", fetchSpy)

      expect(await getCheckState("branch-h")).toBe("passing")
      vi.advanceTimersByTime(61_000)
      expect(await getCheckState("branch-h")).toBe("failing")
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
