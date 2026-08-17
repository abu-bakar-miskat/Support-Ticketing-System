import { describe, it, expect } from "vitest";
import {
  isFieldVisible,
  visibleFields,
  validateField,
  validateSubmission,
  type FormFieldDef,
} from "./form-validation";

const field = (over: Partial<FormFieldDef> & { id: string; type: FormFieldDef["type"] }): FormFieldDef => ({
  label: over.id,
  ...over,
});

describe("isFieldVisible — FM-05 conditional visibility", () => {
  it("is always visible with no rule", () => {
    expect(isFieldVisible(field({ id: "a", type: "text" }), {})).toBe(true);
  });
  it("shows when another field equals the expected value", () => {
    const f = field({ id: "detail", type: "text", visibleWhen: { fieldId: "kind", equals: "other" } });
    expect(isFieldVisible(f, { kind: "other" })).toBe(true);
    expect(isFieldVisible(f, { kind: "bug" })).toBe(false);
  });
  it("shows when another field is in a set", () => {
    const f = field({ id: "detail", type: "text", visibleWhen: { fieldId: "kind", in: ["a", "b"] } });
    expect(isFieldVisible(f, { kind: "b" })).toBe(true);
    expect(isFieldVisible(f, { kind: "c" })).toBe(false);
  });
});

describe("validateField", () => {
  it("flags a required empty field", () => {
    expect(validateField(field({ id: "name", type: "text", required: true }), "")).toMatch(/required/);
    expect(validateField(field({ id: "name", type: "text", required: true }), "  ")).toMatch(/required/);
  });
  it("passes an optional empty field", () => {
    expect(validateField(field({ id: "name", type: "text" }), "")).toBeNull();
  });
  it("honors validation.required as well as the top-level flag", () => {
    expect(validateField(field({ id: "n", type: "text", validation: { required: true } }), "")).toMatch(/required/);
  });
  it("validates email format", () => {
    const f = field({ id: "e", type: "email", required: true });
    expect(validateField(f, "nope")).toMatch(/valid email/);
    expect(validateField(f, "a@b.co")).toBeNull();
  });
  it("enforces numeric range", () => {
    const f = field({ id: "n", type: "number", validation: { min: 1, max: 10 } });
    expect(validateField(f, "0")).toMatch(/at least 1/);
    expect(validateField(f, "11")).toMatch(/at most 10/);
    expect(validateField(f, "5")).toBeNull();
    expect(validateField(f, "abc")).toMatch(/must be a number/);
  });
  it("enforces length bounds", () => {
    const f = field({ id: "t", type: "text", validation: { minLength: 3, maxLength: 5 } });
    expect(validateField(f, "ab")).toMatch(/at least 3/);
    expect(validateField(f, "abcdef")).toMatch(/at most 5/);
    expect(validateField(f, "abcd")).toBeNull();
  });
  it("rejects an out-of-list dropdown/radio selection", () => {
    const f = field({ id: "s", type: "dropdown", options: ["x", "y"] });
    expect(validateField(f, "z")).toMatch(/invalid selection/);
    expect(validateField(f, "x")).toBeNull();
  });
  it("ignores a malformed regex pattern rather than blocking", () => {
    const f = field({ id: "t", type: "text", validation: { pattern: "(" } });
    expect(validateField(f, "anything")).toBeNull();
  });
});

describe("validateSubmission — hidden fields are never required (FM-05)", () => {
  const fields: FormFieldDef[] = [
    field({ id: "kind", type: "dropdown", options: ["bug", "other"], required: true }),
    field({ id: "detail", type: "text", required: true, visibleWhen: { fieldId: "kind", equals: "other" } }),
  ];

  it("does not require the hidden conditional field", () => {
    const res = validateSubmission(fields, { kind: "bug" }); // detail hidden
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual({});
  });

  it("requires the conditional field once it becomes visible", () => {
    const res = validateSubmission(fields, { kind: "other" }); // detail now visible + empty
    expect(res.ok).toBe(false);
    expect(res.errors.detail).toMatch(/required/);
  });

  it("passes when all visible required fields are filled", () => {
    const res = validateSubmission(fields, { kind: "other", detail: "please help" });
    expect(res.ok).toBe(true);
  });
});

describe("visibleFields", () => {
  it("filters out fields whose rule is unmet", () => {
    const fields: FormFieldDef[] = [
      field({ id: "a", type: "text" }),
      field({ id: "b", type: "text", visibleWhen: { fieldId: "a", equals: "show" } }),
    ];
    expect(visibleFields(fields, { a: "hide" }).map((f) => f.id)).toEqual(["a"]);
    expect(visibleFields(fields, { a: "show" }).map((f) => f.id)).toEqual(["a", "b"]);
  });
});
