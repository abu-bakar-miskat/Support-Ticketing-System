import type { RecruitmentFieldType } from "@/generated/prisma/enums"

export type SelectOption = { id: string; label: string; color: string }

export const RECRUITMENT_FIELD_TYPES: RecruitmentFieldType[] = [
  "text",
  "select",
  "multi_select",
  "number",
  "date",
  "url",
  "email",
  "phone",
  "rating",
  "checkbox",
  "file",
]

/** Stored value of a `file` cell — set via the board upload endpoint. */
export type FileCellValue = { url: string; path: string; name: string; size: number }

export function parseFileValue(raw: unknown): FileCellValue | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null
  const { url, path, name, size } = raw as Record<string, unknown>
  if (typeof url !== "string" || typeof path !== "string" || typeof name !== "string" || typeof size !== "number") {
    return null
  }
  return { url, path, name, size }
}

/** Chip palette for select options — tailwind-safe token names resolved in the UI. */
export const OPTION_COLORS = [
  "gray",
  "blue",
  "green",
  "yellow",
  "orange",
  "red",
  "purple",
  "pink",
  "teal",
] as const

/**
 * Move the item `dragId` to the position of `targetId`, shifting the rest.
 * Used for column drag-and-drop: operates on the FULL field list so hidden
 * columns keep their relative position. Returns the input array unchanged
 * when either id is missing or they are equal.
 */
export function reorderByMove<T extends { id: string }>(items: T[], dragId: string, targetId: string): T[] {
  const from = items.findIndex((i) => i.id === dragId)
  const to = items.findIndex((i) => i.id === targetId)
  if (from < 0 || to < 0 || from === to) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function isSelectType(type: RecruitmentFieldType): boolean {
  return type === "select" || type === "multi_select"
}

/** Parse/normalize a field's options JSON into a safe SelectOption[]. */
export function parseOptions(raw: unknown): SelectOption[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (o): o is { id: string; label: string; color?: string } =>
        typeof o === "object" && o !== null &&
        typeof (o as { id?: unknown }).id === "string" &&
        typeof (o as { label?: unknown }).label === "string",
    )
    .map((o) => ({
      id: o.id,
      label: o.label,
      color: typeof o.color === "string" ? o.color : "gray",
    }))
}

/** Validate options payload for a select-type field (create/update). */
export function validateOptionsInput(raw: unknown): { ok: true; options: SelectOption[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) return { ok: false, message: "options must be an array" }
  const seen = new Set<string>()
  const options: SelectOption[] = []
  for (const o of raw) {
    if (typeof o !== "object" || o === null) return { ok: false, message: "each option must be an object" }
    const { id, label, color } = o as { id?: unknown; label?: unknown; color?: unknown }
    if (typeof id !== "string" || !id.trim()) return { ok: false, message: "each option needs a string id" }
    if (seen.has(id)) return { ok: false, message: `duplicate option id: ${id}` }
    seen.add(id)
    if (typeof label !== "string" || !label.trim()) return { ok: false, message: "each option needs a label" }
    options.push({
      id,
      label: label.trim(),
      color: typeof color === "string" && (OPTION_COLORS as readonly string[]).includes(color) ? color : "gray",
    })
  }
  return { ok: true, options }
}

/**
 * Default column template for new recruitment boards — mirrors the UI/UX
 * pipeline so managers never start from a bare "Name" column. Option ids are
 * slugs so they read well in stored values; colors follow the stage chips.
 */
