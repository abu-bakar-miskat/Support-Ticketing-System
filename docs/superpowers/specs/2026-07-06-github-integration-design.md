# GitHub Integration — Design

**Date:** 2026-07-06
**Status:** Approved
**Scope:** Link GitHub PRs/commits to tickets and auto-update ticket status via webhooks, for the single repo `PlanetEducationNetworks/PEN-Ticketing-System`.

## Goals

1. **Link tickets to PRs/commits** — devs reference a ticket by its human ID (`<TEAM_PREFIX>-<ticketNumber>`, e.g. `TCK-42`) in a branch name, PR title, PR body, or commit message; the system links the PR/commit to the ticket automatically.
2. **Auto-update ticket status** — GitHub PR lifecycle events advance the ticket status using a fixed mapping.

Non-goals (v1): multi-repo support, GitHub App installation, two-way sync with GitHub Issues, creating branches/PRs from tickets, writing anything to GitHub.

## Architecture

GitHub pushes events to a single webhook endpoint. All linking and status logic runs synchronously in that handler (payloads are small; well under GitHub's 10s timeout). A fine-grained read-only PAT is used only for (a) a one-time backfill of existing open PRs and (b) fetching CI check status when rendering the ticket page.

```
GitHub repo ──webhook (pull_request, push)──▶ POST /api/webhooks/github
                                                │ verify HMAC signature
                                                │ parse ticket refs (PREFIX-N)
                                                │ upsert PR / commit records
                                                │ link to tickets
                                                ▼ apply status mapping (forward-only)
Ticket page ◀── "Development" section ◀── GitHubPullRequest / GitHubCommit tables
                     └── live CI check status via GITHUB_TOKEN (short cache)
```

## Data model (Prisma)

```prisma
enum GitHubPRState {
  draft
  open
  merged
  closed
}

model GitHubPullRequest {
  id          String        @id @default(cuid())
  number      Int           @unique // repo is fixed, so PR number is unique
  title       String
  url         String
  branch      String
  authorLogin String
  state       GitHubPRState
  mergedAt    DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  tickets TicketPullRequest[]
}

model TicketPullRequest {
  ticketId String
  prId     String

  ticket Ticket            @relation(fields: [ticketId], references: [id])
  pr     GitHubPullRequest @relation(fields: [prId], references: [id])

  @@id([ticketId, prId])
  @@index([prId])
}

model GitHubCommit {
  id          String   @id @default(cuid())
  sha         String
  message     String
  url         String
  authorLogin String
  ticketId    String
  createdAt   DateTime @default(now())

  ticket Ticket @relation(fields: [ticketId], references: [id])

  @@unique([sha, ticketId]) // one commit message may reference several tickets
  @@index([ticketId])
}
```

`Ticket` gains two relations: `pullRequests TicketPullRequest[]` and `commits GitHubCommit[]`.

## Webhook endpoint — `POST /api/webhooks/github`

**Security.** Verify the `X-Hub-Signature-256` header: HMAC-SHA256 of the raw request body keyed with `GITHUB_WEBHOOK_SECRET`, compared with `crypto.timingSafeEqual`. Mismatch or missing header → 401. The route requires no session auth (GitHub is the caller) and must read the raw body before JSON parsing.

**Response policy.** Return 200 for everything after signature verification — including unknown event types, PRs with no ticket refs, and refs that match no ticket. Non-2xx responses show as failures in GitHub's webhook dashboard and would be pure noise. Log skips server-side.

**Events handled:**

| Event | Actions |
|---|---|
| `pull_request`: `opened` | Upsert PR, parse refs from branch + title + body, link tickets, map status → In Progress (skipped for draft PRs) |
| `pull_request`: `edited` | Re-parse refs (title/body may have changed), add new links (never remove), update stored title |
| `pull_request`: `ready_for_review` | State → open, map status → In Review |
| `pull_request`: `converted_to_draft` | State → draft (no status change) |
| `pull_request`: `reopened` | State → open/draft (no status change) |
| `pull_request`: `closed` | If `merged`: state → merged, set `mergedAt`, map status → Done. Else: state → closed, no status change |
| `push` | For each commit whose message contains a ticket ref: upsert `GitHubCommit`, link to ticket. No status change |

Everything else → 200, ignored.

**Idempotency.** PRs are upserted by `number`, commits by `(sha, ticketId)`, links by composite PK. GitHub webhook redeliveries are safe to replay.

## Ticket reference parsing

- Regex: `/\b([A-Z][A-Z0-9]*)-(\d+)\b/g` applied case-insensitively to branch name, PR title, PR body, and commit messages; matches are uppercased before lookup.
- Resolution: match `Team.prefix` (unique) to the first capture group, then `Ticket` by `@@unique([teamId, ticketNumber])`. Soft-deleted tickets (`deletedAt != null`) are skipped.
- Unmatched refs are ignored silently (logged server-side).

## Status mapping

Fixed mapping, applied per linked ticket:

| GitHub event | Target status label |
|---|---|
| PR opened (non-draft) | `In Progress` |
| PR ready for review | `In Review` |
| PR merged | `Done` |

**Guards** (both derived from existing codebase constraints):

1. **Forward-only, exact-label match.** Look up the team's `TeamStatus` list ordered by `order`. The move happens only if a status with the exact target label exists **and** its order is strictly greater than the current status's order. Otherwise skip silently. This means: no invented statuses, no backward moves (a reopened PR never regresses a Done ticket), and teams that renamed their statuses simply opt out of automation.
2. **Intake tickets are never auto-completed.** Completing an intake-linked ticket requires a human resolution note (existing rule in `src/app/api/tickets/[id]/status/route.ts`), so the merged→Done move is skipped when `ticket.intake` exists. The PR still shows as merged in the Development section.

**Completion side effects** (when the target status has `isComplete: true`): set `closedAt` (preserving an earlier value, matching existing behavior), call the existing `notifyTicketCompletion` and `cascadeCompleteToSubtickets` helpers with the ticket creator as actor. The status write itself goes through a plain Prisma update; the existing DB trigger writes the `STATUS_CHANGED` ActivityLog entry, attributing it to the ticket creator via its built-in fallback (no `app.current_user_id` set). The webhook intentionally bypasses the sequential-transition rule enforced by the user-facing status route — that rule exists for the human workflow UI; the webhook may jump e.g. Not Started → Done on merge.

The mapping/guard logic lives in `src/lib/github/` (pure functions where possible) so it is unit-testable without HTTP.

## UI — "Development" section on the ticket page

A server-rendered section on the ticket detail page, hidden when the ticket has no linked PRs or commits. Shows:

- Each linked PR: state badge (draft/open/merged/closed, colored), title, PR number as external link, branch name, author login.
- For open PRs: CI check status (pass/fail/pending), fetched server-side via `GITHUB_TOKEN` from the checks API with a short cache (~60s) to stay off rate limits.
- Linked commits: short SHA (external link), first line of message, author.

Follows the existing ticket-page section component patterns.

## Token, backfill, configuration

**`GITHUB_TOKEN`** — fine-grained PAT scoped to this one repo, read-only (Pull requests: read, Checks: read). Used only for backfill and check-status reads. If unset, the integration still works webhook-only; check status is simply omitted.

**Backfill** — an admin-only API route (guarded by the existing admin auth pattern) that pages through the repo's open PRs via the REST API and runs each through the same parse-and-link pipeline. Run once after deploy; safe to re-run.

**Env vars:**

| Var | Purpose |
|---|---|
| `GITHUB_WEBHOOK_SECRET` | HMAC secret shared with the repo webhook |
| `GITHUB_TOKEN` | Fine-grained read-only PAT (optional but recommended) |
| `GITHUB_REPO` | `PlanetEducationNetworks/PEN-Ticketing-System` — used by backfill/checks API calls and to ignore webhook payloads from any other repo |

**Repo-side setup (manual, documented in README):** add a webhook — payload URL `<deployed-origin>/api/webhooks/github`, content type `application/json`, the shared secret, events: *Pull requests* and *Pushes*.

## Error handling

- Bad/missing signature → 401. Malformed JSON after valid signature → 400 (should not happen).
- Payloads whose repo ≠ `GITHUB_REPO` → 200, ignored.
- Per-ticket status-mapping failures (e.g. concurrent status change) are caught per ticket and logged; they never fail the webhook response or affect other linked tickets.
- GitHub API failures during check-status rendering degrade gracefully (section renders without check info).

## Testing (vitest, following existing route-test patterns)

- **Unit:** signature verification (valid/invalid/missing), ref parsing (branch, title, body, multi-ref, case-insensitivity, no-match), forward-only status guard (missing label, backward move, exact-label match, intake skip).
- **Handler (mocked Prisma):** PR opened → linked + In Progress; merged → Done + `closedAt` + completion helpers called; merged on intake ticket → no status change; redelivery → idempotent; unknown event → 200; wrong repo → ignored.

## Dev conventions note

Per `AGENTS.md`, this Next.js version has breaking changes — read the relevant guides in `node_modules/next/dist/docs/` (route handlers, raw body access) before implementation.

## Future extensions (explicitly out of scope)

Upgrade path to a GitHub App (multi-repo/org-wide) keeps the webhook handler, parsing, and data model unchanged — only authentication and webhook registration change.
