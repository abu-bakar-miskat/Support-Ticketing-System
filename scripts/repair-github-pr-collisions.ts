/**
 * One-off repair after multi-repo PR number collisions.
 *
 * 1. Unlinks TicketPullRequest rows where the ticket ref is not in the PR
 *    title/branch AND the ticket has no commits under that PR's repository.
 * 2. Recreates merged PRs from "Merge pull request #N" commits and re-links
 *    tickets referenced in those commit messages.
 *
 * Does NOT change ticket status (avoid firing completion notifications).
 */
import { config } from "dotenv"
config({ path: ".env" })
config({ path: ".env.local", override: true })

import { prisma } from "../src/lib/db"
import { parseTicketRefs } from "../src/lib/github/parse-refs"
import { resolveTicketIds } from "../src/lib/github/resolve-refs"
import { repoFromGitHubUrl } from "../src/lib/github/repo-from-url"

const MERGE_PR_RE = /Merge pull request #(\d+)\b/i

async function unlinkMismatched() {
  const links = await prisma.ticketPullRequest.findMany({
    select: {
      ticketId: true,
      prId: true,
      pr: { select: { repository: true, title: true, branch: true } },
      ticket: {
        select: {
          ticketNumber: true,
          team: { select: { prefix: true } },
          commits: { select: { url: true } },
        },
      },
    },
  })

  const toDelete: Array<{ ticketId: string; prId: string }> = []
  for (const link of links) {
    const humanId = `${link.ticket.team.prefix}-${link.ticket.ticketNumber}`
    const mentioned = parseTicketRefs(link.pr.title, link.pr.branch).some(
      (r) => `${r.prefix}-${r.number}` === humanId,
    )
    if (mentioned) continue

    const commitRepos = new Set(
      link.ticket.commits
        .map((c) => repoFromGitHubUrl(c.url))
        .filter((r): r is string => !!r),
    )
    if (commitRepos.has(link.pr.repository)) continue

    toDelete.push({ ticketId: link.ticketId, prId: link.prId })
  }

  if (toDelete.length === 0) {
    console.log("unlink: nothing to remove")
    return 0
  }

  await prisma.ticketPullRequest.deleteMany({
    where: {
      OR: toDelete.map((row) => ({
        ticketId: row.ticketId,
        prId: row.prId,
      })),
    },
  })
  console.log(`unlink: removed ${toDelete.length} mismatched link(s)`)
  return toDelete.length
}

async function recreateFromMergeCommits() {
  const commits = await prisma.gitHubCommit.findMany({
    where: { message: { contains: "Merge pull request #" } },
    select: {
      message: true,
      url: true,
      authorLogin: true,
      createdAt: true,
      ticketId: true,
    },
  })

  type PrDraft = {
    repository: string
    number: number
    title: string
    branch: string
    authorLogin: string
    mergedAt: Date
    ticketIds: Set<string>
  }

  const drafts = new Map<string, PrDraft>()
  const allRefs = parseTicketRefs(...commits.map((c) => c.message))

  for (const commit of commits) {
    const match = commit.message.match(MERGE_PR_RE)
    const repository = repoFromGitHubUrl(commit.url)
    if (!match || !repository) continue

    const number = parseInt(match[1], 10)
    const key = `${repository}#${number}`
    let draft = drafts.get(key)
    if (!draft) {
      const lines = commit.message
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
      const title =
        lines.find(
          (l) => !MERGE_PR_RE.test(l) && !l.startsWith("Merge pull request"),
        ) ??
        lines[0] ??
        `Merge pull request #${number}`
      const branchMatch = commit.message.match(
        /Merge pull request #\d+ from (?:[\w.-]+\/)?([\w./-]+)/i,
      )
      draft = {
        repository,
        number,
        title,
        branch: branchMatch?.[1] ?? "unknown",
        authorLogin: commit.authorLogin,
        mergedAt: commit.createdAt,
        ticketIds: new Set(),
      }
      drafts.set(key, draft)
    }
    draft.ticketIds.add(commit.ticketId)
    for (const ref of parseTicketRefs(commit.message)) {
      // ticket IDs resolved below via human-id map
      draft.ticketIds.add(`ref:${ref.prefix}-${ref.number}`)
    }
  }

  const resolvedIds = await resolveTicketIds(allRefs)
  // resolveTicketIds returns ids only — rebuild human→id via DB
  const tickets = await prisma.ticket.findMany({
    where: { id: { in: resolvedIds }, deletedAt: null },
    select: {
      id: true,
      ticketNumber: true,
      team: { select: { prefix: true } },
    },
  })
  const idByHuman = new Map(
    tickets.map((t) => [`${t.team.prefix}-${t.ticketNumber}`, t.id]),
  )

  const draftList = [...drafts.values()]
  console.log(`recreate: upserting ${draftList.length} PR(s)…`)

  let upserted = 0
  let linked = 0

  for (let i = 0; i < draftList.length; i++) {
    const draft = draftList[i]
    const record = await prisma.gitHubPullRequest.upsert({
      where: {
        repository_number: {
          repository: draft.repository,
          number: draft.number,
        },
      },
      create: {
        repository: draft.repository,
        number: draft.number,
        title: draft.title,
        url: `https://github.com/${draft.repository}/pull/${draft.number}`,
        branch: draft.branch,
        baseBranch: null,
        authorLogin: draft.authorLogin,
        state: "merged",
        mergedAt: draft.mergedAt,
        ghCreatedAt: draft.mergedAt,
      },
      update: {},
    })
    upserted += 1

    const ticketIds = [
      ...new Set(
        [...draft.ticketIds].map((id) => {
          if (id.startsWith("ref:")) {
            return idByHuman.get(id.slice(4))
          }
          return id
        }),
      ),
    ].filter((id): id is string => !!id)

    if (ticketIds.length > 0) {
      const result = await prisma.ticketPullRequest.createMany({
        data: ticketIds.map((ticketId) => ({
          ticketId,
          prId: record.id,
        })),
        skipDuplicates: true,
      })
      linked += result.count
    }

    if ((i + 1) % 50 === 0 || i + 1 === draftList.length) {
      console.log(`recreate: ${i + 1}/${draftList.length}`)
    }
  }

  console.log(
    `recreate: upserted ${upserted} PR(s), linked ${linked} new ticket row(s)`,
  )
}

async function main() {
  await unlinkMismatched()
  await recreateFromMergeCommits()

  const ticket = await prisma.ticket.findFirst({
    where: { ticketNumber: 168, team: { prefix: "PHP" }, deletedAt: null },
    select: {
      status: true,
      pullRequests: {
        select: {
          pr: {
            select: {
              repository: true,
              number: true,
              title: true,
              url: true,
            },
          },
        },
      },
    },
  })
  console.log("PHP-168 after repair:", JSON.stringify(ticket, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
