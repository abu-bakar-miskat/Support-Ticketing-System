/** Fixed lifecycle categories; status names remain local to each workflow. */
export const STATUS_CATEGORIES = ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETE"] as const
export type StatusCategory = (typeof STATUS_CATEGORIES)[number]

export const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  TODO: "To-do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETE: "Complete",
}

export type CategorisedStatus = {
  label: string
  category?: StatusCategory
  isComplete?: boolean
  order?: number
}

export function isStatusCategory(value: unknown): value is StatusCategory {
  return typeof value === "string" && (STATUS_CATEGORIES as readonly string[]).includes(value)
}

/** Used only for legacy templates/data without a saved category. */
export function inferStatusCategory(status: CategorisedStatus): StatusCategory {
  if (status.isComplete) return "COMPLETE"
  const label = status.label.trim().toLowerCase().replace(/[_-]+/g, " ")
  if (label === "ended (no resolution)") return "BLOCKED"
  if (/^(blocked?|paused|on hold|hold|rejected|escalated|escaleted|waiting|cancelled|canceled)$/.test(label)) return "BLOCKED"
  if (/^(open|to ?do|not started|backlog|new|start|pending|queued|queue|unstarted)$/.test(label)) return "TODO"
  if (/^(in progress|inprogress|in review|review|testing|test|pull request|pr|working|active|ongoing|doing|in dev|development|started)$/.test(label)) return "IN_PROGRESS"
  return (status.order ?? 0) > 0 ? "IN_PROGRESS" : "TODO"
}

export function statusCategory(status: CategorisedStatus): StatusCategory {
  return status.category ?? inferStatusCategory(status)
}

/** Completion is derived from the lifecycle category, never a separate setting. */
export function isCompleteStatus(status: CategorisedStatus): boolean {
  return statusCategory(status) === "COMPLETE"
}

export function categoryForStatus(label: string, statuses: readonly CategorisedStatus[]): StatusCategory {
  return statusCategory(statuses.find((status) => status.label === label) ?? { label })
}

export function sortStatusesByCategory<T extends CategorisedStatus>(statuses: readonly T[]): T[] {
  return [...statuses].sort((a, b) =>
    STATUS_CATEGORIES.indexOf(statusCategory(a)) - STATUS_CATEGORIES.indexOf(statusCategory(b)) ||
    (a.order ?? 0) - (b.order ?? 0),
  )
}
