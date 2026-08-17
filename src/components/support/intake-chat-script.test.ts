import { describe, it, expect } from "vitest"
import {
  buildScript,
  validateAnswer,
  questionFor,
  mentionsAttachment,
  type ChatField,
} from "./intake-chat-script"

const textField = (over: Partial<ChatField> = {}): ChatField => ({
  id: "f1",
  label: "Course name",
  type: "text",
  isRequired: true,
  options: [],
  childOptions: {},
  placeholder: null,
  helperText: null,
  validation: null,
  ...over,
})

const issues = [
  { id: "i1", name: "Bug report" },
  { id: "i2", name: "Feature request" },
]

describe("buildScript", () => {
  it("orders steps name → email → issue → title → description → fields → attachments → summary", () => {
    const script = buildScript([textField()], issues)
    expect(script.map((s) => s.kind)).toEqual([
      "name",
      "email",
      "issue",
      "title",
      "description",
      "field",
      "attachments",
      "summary",
    ])
  })

  it("omits the issue step when the form has no issues", () => {
    const script = buildScript([], [])
    expect(script.map((s) => s.kind)).toEqual([
      "name",
      "email",
      "title",
      "description",
      "attachments",
      "summary",
    ])
  })

  it("omits the built-in attachments step when the form has its own file field", () => {
    const script = buildScript([textField({ type: "file" })], [])
    expect(script.map((s) => s.kind)).toEqual([
      "name",
      "email",
      "title",
      "description",
      "field",
      "summary",
    ])
  })

  it("omits the built-in description step when the form has its own richtext field", () => {
    const script = buildScript([textField({ type: "richtext" })], [])
    expect(script.map((s) => s.kind)).toEqual([
      "name",
      "email",
      "title",
      "field",
      "attachments",
      "summary",
    ])
  })

  it("keeps fields in their given order", () => {
    const script = buildScript(
      [textField({ id: "a", label: "First" }), textField({ id: "b", label: "Second" })],
      [],
    )
    const fieldSteps = script.filter((s) => s.kind === "field")
    expect(fieldSteps.map((s) => (s.kind === "field" ? s.field.id : ""))).toEqual(["a", "b"])
  })
})

describe("validateAnswer", () => {
  it("requires a non-empty name", () => {
    expect(validateAnswer({ kind: "name" }, "  ")).toBeTruthy()
    expect(validateAnswer({ kind: "name" }, "Radu")).toBeNull()
  })

  it("validates email format", () => {
    expect(validateAnswer({ kind: "email" }, "not-an-email")).toBeTruthy()
    expect(validateAnswer({ kind: "email" }, "radu@pengroup.com")).toBeNull()
  })

  it("allows empty answers on optional fields but not required ones", () => {
    const required = { kind: "field" as const, field: textField({ isRequired: true }) }
    const optional = { kind: "field" as const, field: textField({ isRequired: false }) }
    expect(validateAnswer(required, "")).toBeTruthy()
    expect(validateAnswer(optional, "")).toBeNull()
  })

  it("enforces minLength/maxLength on text fields", () => {
    const step = {
      kind: "field" as const,
      field: textField({ validation: { minLength: 5, maxLength: 8 } }),
    }
    expect(validateAnswer(step, "abc")).toBe("Must be at least 5 characters.")
    expect(validateAnswer(step, "abcdefghi")).toBe("Must be at most 8 characters.")
    expect(validateAnswer(step, "abcdef")).toBeNull()
  })

  it("enforces min/max on number fields", () => {
    const step = {
      kind: "field" as const,
      field: textField({ type: "number", validation: { min: 1, max: 10 } }),
    }
    expect(validateAnswer(step, "0")).toBe("Must be at least 1.")
    expect(validateAnswer(step, "11")).toBe("Must be at most 10.")
    expect(validateAnswer(step, "5")).toBeNull()
  })

  it("enforces pattern with custom message", () => {
    const step = {
      kind: "field" as const,
      field: textField({
        validation: { pattern: "^PEN-\\d+$", patternMessage: "Use the PEN-123 format." },
      }),
    }
    expect(validateAnswer(step, "nope")).toBe("Use the PEN-123 format.")
    expect(validateAnswer(step, "PEN-42")).toBeNull()
  })

  it("validates email-type custom fields", () => {
    const step = { kind: "field" as const, field: textField({ type: "email" }) }
    expect(validateAnswer(step, "bad")).toBeTruthy()
    expect(validateAnswer(step, "ok@ok.com")).toBeNull()
  })
})

describe("mentionsAttachment", () => {
  it("detects attachment intent in free text", () => {
    expect(mentionsAttachment("we need to update wording, can i attach a photo?")).toBe(true)
    expect(mentionsAttachment("here is a screenshot of the bug")).toBe(true)
    expect(mentionsAttachment("I want to upload a file")).toBe(true)
    expect(mentionsAttachment("the login page is broken")).toBe(false)
  })
})

describe("questionFor", () => {
  it("asks for the field label", () => {
    const q = questionFor({ kind: "field", field: textField({ label: "Course name" }) })
    expect(q).toContain("Course name")
  })

  it("has a question for every step kind", () => {
    const script = buildScript([textField()], issues)
    for (const step of script) {
      expect(questionFor(step).length).toBeGreaterThan(0)
    }
  })
})
