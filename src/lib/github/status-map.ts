export type TeamStatusRow = { label: string; order: number; isComplete: boolean }

/**
 * Decides whether a webhook may move a ticket to targetLabel.
 * Forward-only within the team's configured status order; exact label match;
 * never auto-completes intake-linked tickets (they require a resolution note).
 * Returns null when the move must be skipped.
 */
export function pickStatusMove(
  currentStatus: string,
  targetLabel: string,
  statuses: TeamStatusRow[],
  hasIntake: boolean,
): { label: string; isComplete: boolean } | null {
  const current = statuses.find((s) => s.label === currentStatus)
  const target = statuses.find((s) => s.label === targetLabel)
  if (!current || !target) return null
  if (target.order <= current.order) return null
  if (target.isComplete && hasIntake) return null
  return { label: target.label, isComplete: target.isComplete }
}

export type GitHubStatusEvent =
  | "prOpened"
  | "prReadyForReview"
  | "prMerged"
  | "prMergedToDev"

export type TeamGitHubMapRow = {
  onPrOpened: string | null
  onPrReadyForReview: string | null
  onPrMerged: string | null
}

const REVIEW_ALIASES = ["in review", "review", "code review", "pull request"]

function resolveReviewLabel(statuses: TeamStatusRow[]): string | null {
  const lower = (l: string) => l.toLowerCase()
  for (const alias of REVIEW_ALIASES) {
    const match = statuses.find((s) => !s.isComplete && lower(s.label) === alias)
    if (match) return match.label
  }
  return null
}

function resolveLiveLabel(statuses: TeamStatusRow[]): string | null {
  const lower = (l: string) => l.toLowerCase()
  return (
    statuses.find((s) => lower(s.label) === "live")?.label ??
    statuses.find((s) => s.isComplete)?.label ??
    null
  )
}

function overrideFor(
  event: GitHubStatusEvent,
  config: TeamGitHubMapRow | null,
): string | null | undefined {
  if (!config) return undefined
  if (event === "prOpened") return config.onPrOpened
  if (event === "prReadyForReview") return config.onPrReadyForReview
  if (event === "prMerged") return config.onPrMerged
  // prMergedToDev has no dedicated override field — always uses review default
  return undefined
}

/**
 * Resolves which status label a GitHub event should target for a team.
 * Override semantics: null = smart default, "" = disabled, other = exact
 * label (skipped if it no longer exists). Defaults: opened -> "In Progress";
 * ready for review / merge into a dev* branch -> first non-complete review
 * alias; merge into main/master/modifications -> "Live" (else first complete).
 * `statuses` must be ordered by `order` ascending.
 */
export function resolveTargetLabel(
  event: GitHubStatusEvent,
  statuses: TeamStatusRow[],
  config: TeamGitHubMapRow | null,
): string | null {
  const override = overrideFor(event, config)
  if (override !== undefined) {
    if (override === null) {
      // fall through to smart default below
    } else if (override === "") {
      return null
    } else {
      return statuses.some((s) => s.label === override) ? override : null
    }
  }

  const lower = (l: string) => l.toLowerCase()
  if (event === "prOpened") {
    return statuses.find((s) => lower(s.label) === "in progress")?.label ?? null
  }
  if (event === "prReadyForReview" || event === "prMergedToDev") {
    return resolveReviewLabel(statuses)
  }
  return resolveLiveLabel(statuses)
}
