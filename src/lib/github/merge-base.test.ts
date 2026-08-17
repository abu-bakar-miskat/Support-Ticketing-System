import { describe, it, expect } from "vitest"
import { classifyMergedBase } from "./merge-base"

describe("classifyMergedBase", () => {
  it("treats main, master, and modifications as live (case-insensitive)", () => {
    expect(classifyMergedBase("main")).toBe("live")
    expect(classifyMergedBase("Main")).toBe("live")
    expect(classifyMergedBase("master")).toBe("live")
    expect(classifyMergedBase("Master")).toBe("live")
    expect(classifyMergedBase("MASTER")).toBe("live")
    expect(classifyMergedBase("modifications")).toBe("live")
    expect(classifyMergedBase("Modifications")).toBe("live")
  })

  it("treats dev and any dev-prefixed branch as dev", () => {
    expect(classifyMergedBase("dev")).toBe("dev")
    expect(classifyMergedBase("Dev")).toBe("dev")
    expect(classifyMergedBase("develop")).toBe("dev")
    expect(classifyMergedBase("development")).toBe("dev")
    expect(classifyMergedBase("dev-staging")).toBe("dev")
    expect(classifyMergedBase("dev/feature")).toBe("dev")
  })

  it("returns null for unrelated bases", () => {
    expect(classifyMergedBase("staging")).toBeNull()
    expect(classifyMergedBase("release/1.0")).toBeNull()
    expect(classifyMergedBase("feature/login")).toBeNull()
    expect(classifyMergedBase(null)).toBeNull()
    expect(classifyMergedBase(undefined)).toBeNull()
    expect(classifyMergedBase("")).toBeNull()
  })
})
