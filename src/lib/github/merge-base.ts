/**
 * Classifies a PR merge base branch for ticket status automation.
 * - live → ship path (main / master / modifications)
 * - dev  → review path (dev, or any branch whose name starts with "dev")
 * - null → no automatic status change
 */
export type MergeBaseKind = "live" | "dev"

const LIVE_BASES = new Set(["main", "master", "modifications"])

export function classifyMergedBase(
  baseRef: string | null | undefined,
): MergeBaseKind | null {
  if (!baseRef) return null
  const lower = baseRef.trim().toLowerCase()
  if (!lower) return null
  if (LIVE_BASES.has(lower)) return "live"
  // "dev", "develop", "development", "dev-foo", "dev/staging", …
  if (lower === "dev" || lower.startsWith("dev")) return "dev"
  return null
}
