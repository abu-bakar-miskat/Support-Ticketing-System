import { describe, it, expect } from "vitest"
import {
  normalizeValue,
  normalizeValuesPatch,
  mergeValues,
  validateOptionsInput,
  parseOptions,
  reorderByMove,
} from "./recruitment"

const stageField = {
  id: "f-stage",
  type: "select" as const,
  options: [
    { id: "o1", label: "Invitation Sent", color: "blue" },
    { id: "o2", label: "Hired", color: "green" },
  ],
}
const textField = { id: "f-name", type: "text" as const, options: null }
const ratingField = { id: "f-rating", type: "rating" as const, options: null }
const dateField = { id: "f-date", type: "date" as const, options: null }
const checkField = { id: "f-check", type: "checkbox" as const, options: null }
const fileField = { id: "f-cv", type: "file" as const, options: null }
const multiField = {
  id: "f-tags",
  type: "multi_select" as const,
  options: [{ id: "t1", label: "Remote", color: "gray" }, { id: "t2", label: "Onsite", color: "gray" }],
}

describe("normalizeValue", () => {
  it("clears on null/empty", () => {
    expect(normalizeValue(textField, "")).toEqual({ ok: true, value: null })
    expect(normalizeValue(stageField, null)).toEqual({ ok: true, value: null })
  })

  it("trims text", () => {
    expect(normalizeValue(textField, "  Dipu Paul ")).toEqual({ ok: true, value: "Dipu Paul" })
  })

  it("accepts only existing select option ids", () => {
    expect(normalizeValue(stageField, "o2")).toEqual({ ok: true, value: "o2" })
    expect(normalizeValue(stageField, "nope").ok).toBe(false)
  })

  it("clamps rating to 0-5 integers", () => {
    expect(normalizeValue(ratingField, 7)).toEqual({ ok: true, value: 5 })
    expect(normalizeValue(ratingField, 3.6)).toEqual({ ok: true, value: 4 })
    expect(normalizeValue(ratingField, "abc").ok).toBe(false)
  })

  it("requires YYYY-MM-DD dates", () => {
    expect(normalizeValue(dateField, "2026-06-22")).toEqual({ ok: true, value: "2026-06-22" })
    expect(normalizeValue(dateField, "22/06/2026").ok).toBe(false)
  })

  it("coerces checkbox to strict boolean", () => {
    expect(normalizeValue(checkField, true)).toEqual({ ok: true, value: true })
    expect(normalizeValue(checkField, "yes")).toEqual({ ok: true, value: false })
  })

  it("filters multi_select to known option ids", () => {
    expect(normalizeValue(multiField, ["t1", "bogus", "t2"])).toEqual({ ok: true, value: ["t1", "t2"] })
    expect(normalizeValue(multiField, ["bogus"])).toEqual({ ok: true, value: null })
  })

  it("accepts a well-formed file value and strips extra keys", () => {
    const file = { url: "https://x/f.pdf", path: "recruitment/b/c/f.pdf", name: "CV.pdf", size: 1234, extra: "drop me" }
    expect(normalizeValue(fileField, file)).toEqual({
      ok: true,
      value: { url: "https://x/f.pdf", path: "recruitment/b/c/f.pdf", name: "CV.pdf", size: 1234 },
    })
  })

  it("rejects malformed file values", () => {
    expect(normalizeValue(fileField, "just-a-string").ok).toBe(false)
    expect(normalizeValue(fileField, { url: "https://x/f.pdf" }).ok).toBe(false)
    expect(normalizeValue(fileField, { url: 1, path: "p", name: "n", size: 1 }).ok).toBe(false)
    expect(normalizeValue(fileField, { url: "u", path: "p", name: "n", size: "big" }).ok).toBe(false)
  })

  it("clears a file cell on null", () => {
    expect(normalizeValue(fileField, null)).toEqual({ ok: true, value: null })
  })
})

describe("normalizeValuesPatch", () => {
  const fields = [textField, stageField]

  it("rejects unknown field ids", () => {
    const res = normalizeValuesPatch(fields, { "f-ghost": "x" })
    expect(res.ok).toBe(false)
  })

  it("normalizes each provided field", () => {
    const res = normalizeValuesPatch(fields, { "f-name": " A ", "f-stage": "o1" })
    expect(res).toEqual({ ok: true, values: { "f-name": "A", "f-stage": "o1" } })
  })

  it("rejects non-object patches", () => {
    expect(normalizeValuesPatch(fields, ["nope"]).ok).toBe(false)
  })
})

describe("mergeValues", () => {
  it("merges and drops cleared keys", () => {
    const merged = mergeValues({ a: 1, b: 2 }, { b: null, c: 3 })
    expect(merged).toEqual({ a: 1, c: 3 })
  })

  it("tolerates malformed existing values", () => {
    expect(mergeValues("garbage", { a: 1 })).toEqual({ a: 1 })
  })
})

describe("validateOptionsInput", () => {
  it("accepts valid options and defaults bad colors to gray", () => {
    const res = validateOptionsInput([{ id: "a", label: "A", color: "neon" }])
    expect(res).toEqual({ ok: true, options: [{ id: "a", label: "A", color: "gray" }] })
  })

  it("rejects duplicates and missing labels", () => {
    expect(validateOptionsInput([{ id: "a", label: "A" }, { id: "a", label: "B" }]).ok).toBe(false)
    expect(validateOptionsInput([{ id: "a", label: " " }]).ok).toBe(false)
  })
})

describe("parseOptions", () => {
  it("returns [] for malformed json and fills default color", () => {
    expect(parseOptions("junk")).toEqual([])
    expect(parseOptions([{ id: "a", label: "A" }])).toEqual([{ id: "a", label: "A", color: "gray" }])
  })
})

describe("reorderByMove", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]

  it("moves an item forward to the target position", () => {
    expect(reorderByMove(items, "a", "c").map((i) => i.id)).toEqual(["b", "c", "a", "d"])
  })

  it("moves an item backward to the target position", () => {
    expect(reorderByMove(items, "d", "b").map((i) => i.id)).toEqual(["a", "d", "b", "c"])
  })

  it("returns the array unchanged for unknown or identical ids", () => {
    expect(reorderByMove(items, "a", "a")).toBe(items)
    expect(reorderByMove(items, "x", "b")).toBe(items)
    expect(reorderByMove(items, "a", "x")).toBe(items)
  })

  it("does not mutate the input", () => {
    reorderByMove(items, "a", "d")
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c", "d"])
  })
})
