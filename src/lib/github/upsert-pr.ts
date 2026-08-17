import { prisma } from "@/lib/db"
import { parseTicketRefs } from "./parse-refs"
import { resolveTicketIds } from "./resolve-refs"
import { repoFromGitHubUrl } from "./repo-from-url"

// String union matching the GitHubPRState Prisma enum
export type GitHubPRStateValue = "draft" | "open" | "merged" | "closed"

/** Shared shape of PR objects from webhook payloads and the REST API. */
export type GitHubApiPullRequest = {
  number: number
  title: string
  html_url: string
  body?: string | null
  draft?: boolean
  state: string
  merged_at: string | null
  created_at?: string | null
  head: { ref: string }
  base?: { ref?: string | null } | null
  user?: { login?: string | null } | null
}

export function prState(pr: GitHubApiPullRequest): GitHubPRStateValue {
  if (pr.merged_at) return "merged"
  if (pr.state === "closed") return "closed"
  if (pr.draft) return "draft"
  return "open"
}

/**
 * Resolves the canonical owner/name for a PR. Prefer the webhook/API
 * repository full_name; fall back to parsing html_url.
 */
export function resolvePullRequestRepository(
  pr: GitHubApiPullRequest,
  repository?: string | null,
): string {
  const fromArg = repository?.trim()
  if (fromArg) return fromArg
  const fromUrl = repoFromGitHubUrl(pr.html_url)
  if (fromUrl) return fromUrl
  throw new Error(
    `Cannot resolve repository for PR #${pr.number} (missing repository and unparseable html_url)`,
  )
}

/**
 * Upserts the PR record (idempotent by repository + PR number) and links
 * every ticket referenced in its branch name, title, or body. Links are
 * additive — a later edit never removes earlier links.
 */
export async function upsertAndLinkPullRequest(
  pr: GitHubApiPullRequest,
  repository?: string | null,
): Promise<{ prId: string; ticketIds: string[] }> {
  const repo = resolvePullRequestRepository(pr, repository)
  const data = {
    title: pr.title,
    url: pr.html_url,
    branch: pr.head.ref,
    baseBranch: pr.base?.ref ?? null,
    authorLogin: pr.user?.login ?? "",
    state: prState(pr),
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
    ghCreatedAt: pr.created_at ? new Date(pr.created_at) : null,
  }
  const record = await prisma.gitHubPullRequest.upsert({
    where: {
      repository_number: { repository: repo, number: pr.number },
    },
    create: { repository: repo, number: pr.number, ...data },
    update: data,
  })

  const refs = parseTicketRefs(pr.head.ref, pr.title, pr.body)
  const ticketIds = await resolveTicketIds(refs)
  if (ticketIds.length > 0) {
    await prisma.ticketPullRequest.createMany({
      data: ticketIds.map((ticketId) => ({ ticketId, prId: record.id })),
      skipDuplicates: true,
    })
  }
  return { prId: record.id, ticketIds }
}
