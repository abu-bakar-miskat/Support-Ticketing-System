import { describe, it, expect } from "vitest"
import { advanceTimeCursor, readTimeCursor, selectNewRefs } from "./time-cursor"

const at = (s: number) => new Date(Date.UTC(2026, 9, 13, 12, 0, s)).toISOString()

describe("time cursor", () => {
  it("keeps same-second messages that weren't processed yet and drops older ones", () => {
    const cursor = { since: at(5), ids: ["a"] }
    const refs = selectNewRefs(cursor, [
      { id: "old", receivedAt: at(4) },
      { id: "a", receivedAt: at(5) },
      { id: "b", receivedAt: at(5) },
      { id: "c", receivedAt: at(9) },
    ], 10)
    expect(refs.map((r) => r.id)).toEqual(["b", "c"])
  })

  it("sorts oldest first and caps at the limit", () => {
    const refs = selectNewRefs({ since: at(0), ids: [] }, [
      { id: "z", receivedAt: at(3) },
      { id: "y", receivedAt: at(1) },
      { id: "x", receivedAt: at(2) },
    ], 2)
    expect(refs.map((r) => r.id)).toEqual(["y", "x"])
  })

  it("accumulates ids within a second and resets on a newer timestamp", () => {
    let cursor = { since: at(5), ids: ["a"] }
    cursor = advanceTimeCursor(cursor, { id: "b", receivedAt: at(5) })
    expect(cursor).toEqual({ since: at(5), ids: ["a", "b"] })
    cursor = advanceTimeCursor(cursor, { id: "c", receivedAt: at(7) })
    expect(cursor).toEqual({ since: at(7), ids: ["c"] })
  })

  it("falls back to 'now' for an unreadable cursor", () => {
    const before = Date.now()
    const cursor = readTimeCursor({ nope: true })
    expect(Date.parse(cursor.since)).toBeGreaterThanOrEqual(before)
    expect(cursor.ids).toEqual([])
  })
})
