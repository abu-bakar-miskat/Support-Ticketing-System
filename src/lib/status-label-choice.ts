export type LinkedLabelOption = { name: string; color: string }

const FALLBACK_LABEL_COLOR = "#94a3b8"

/** Sentinel passed from the label picker when the user continues without a label. */
export const NO_LINKED_LABEL_CHOICE = "__no_label__"

/** True when the workflow status has linked labels saved in settings. */
export function statusHasLinkedLabels(allowedLabels: string[] | undefined): boolean {
  return (allowedLabels?.length ?? 0) > 0
}

/** Build picker options from saved linked labels (colors filled when dept registry loads). */
export function buildLinkedLabelOptions(
  allowedLabels: string[] | undefined,
  departmentLabels: ReadonlyArray<{ name: string; color: string }>,
): LinkedLabelOption[] {
  if (!allowedLabels?.length) return []
  const byName = new Map(departmentLabels.map((l) => [l.name, l.color]))
  return allowedLabels.map((name) => ({
    name,
    color: byName.get(name) ?? FALLBACK_LABEL_COLOR,
  }))
}

/** True when moving to this status should show the linked-label picker. */
export function statusRequiresLinkedLabelChoice(
  allowedLabels: string[] | undefined,
  _departmentLabels?: ReadonlyArray<{ name: string; color: string }>,
): boolean {
  return statusHasLinkedLabels(allowedLabels)
}

export function hasLinkedLabelSelection(chosen: string | null): boolean {
  return chosen !== null
}

/** Map modal selection to the API payload (undefined = no label). */
export function chosenLabelForApi(chosen: string | null): string | undefined {
  if (chosen === null || chosen === NO_LINKED_LABEL_CHOICE) return undefined
  return chosen
}

/** Server-side: filter stored allowedLabels to names registered for the department. */
export function effectiveLinkedLabelNames(
  allowedLabels: string[],
  departmentLabelNames: ReadonlySet<string>,
): string[] {
  if (!allowedLabels.length || !departmentLabelNames.size) return []
  return allowedLabels.filter((name) => departmentLabelNames.has(name))
}