export const DEFAULT_BOARD_FIELDS: Array<{
  name: string
  type: RecruitmentFieldType
  options?: SelectOption[]
}> = [
  { name: "Candidate", type: "text" },
  {
    name: "Stage",
    type: "select",
    options: [
      { id: "opt_stage_invited", label: "Invitation Sent", color: "blue" },
      { id: "opt_stage_s1", label: "Stage 1 — Interview", color: "teal" },
      { id: "opt_stage_s2", label: "Stage 2 — Final Interview", color: "purple" },
      { id: "opt_stage_offer", label: "Passed — Offer Sent", color: "green" },
      { id: "opt_stage_hired", label: "Hired", color: "green" },
      { id: "opt_stage_s1_rej", label: "Stage 1 — Rejected", color: "red" },
      { id: "opt_stage_s2_rej", label: "Stage 2 — Rejected", color: "red" },
      { id: "opt_stage_noreply", label: "Never Replied", color: "gray" },
    ],
  },
  { name: "CV", type: "file" },
  { name: "Rating", type: "rating" },
  {
    name: "Stage 2 Outcome",
    type: "select",
    options: [
      { id: "opt_outcome_yes", label: "Yes", color: "green" },
      { id: "opt_outcome_no", label: "No", color: "red" },
    ],
  },
  {
    name: "Reject Reason",
    type: "select",
    options: [
      { id: "opt_rr_comm", label: "Communication", color: "orange" },
      { id: "opt_rr_exp", label: "Experience", color: "orange" },
      { id: "opt_rr_test", label: "Test Fail", color: "orange" },
      { id: "opt_rr_noshow", label: "No Show", color: "orange" },
      { id: "opt_rr_withdrew", label: "Withdrew", color: "orange" },
      { id: "opt_rr_other", label: "Other", color: "gray" },
    ],
  },
  { name: "Current Company", type: "text" },
  { name: "Current Role", type: "text" },
  { name: "Experience", type: "text" },
  { name: "Location", type: "text" },
  {
    name: "Source",
    type: "select",
    options: [
      { id: "opt_src_linkedin", label: "LinkedIn", color: "blue" },
      { id: "opt_src_referral", label: "Referral", color: "green" },
      { id: "opt_src_jobboard", label: "Job Board", color: "purple" },
      { id: "opt_src_other", label: "Other", color: "gray" },
    ],
  },
  { name: "Email", type: "email" },
  { name: "Phone", type: "phone" },
  { name: "Portfolio", type: "url" },
  { name: "LinkedIn", type: "url" },
  { name: "Salary Expectation", type: "text" },
  { name: "Notice Period", type: "text" },
  { name: "Availability", type: "text" },
  { name: "Date Shortlisted", type: "date" },
]

type FieldForValidation = { id: string; type: RecruitmentFieldType; options: unknown }

/**
 * Normalize one cell value for a field. Returns the value to store, or an
 * error message. `null` always means "clear the cell".
 */
export function normalizeValue(
  field: FieldForValidation,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null }

  switch (field.type) {
    case "text":
    case "url":
    case "email":
    case "phone": {
      if (typeof value !== "string") return { ok: false, message: "expected a string" }
      const v = value.trim()
      return { ok: true, value: v || null }
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(value)
      if (!Number.isFinite(n)) return { ok: false, message: "expected a number" }
      return { ok: true, value: n }
    }
    case "rating": {
      const n = typeof value === "number" ? value : Number(value)
      if (!Number.isFinite(n)) return { ok: false, message: "expected a rating 0-5" }
      return { ok: true, value: Math.min(5, Math.max(0, Math.round(n))) || null }
    }
    case "checkbox": {
      return { ok: true, value: value === true }
    }
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { ok: false, message: "expected a date as YYYY-MM-DD" }
      }
      return { ok: true, value }
    }
    case "select": {
      if (typeof value !== "string") return { ok: false, message: "expected an option id" }
      const opts = parseOptions(field.options)
      if (!opts.some((o) => o.id === value)) return { ok: false, message: "unknown option id" }
      return { ok: true, value }
    }
    case "multi_select": {
      if (!Array.isArray(value)) return { ok: false, message: "expected an array of option ids" }
      const opts = new Set(parseOptions(field.options).map((o) => o.id))
      const ids = value.filter((v): v is string => typeof v === "string" && opts.has(v))
      return { ok: true, value: ids.length ? ids : null }
    }
    case "file": {
      const file = parseFileValue(value)
      if (!file) return { ok: false, message: "expected a file object with url, path, name, size" }
      return { ok: true, value: file }
    }
  }
}

/**
 * Validate a values patch against a board's fields. Unknown field ids are
 * rejected. Returns the normalized patch (null values mean "clear").
 */
export function normalizeValuesPatch(
  fields: FieldForValidation[],
  patch: unknown,
): { ok: true; values: Record<string, unknown> } | { ok: false; message: string } {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return { ok: false, message: "values must be an object keyed by field id" }
  }
  const byId = new Map(fields.map((f) => [f.id, f]))
  const out: Record<string, unknown> = {}
  for (const [fieldId, raw] of Object.entries(patch as Record<string, unknown>)) {
    const field = byId.get(fieldId)
    if (!field) return { ok: false, message: `unknown field id: ${fieldId}` }
    const res = normalizeValue(field, raw)
    if (!res.ok) return { ok: false, message: `${fieldId}: ${res.message}` }
    out[fieldId] = res.value
  }
  return { ok: true, values: out }
}

/** Merge a normalized patch into existing stored values, dropping nulls. */
export function mergeValues(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    typeof existing === "object" && existing !== null && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete base[k]
    else base[k] = v
  }
  return base
}
