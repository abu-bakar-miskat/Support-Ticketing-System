import { parseOptions, type SelectOption } from "@/lib/recruitment"

type FieldRow = { id: string; name: string; type: string; options: unknown }

export type RejectTargets = {
  stageFieldId: string
  stageFieldName: string
  rejectOption: SelectOption
  reasonFieldId: string | null
  reasonOptions: SelectOption[]
}

/**
 * Finds where "reject" lives on a recruitment board: a stage/status select
 * column that has a reject-ish option (preferring a screening-specific one,
 * e.g. "Screening Rejected" over "Final Rejected"), plus the optional
 * "Reject Reason" select. Returns null when the board has no such column —
 * the review page hides the Reject button then.
 */
export function findRejectTargets(fields: FieldRow[]): RejectTargets | null {
  const selects = fields.filter((f) => f.type === "select")
  for (const field of selects) {
    if (!/stage|status/i.test(field.name)) continue
    const rejects = parseOptions(field.options).filter((o) => /reject/i.test(o.label))
    if (rejects.length === 0) continue
    const rejectOption = rejects.find((o) => /screen/i.test(o.label)) ?? rejects[0]
    const reasonField =
      selects.find((f) => /reject/i.test(f.name) && /reason/i.test(f.name)) ?? null
    return {
      stageFieldId: field.id,
      stageFieldName: field.name,
      rejectOption,
      reasonFieldId: reasonField?.id ?? null,
      reasonOptions: reasonField ? parseOptions(reasonField.options) : [],
    }
  }
  return null
}
