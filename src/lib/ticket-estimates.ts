/** Creation supplies one estimate, attributed to the primary assignee. */
export function creationEstimate(assigneeId: string | null, estimatedMinutes: number | null) {
  if (!assigneeId || estimatedMinutes == null || !Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0) return null
  return { userId: assigneeId, estimatedMinutes }
}

/** Older manual creations saved only the ticket-wide estimate. Keep it visible
 * until the first personal-estimate write persists it; explicit personal rows win. */
export function personalEstimatesWithCreationFallback<T extends {
  userId: string; estimatedMinutes: number | null; targetDateIso: string | null
}>(estimates: T[], assigneeId: string | null, estimatedMinutes: number | null) {
  if (estimates.length) return estimates
  const initial = creationEstimate(assigneeId, estimatedMinutes)
  return initial ? [{ ...initial, targetDateIso: null }] : []
}
