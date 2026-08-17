import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { verifyGitHubSignature } from "@/lib/github/verify-signature"
import {
  upsertAndLinkPullRequest,
  type GitHubApiPullRequest,
} from "@/lib/github/upsert-pr"
import { advanceTicketStatus } from "@/lib/github/advance-status"
import { broadcastGithubChange } from "@/lib/github/broadcast"
import { classifyMergedBase } from "@/lib/github/merge-base"
import type { GitHubStatusEvent } from "@/lib/github/status-map"
import { parseTicketRefs } from "@/lib/github/parse-refs"
import { resolveTicketIds } from "@/lib/github/resolve-refs"

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: "GITHUB_WEBHOOK_SECRET not configured" },
      { status: 503 },
    )
  }

  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256")
  if (!verifyGitHubSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const repo = (payload.repository as { full_name?: string } | undefined)?.full_name
  // GITHUB_REPO is a comma-separated list of "owner/name" repos; "owner/*"
  // allows every repo under that owner (org-level webhook)
  const allowedRepos = (process.env.GITHUB_REPO ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
  const repoAllowed =
    !!repo &&
    allowedRepos.some(
      (allowed) =>
        allowed === repo ||
        (allowed.endsWith("/*") && repo.startsWith(allowed.slice(0, -1))),
    )
  if (!repoAllowed) {
    return NextResponse.json({ ok: true, skipped: "repository not configured" })
  }

  const event = request.headers.get("x-github-event")
  if (event === "pull_request") return handlePullRequest(payload)
  if (event === "push") return handlePush(payload)
  return NextResponse.json({ ok: true, skipped: `unhandled event: ${event}` })
}

function targetEventFor(
  action: unknown,
  pr: GitHubApiPullRequest,
): GitHubStatusEvent | null {
  if (action === "opened" && !pr.draft) return "prOpened"
  if (action === "ready_for_review") return "prReadyForReview"
  if (action === "closed" && pr.merged_at) {
    const kind = classifyMergedBase(pr.base?.ref)
    if (kind === "live") return "prMerged"
    if (kind === "dev") return "prMergedToDev"
    return null
  }
  return null
}

async function handlePullRequest(payload: Record<string, unknown>) {
  const pr = payload.pull_request as GitHubApiPullRequest
  const repository = (payload.repository as { full_name?: string } | undefined)
    ?.full_name
  const { prId, ticketIds } = await upsertAndLinkPullRequest(pr, repository)

  // Every ticket ever linked to this PR — status advance and the realtime
  // broadcast both apply to the full set, not just this payload's parsed refs.
  const links = await prisma.ticketPullRequest.findMany({
    where: { prId },
    select: { ticketId: true },
  })
  const linkedTicketIds = links.map((link) => link.ticketId)

  const event = targetEventFor(payload.action, pr)
  if (event) {
    await Promise.all(
      linkedTicketIds.map((ticketId) =>
        advanceTicketStatus(ticketId, event, pr.base?.ref).catch((err) =>
          console.error(
            `[github webhook] status update failed for ticket ${ticketId}:`,
            err,
          ),
        ),
      ),
    )
  }

  // Refresh any open ticket views (PR state pill, checks, etc.)
  await broadcastGithubChange(linkedTicketIds)

  return NextResponse.json({ ok: true, linked: ticketIds.length })
}

type PushCommit = {
  id: string
  message: string
  url: string
  author?: { username?: string; name?: string }
}

async function handlePush(payload: Record<string, unknown>) {
  const commits = (payload.commits ?? []) as PushCommit[]
  let linked = 0
  const affectedTicketIds = new Set<string>()
  for (const commit of commits) {
    const refs = parseTicketRefs(commit.message)
    if (refs.length === 0) continue
    const ticketIds = await resolveTicketIds(refs)
    if (ticketIds.length === 0) continue
    await prisma.gitHubCommit.createMany({
      data: ticketIds.map((ticketId) => ({
        sha: commit.id,
        message: commit.message,
        url: commit.url,
        authorLogin: commit.author?.username ?? commit.author?.name ?? "",
        ticketId,
      })),
      skipDuplicates: true,
    })
    for (const ticketId of ticketIds) affectedTicketIds.add(ticketId)
    linked += ticketIds.length
  }

  // Refresh any open ticket views showing these commits
  await broadcastGithubChange([...affectedTicketIds])

  return NextResponse.json({ ok: true, linked })
}
