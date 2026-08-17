export type CheckState = "pending" | "passing" | "failing"

const TTL_MS = 60_000
const cache = new Map<string, { state: CheckState | null; at: number }>()

const FAILING_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "action_required"])

/** GET a GitHub API resource; null when inaccessible to the token (403/404). */
async function fetchGitHub<T>(url: string, token: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  })
  if (res.status === 403 || res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}`)
  return (await res.json()) as T
}

async function fromCheckRuns(repo: string, ref: string, token: string): Promise<CheckState | null> {
  const data = await fetchGitHub<{
    check_runs?: Array<{ status: string; conclusion: string | null }>
  }>(
    `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}/check-runs?per_page=100`,
    token,
  )
  const runs = data?.check_runs ?? []
  if (runs.length === 0) return null
  if (runs.some((r) => r.conclusion && FAILING_CONCLUSIONS.has(r.conclusion))) return "failing"
  if (runs.every((r) => r.status === "completed")) return "passing"
  return "pending"
}

/** Fallback for CI systems (e.g. Vercel) that report via the commit-status API instead of check runs. */
async function fromCommitStatus(repo: string, ref: string, token: string): Promise<CheckState | null> {
  const data = await fetchGitHub<{ state?: string; statuses?: unknown[] }>(
    `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}/status`,
    token,
  )
  if (!data?.statuses?.length) return null
  if (data.state === "success") return "passing"
  if (data.state === "pending") return "pending"
  return "failing"
}

/**
 * First concrete owner/name from GITHUB_REPO, for callers that don't know the
 * repo (legacy). Prefer passing `repository` explicitly under multi-repo setups.
 */
function defaultRepo(): string | null {
  const entry = (process.env.GITHUB_REPO ?? "")
    .split(",")
    .map((r) => r.trim())
    .find((r) => r.length > 0 && !r.endsWith("/*"))
  return entry ?? null
}

/**
 * Fetches combined CI state for a git ref (branch): check runs first (GitHub
 * Actions and app-based CI), falling back to commit statuses (Vercel and other
 * legacy-API reporters). Returns null when the integration is unconfigured or
 * neither API has data for the ref. Results are cached for 60s.
 *
 * @param ref - branch or commit SHA
 * @param repository - optional owner/name; defaults to the first concrete GITHUB_REPO entry
 */
export async function getCheckState(
  ref: string,
  repository?: string | null,
): Promise<CheckState | null> {
  const token = process.env.GITHUB_TOKEN
  const repo = repository?.trim() || defaultRepo()
  if (!token || !repo) return null

  const cacheKey = `${repo}@${ref}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.state

  const refresh = (async (): Promise<CheckState | null> => {
    try {
      const state =
        (await fromCheckRuns(repo, ref, token)) ?? (await fromCommitStatus(repo, ref, token))
      cache.set(cacheKey, { state, at: Date.now() })
      return state
    } catch (err) {
      console.error("[github checks] fetch failed:", err)
      return hit?.state ?? null
    }
  })()

  // Never let a slow GitHub API block the caller (ticket detail waits on this):
  // after 1.5s answer with the last known state; the in-flight fetch still
  // completes and refreshes the cache for the next request.
  return Promise.race([
    refresh,
    new Promise<CheckState | null>((resolve) =>
      setTimeout(() => resolve(hit?.state ?? null), 1500),
    ),
  ])
}
