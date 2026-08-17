import { describe, it, expect } from "vitest"
import { parseTicketRefs } from "./parse-refs"

describe("parseTicketRefs", () => {
  it("finds a ref in a branch name", () => {
    expect(parseTicketRefs("feat/DEV-42-dark-mode")).toEqual([
      { prefix: "DEV", number: 42 },
    ])
  })

  it("is case-insensitive and uppercases the prefix", () => {
    expect(parseTicketRefs("fix/dev-7-login")).toEqual([
      { prefix: "DEV", number: 7 },
    ])
  })

  it("finds multiple distinct refs across several inputs", () => {
    expect(parseTicketRefs("DEV-1 and OPS-2", "also DEV-3")).toEqual([
      { prefix: "DEV", number: 1 },
      { prefix: "OPS", number: 2 },
      { prefix: "DEV", number: 3 },
    ])
  })

  it("dedupes the same ref appearing in multiple inputs", () => {
    expect(parseTicketRefs("DEV-42", "[DEV-42] fix it", "dev-42 again")).toEqual([
      { prefix: "DEV", number: 42 },
    ])
  })

  it("ignores null, undefined, and text without refs", () => {
    expect(parseTicketRefs(null, undefined, "no refs here", "")).toEqual([])
  })

  it("does not match when digits run into letters", () => {
    expect(parseTicketRefs("DEV-42x")).toEqual([])
  })

  it("requires the prefix to start with a letter", () => {
    expect(parseTicketRefs("123-42")).toEqual([])
  })
})
