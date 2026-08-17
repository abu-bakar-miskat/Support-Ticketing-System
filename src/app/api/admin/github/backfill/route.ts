import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import {
  upsertAndLinkPullRequest,
  type GitHubApiPullRequest,
} from "@/lib/github/upsert-pr"

/** Concrete owner/name entries from GITHUB_REPO (skips owner/* wildcards). */
function concreteRepos(): string[] {
  return (process.env.GITHUB_REPO ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && !r.endsWith("/*"))
}

/**
 * One-time (re-runnable) backfill: pages through each configured repo's open
 * PRs and runs each through the same parse-and-link pipeline as the webhook.
 * Links only — never changes ticket status.
 */
export async function POST() {
  const { error } = await requireAdmin()
  if (error) return error

  const token = process.env.GITHUB_TOKEN
  const repos = concreteRepos()
  if (!token || repos.length === 0) {
    return NextResponse.json(
      {
        error:
          "GITHUB_TOKEN and at least one concrete GITHUB_REPO entry must be configured",
      },
      { status: 503 },
    )
  }

  let processed = 0
  let linked = 0
  for (const repo of repos) {
    let page = 1
    for (;;) {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/pulls?state=open&per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          cache: "no-store",
        },
      )
      if (!res.ok) {
        return NextResponse.json(
          { error: `GitHub API responded ${res.status} for ${repo}` },
          { status: 502 },
        )
      }
      const prs = (await res.json()) as GitHubApiPullRequest[]
      for (const pr of prs) {
        const result = await upsertAndLinkPullRequest(pr, repo)
        processed += 1
        linked += result.ticketIds.length
      }
      if (prs.length < 100) break
      page += 1
    }
  }

  return NextResponse.json({ ok: true, processed, linked, repos: repos.length })
}
