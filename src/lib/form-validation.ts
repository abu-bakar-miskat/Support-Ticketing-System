/**
 * Dynamic form validation + conditional visibility (SRS slice 08, FM-05).
 *
 * ISOMORPHIC by design — the public form (client) and the submit endpoint
 * (server) import the SAME engine, so client- and server-side validation can
 * never diverge (AC: "server-side validation matching client-side"). No
 * `server-only`, no DB, no Prisma import — pure and unit-tested.
 *
 * Field definitions map onto `IntakeFormField` (type/isRequired/options/
 * validation JSON), plus a `visibleWhen` conditional-visibility rule. Only
 * VISIBLE fields are validated, so a hidden field is never required (FM-05).
 */

export type FieldType =
  | "text"
  | "textarea"
  | "dropdown"
  | "checkbox"
  | "radio"
  | "date"
  | "number"
  | "file"
  | "email";

/** Per-field validation config (stored in IntakeFormField.validation JSON). */
export type FieldValidation = {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  /** Numeric range (applies to number fields / numeric input). */
  min?: number;
  max?: number;
  /** Require a valid email format. */
  email?: boolean;
  /** Regex source the value must match. */
  pattern?: string;
};

/**
 * Show this field only when another field's value matches. Absent = always
 * visible. `equals` matches one value; `in` matches any of several.
 */
export type VisibilityRule = {
  fieldId: string;
  equals?: string;
  in?: string[];
};

export type FormFieldDef = {
  id: string;
  type: FieldType;
  label: string;
  /** Top-level required flag (IntakeFormField.isRequired); validation.required also honored. */
  required?: boolean;
  options?: string[];
  validation?: FieldValidation | null;
  visibleWhen?: VisibilityRule | null;
};

export type SubmissionValues = Record<string, unknown>;

// RFC-5322-lite; matches the client's expectations without being pedantic.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Whether a field is visible given the current submission values (FM-05). */
export function isFieldVisible(field: FormFieldDef, values: SubmissionValues): boolean {
  const rule = field.visibleWhen;
  if (!rule) return true;
  const other = values[rule.fieldId];
  if (rule.in && rule.in.length > 0) return rule.in.includes(String(other));
  if (rule.equals !== undefined) return String(other) === rule.equals;
  // A malformed rule (neither equals nor in) fails open to visible.
  return true;
}

/** The subset of fields currently visible for the given values. */
export function visibleFields(fields: FormFieldDef[], values: SubmissionValues): FormFieldDef[] {
  return fields.filter((f) => isFieldVisible(f, values));
}

/**
 * Validate a single field's value against its rules. Returns an error message
 * or null. Assumes the field is visible (hidden fields are skipped upstream).
 */
export function validateField(field: FormFieldDef, value: unknown): string | null {
  const v = field.validation ?? {};
  const required = field.required === true || v.required === true;

  if (isEmpty(value)) {
    return required ? `${field.label} is required` : null;
  }

  const isNumeric = field.type === "number" || v.min != null || v.max != null;
  if (isNumeric) {
    const n = typeof value === "number" ? value : Number(String(value).trim());
    if (Number.isNaN(n)) return `${field.label} must be a number`;
    if (v.min != null && n < v.min) return `${field.label} must be at least ${v.min}`;
    if (v.max != null && n > v.max) return `${field.label} must be at most ${v.max}`;
  }

  if (typeof value === "string") {
    if (v.minLength != null && value.length < v.minLength) {
      return `${field.label} must be at least ${v.minLength} characters`;
    }
    if (v.maxLength != null && value.length > v.maxLength) {
      return `${field.label} must be at most ${v.maxLength} characters`;
    }
    if ((field.type === "email" || v.email === true) && !EMAIL_RE.test(value.trim())) {
      return `${field.label} must be a valid email address`;
    }
    if (v.pattern) {
      let re: RegExp | null = null;
      try {
        re = new RegExp(v.pattern);
      } catch {
        re = null; // A bad pattern config never blocks a submission.
      }
      if (re && !re.test(value)) return `${field.label} is not in the expected format`;
    }
  }

  // dropdown/radio: value must be one of the declared options when options exist.
  if ((field.type === "dropdown" || field.type === "radio") && field.options && field.options.length > 0) {
    if (!field.options.includes(String(value))) return `${field.label} has an invalid selection`;
  }

  return null;
}

export type ValidationResult = { ok: boolean; errors: Record<string, string> };

/**
 * Validate a whole submission. Only VISIBLE fields are checked (FM-05: a hidden
 * field is never required and never validated). Returns a per-field error map.
 */
export function validateSubmission(fields: FormFieldDef[], values: SubmissionValues): ValidationResult {
  const errors: Record<string, string> = {};
  for (const field of visibleFields(fields, values)) {
    const err = validateField(field, values[field.id]);
    if (err) errors[field.id] = err;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
