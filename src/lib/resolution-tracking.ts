/**
 * Status-update helpers. SLA final outcomes belong to sla-engine.ts and manual
 * tracked-work outcomes to manual-resolution.ts. The wall-clock fallback here
 * remains for tickets without a formal SLA; it is not an SLA calculation.
 */

/**
 * The ticket's allowed resolution time, in minutes. Prefers the matched SLA
 * policy's `resolutionTargetMins` (the formal target); falls back to the
 * per-ticket `estimatedTime`. Returns null when neither is set — in which case
 * no within/exceeded verdict can be recorded.
 */
export function resolveAllowedResolutionMins(
  slaResolutionTargetMins: number | null | undefined,
  estimatedTime: number | null | undefined,
): number | null {
  if (typeof slaResolutionTargetMins === "number") return slaResolutionTargetMins
  if (typeof estimatedTime === "number") return estimatedTime
  return null
}

import { normalizeStatus } from "@/components/board/board-types"

export type ResolutionOutcome = {
  /** Whole minutes elapsed from In Progress → resolution; null if not measurable. */
  resolutionDurationMins: number | null
  /** true = within allowed time, false = exceeded, null = no start or no allowed target. */
  resolvedWithinAllowed: boolean | null
}

/**
 * Computes the resolution outcome from the saved start/end times and the
 * allowed target. Duration is measured from the saved `inProgressStartedAt` to
 * the saved `resolvedAt` (the ticket's closedAt) — never re-derived from any
 * other clock, per the requirement that the calculation use the saved times.
 *
 * When `inProgressStartedAt` is null (the ticket never passed through
 * In Progress) the duration is unmeasurable and both fields are null.
 */
export function computeResolutionOutcome(params: {
  inProgressStartedAt: Date | null | undefined
  resolvedAt: Date
  allowedMins: number | null
}): ResolutionOutcome {
  const { inProgressStartedAt, resolvedAt, allowedMins } = params
  if (!inProgressStartedAt) {
    return { resolutionDurationMins: null, resolvedWithinAllowed: null }
  }

  const elapsedMs = resolvedAt.getTime() - inProgressStartedAt.getTime()
  const resolutionDurationMins = Math.max(0, Math.round(elapsedMs / 60_000))

  const resolvedWithinAllowed =
    allowedMins === null ? null : Math.max(0, elapsedMs) <= allowedMins * 60_000

  return { resolutionDurationMins, resolvedWithinAllowed }
}

/** Partial Ticket update produced by a status change, for the resolution timer. */
export type ResolutionUpdate = {
  inProgressStartedAt?: Date
  resolutionDurationMins?: number | null
  resolvedWithinAllowed?: boolean | null
}

/**
 * Single source of truth for how a status change affects the resolution timer,
 * shared by every route that can change a ticket's status (`/status`, `/move`,
 * generic `PATCH`, escalate). Returns the fields to merge into the ticket
 * update — empty when the change is neither an In Progress entry nor a
 * completion.
 *
 *  - Entering "In Progress" for the first time (no saved start yet): stamp the
 *    start time and clear any prior result so a fresh measurement begins.
 *  - Reaching a completion status: compute the total resolution time from the
 *    saved start → the saved completion time (`newClosedAt`) and whether it beat
 *    the estimate for tickets without a formal SLA. SLA targets defer to the
 *    shared lifecycle hook, which uses calendar/pause-aware elapsed time.
 */
export function resolutionUpdateOnStatusChange(params: {
  toStatus: string
  isCompletion: boolean
  newClosedAt: Date | null
  currentInProgressStartedAt: Date | null
  slaResolutionTargetMins: number | null | undefined
  estimatedTime: number | null | undefined
  now?: Date
}): ResolutionUpdate {
  const {
    toStatus,
    isCompletion,
    newClosedAt,
    currentInProgressStartedAt,
    slaResolutionTargetMins,
    estimatedTime,
    now = new Date(),
  } = params

  const enteringInProgress = normalizeStatus(toStatus) === "In Progress"

  if (enteringInProgress && currentInProgressStartedAt === null) {
    return {
      inProgressStartedAt: now,
      resolutionDurationMins: null,
      resolvedWithinAllowed: null,
    }
  }

  if (isCompletion && newClosedAt) {
    // SLA completion is calculated by the shared lifecycle hook using its saved
    // calendar and customer waits. Do not overwrite it with wall-clock time.
    if (typeof slaResolutionTargetMins === "number") return {}
    const allowedMins = resolveAllowedResolutionMins(slaResolutionTargetMins, estimatedTime)
    const { resolutionDurationMins, resolvedWithinAllowed } = computeResolutionOutcome({
      inProgressStartedAt: currentInProgressStartedAt,
      resolvedAt: newClosedAt,
      allowedMins,
    })
    return { resolutionDurationMins, resolvedWithinAllowed }
  }

  return {}
}
