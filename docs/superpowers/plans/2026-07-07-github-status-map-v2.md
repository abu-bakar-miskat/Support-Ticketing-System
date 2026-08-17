# GitHub Status Mapping v2 + Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Smart default status resolution per team + per-team override config UI, and the Development section in the board drawer. Spec: `docs/superpowers/specs/2026-07-07-github-status-map-v2-design.md`.

**Architecture:** Pure resolver in `status-map.ts` consumes the team's ordered statuses + optional `TeamGitHubStatusMap` row; `advanceTicketStatus` becomes event-based; the drawer gets data through `getTicketDetailPayload` via a shared `buildGitHubDevData` helper.

**Tech Stack:** Next.js 16.2.7 App Router, Prisma 7 (client generated to `src/generated/prisma`), vitest.

## Global Constraints

- **Migrations:** the dev DB has drift — NEVER run `prisma migrate dev` (it demands a destructive reset). Use the drift-safe flow shown in Task 1 (`migrate diff --from-schema/--to-schema` → `db execute` → `migrate resolve --applied`). Never accept a reset.
- **Tests:** `npm test` has ~24 pre-existing failures — gate on focused test files + no NEW failures. Colocated `*.test.ts`, run `npx vitest run <path>`. Mock `@/lib/db` with `vi.mock` (house pattern).
- Path alias `@` → `src`. No new npm dependencies.
- Config field semantics (exact): `null` = smart default, `""` = disabled, other = exact status label.
- Review aliases (exact list, case-insensitive): "In Review", "Review", "Code Review", "Pull Request" — non-complete statuses only.
- Existing guards preserved: forward-only, exact current-status optimistic update, intake tickets never auto-completed.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (Team model ~line 157; new model after `TeamTicketCounter` ~line 328)

**Interfaces:**
- Produces: `prisma.teamGitHubStatusMap` delegate; `Team.githubStatusMap` relation (fetchable via `team: { select: { githubStatusMap: true } }`).

- [ ] **Step 1: Add the model and relation**

After the `TeamTicketCounter` model, add:

```prisma
model TeamGitHubStatusMap {
  teamId             String   @id
  onPrOpened         String?
  onPrReadyForReview String?
  onPrMerged         String?
  updatedAt          DateTime @updatedAt

  team Team @relation(fields: [teamId], references: [id])
}
```

In `model Team`, next to `counter TeamTicketCounter?`, add:

```prisma
  githubStatusMap   TeamGitHubStatusMap?
```

- [ ] **Step 2: Validate and migrate (drift-safe)**

```bash
npx prisma validate
git show HEAD:prisma/schema.prisma > /tmp/old-schema.prisma
mkdir -p prisma/migrations/20260707000000_github_status_map
npx prisma migrate diff --from-schema /tmp/old-schema.prisma --to-schema prisma/schema.prisma --script > prisma/migrations/20260707000000_github_status_map/migration.sql
```

Inspect the SQL: must be exactly one `CREATE TABLE "TeamGitHubStatusMap"` + one FK to `"Team"` — purely additive, no DROP/ALTER of existing objects. If not, STOP (report BLOCKED).

```bash
npx prisma db execute --file prisma/migrations/20260707000000_github_status_map/migration.sql
npx prisma migrate resolve --applied 20260707000000_github_status_map
npx prisma generate
```

- [ ] **Step 3: Verify no new test failures**

Run: `npm test` — failure set identical to baseline (~24 pre-existing).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: TeamGitHubStatusMap model for per-team GitHub status mapping"
```

---

### Task 2: Smart resolver (pure)

**Files:**
- Modify: `src/lib/github/status-map.ts`
- Test: `src/lib/github/status-map.test.ts` (append)

**Interfaces:**
- Consumes: existing `TeamStatusRow`.
- Produces: `type GitHubStatusEvent = "prOpened" | "prReadyForReview" | "prMerged"`; `type TeamGitHubMapRow = { onPrOpened: string | null; onPrReadyForReview: string | null; onPrMerged: string | null }`; `resolveTargetLabel(event: GitHubStatusEvent, statuses: TeamStatusRow[], config: TeamGitHubMapRow | null): string | null`. Keeps `pickStatusMove` unchanged. `GITHUB_TARGET_STATUS` is REMOVED (Task 3 removes its usages; this task keeps it exported until then — do not remove here).

- [ ] **Step 1: Append the failing tests**

Append to `status-map.test.ts`:

```ts
import { resolveTargetLabel, type TeamGitHubMapRow } from "./status-map"

const WEB_STATUSES = [
  { label: "To Do", order: 0, isComplete: false },
  { label: "In Progress", order: 1, isComplete: false },
  { label: "Pull Request", order: 2, isComplete: true },
  { label: "Blocked", order: 3, isComplete: false },
  { label: "Live", order: 4, isComplete: true },
]

const PHP_STATUSES = [
  { label: "To Do", order: 0, isComplete: false },
  { label: "In Progress", order: 1, isComplete: false },
  { label: "In Review", order: 2, isComplete: false },
  { label: "Live", order: 6, isComplete: true },
  { label: "Done", order: 7, isComplete: true },
]

describe("resolveTargetLabel — defaults (config null)", () => {
  it("prOpened resolves to In Progress case-insensitively", () => {
    expect(resolveTargetLabel("prOpened", PHP_STATUSES, null)).toBe("In Progress")
    expect(
      resolveTargetLabel(
        "prOpened",
        [{ label: "in progress", order: 0, isComplete: false }],
        null,
      ),
    ).toBe("in progress")
  })

  it("prOpened skips when the team has no In Progress", () => {
    expect(resolveTargetLabel("prOpened", [{ label: "Doing", order: 0, isComplete: false }], null)).toBeNull()
  })

  it("prReadyForReview matches the first non-complete review alias", () => {
    expect(resolveTargetLabel("prReadyForReview", PHP_STATUSES, null)).toBe("In Review")
  })

  it("prReadyForReview never picks a complete-flagged status (WEB's Pull Request)", () => {
    expect(resolveTargetLabel("prReadyForReview", WEB_STATUSES, null)).toBeNull()
  })

  it("prMerged prefers exact Done", () => {
    expect(resolveTargetLabel("prMerged", PHP_STATUSES, null)).toBe("Done")
  })

  it("prMerged falls back to the first complete status in order", () => {
    expect(resolveTargetLabel("prMerged", WEB_STATUSES, null)).toBe("Pull Request")
  })

  it("prMerged skips when nothing is complete-flagged", () => {
    expect(resolveTargetLabel("prMerged", [{ label: "To Do", order: 0, isComplete: false }], null)).toBeNull()
  })
})

describe("resolveTargetLabel — overrides", () => {
  const config: TeamGitHubMapRow = {
    onPrOpened: "Blocked",
    onPrReadyForReview: "",
    onPrMerged: null,
  }

  it("uses the configured label when set", () => {
    expect(resolveTargetLabel("prOpened", WEB_STATUSES, config)).toBe("Blocked")
  })

  it("empty string disables the event", () => {
    expect(resolveTargetLabel("prReadyForReview", WEB_STATUSES, config)).toBeNull()
  })

  it("null field falls through to the default", () => {
    expect(resolveTargetLabel("prMerged", WEB_STATUSES, config)).toBe("Pull Request")
  })

  it("a configured label that no longer exists resolves to skip", () => {
    expect(
      resolveTargetLabel("prOpened", WEB_STATUSES, { ...config, onPrOpened: "Ghost" }),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/lib/github/status-map.test.ts` — new tests FAIL (no export), existing 9 PASS.

- [ ] **Step 3: Implement**

Append to `status-map.ts`:

```ts
export type GitHubStatusEvent = "prOpened" | "prReadyForReview" | "prMerged"

export type TeamGitHubMapRow = {
  onPrOpened: string | null
  onPrReadyForReview: string | null
  onPrMerged: string | null
}

const REVIEW_ALIASES = ["in review", "review", "code review", "pull request"]

/**
 * Resolves which status label a GitHub event should target for a team.
 * Override semantics: null = smart default, "" = disabled, other = exact
 * label (skipped if it no longer exists). Defaults: opened -> "In Progress";
 * ready for review -> first non-complete review-alias status (a review
 * request must never auto-close a ticket); merged -> "Done" or the first
 * complete-flagged status in order (the sub-ticket cascade rule).
 * `statuses` must be ordered by `order` ascending.
 */
export function resolveTargetLabel(
  event: GitHubStatusEvent,
  statuses: TeamStatusRow[],
  config: TeamGitHubMapRow | null,
): string | null {
  const override = config?.[event === "prOpened" ? "onPrOpened" : event === "prReadyForReview" ? "onPrReadyForReview" : "onPrMerged"]
  if (override != null) {
    if (override === "") return null
    return statuses.some((s) => s.label === override) ? override : null
  }

  const lower = (l: string) => l.toLowerCase()
  if (event === "prOpened") {
    return statuses.find((s) => lower(s.label) === "in progress")?.label ?? null
  }
  if (event === "prReadyForReview") {
    for (const alias of REVIEW_ALIASES) {
      const match = statuses.find((s) => !s.isComplete && lower(s.label) === alias)
      if (match) return match.label
    }
    return null
  }
  return (
    statuses.find((s) => lower(s.label) === "done")?.label ??
    statuses.find((s) => s.isComplete)?.label ??
    null
  )
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `npx vitest run src/lib/github/status-map.test.ts` — 20 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/status-map.ts src/lib/github/status-map.test.ts
git commit -m "feat: smart per-team status resolution for GitHub events"
```

---

### Task 3: Event-based advance + webhook wiring

**Files:**
- Modify: `src/lib/github/advance-status.ts`, `src/lib/github/advance-status.test.ts`
- Modify: `src/app/api/webhooks/github/route.ts`, `src/app/api/webhooks/github/route.test.ts`

**Interfaces:**
- Consumes: `resolveTargetLabel`, `GitHubStatusEvent` from `./status-map`.
- Produces: `advanceTicketStatus(ticketId: string, event: GitHubStatusEvent): Promise<void>` (signature change). `GITHUB_TARGET_STATUS` removed from `status-map.ts` (this task deletes it and its imports).

- [ ] **Step 1: Update advance-status**

In `advance-status.ts`: change the signature to `(ticketId: string, event: GitHubStatusEvent)`; in the ticket query change `team: { select: { prefix: true } }` to `team: { select: { prefix: true, githubStatusMap: true } }`; after loading `statuses`, insert:

```ts
  const targetLabel = resolveTargetLabel(event, statuses, ticket.team.githubStatusMap)
  if (!targetLabel) return
```

and pass `targetLabel` to `pickStatusMove`. Import `resolveTargetLabel, type GitHubStatusEvent` from `./status-map`. Update the doc comment (event-based, resolution via team config/smart defaults).

- [ ] **Step 2: Update advance-status tests**

In `advance-status.test.ts`: `baseTicket.team` becomes `{ prefix: "DEV", githubStatusMap: null }`; STATUSES gains `{ label: "In Review", order: 1.5 ... }`? No — keep STATUSES as `Not Started/In Progress/Done` but call with events: replace every `advanceTicketStatus("ticket-1", "In Progress")` with `advanceTicketStatus("ticket-1", "prOpened")` and `"Done"` with `"prMerged"`. The backward-move test (`status: "Done"`, target In Progress) becomes: ticket status "Done", event "prOpened" — resolver returns "In Progress", guard rejects backward → same assertion. Add two new tests:

```ts
  it("respects a team override from githubStatusMap", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseTicket,
      team: { prefix: "DEV", githubStatusMap: { onPrOpened: "Done", onPrReadyForReview: null, onPrMerged: null } },
    } as never)
    await advanceTicketStatus("ticket-1", "prOpened")
    expect(mockUpdateMany.mock.calls[0][0].data.status).toBe("Done")
  })

  it("does nothing when the event is disabled by override", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseTicket,
      team: { prefix: "DEV", githubStatusMap: { onPrOpened: "", onPrReadyForReview: null, onPrMerged: null } },
    } as never)
    await advanceTicketStatus("ticket-1", "prOpened")
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })
```

Run: `npx vitest run src/lib/github/advance-status.test.ts` — 10 PASS.

- [ ] **Step 3: Update the webhook route**

In `route.ts`: remove the `GITHUB_TARGET_STATUS` import; change `targetStatusFor` to return `GitHubStatusEvent | null`:

```ts
function targetEventFor(action: unknown, pr: GitHubApiPullRequest): GitHubStatusEvent | null {
  if (action === "opened" && !pr.draft) return "prOpened"
  if (action === "ready_for_review") return "prReadyForReview"
  if (action === "closed" && pr.merged_at) return "prMerged"
  return null
}
```

and pass the event to `advanceTicketStatus(link.ticketId, event)`. In `status-map.ts` delete the now-unused `GITHUB_TARGET_STATUS` export and its test assertion (the "exports the fixed event-to-status mapping" test).

- [ ] **Step 4: Update webhook tests**

In `route.test.ts`, the advance assertions become events: `expect(mockAdvance).toHaveBeenCalledWith("ticket-1", "prOpened")` (opened), `"prReadyForReview"`, `"prMerged"`. Run: `npx vitest run src/app/api/webhooks/github/route.test.ts src/lib/github` — all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github src/app/api/webhooks
git commit -m "feat: event-based status advance with per-team resolution"
```

---

### Task 4: Shared dev-data helper + drawer payload

**Files:**
- Create: `src/lib/github/dev-data.ts`
- Modify: `src/app/(dashboard)/tasks/[id]/page.tsx` (github build at ~line 255), `src/lib/ticket-detail-data.ts` (`ticketCoreInclude` ~line 21; payload return tail ~line 354), `src/lib/ticket-detail-placeholder.ts` (three `intake: null` sites at ~lines 109/161/208)

**Interfaces:**
- Produces: `buildGitHubDevData(ticket: { pullRequests: Array<{ pr: GitHubPullRequestRow }>; commits: GitHubCommitRow[] }): Promise<GitHubDevData>` from `@/lib/github/dev-data`.

- [ ] **Step 1: Create the helper**

```ts
// src/lib/github/dev-data.ts
import { getCheckState } from "./checks"
import type { GitHubDevData } from "@/components/tickets/github-dev-section"

type PullRequestRow = {
  number: number
  title: string
  url: string
  branch: string
  authorLogin: string
  state: "draft" | "open" | "merged" | "closed"
}

type CommitRow = { sha: string; message: string; url: string; authorLogin: string }

/** Maps a ticket's GitHub relations to the Development-section prop shape. */
export async function buildGitHubDevData(ticket: {
  pullRequests: Array<{ pr: PullRequestRow }>
  commits: CommitRow[]
}): Promise<GitHubDevData> {
  return {
    pullRequests: await Promise.all(
      ticket.pullRequests.map(async ({ pr }) => ({
        number: pr.number,
        title: pr.title,
        url: pr.url,
        branch: pr.branch,
        authorLogin: pr.authorLogin,
        state: pr.state,
        checkState:
          pr.state === "open" || pr.state === "draft" ? await getCheckState(pr.branch) : null,
      })),
    ),
    commits: ticket.commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      url: c.url,
      authorLogin: c.authorLogin,
    })),
  }
}
```

- [ ] **Step 2: Use it in the server page**

In `tasks/[id]/page.tsx`: replace the inline `const github: GitHubDevData = { ... }` block with `const github = await buildGitHubDevData(ticket);`, import the helper, drop now-unused imports (`getCheckState`, `GitHubDevData` type if unused).

- [ ] **Step 3: Feed the drawer payload**

In `ticket-detail-data.ts`:
- `ticketCoreInclude` gains:

```ts
  pullRequests: { include: { pr: true } },
  commits: { orderBy: { createdAt: "desc" as const } },
```

- `getTicketDetailPayload`'s returned object gains, after the `intake:` block:

```ts
    github: await buildGitHubDevData(ticket),
```

with the import added. (The drawer spreads `{...data}` into `TicketDetailPage`, whose `github` prop already exists — no component change.)

- [ ] **Step 4: Placeholder stubs**

In `ticket-detail-placeholder.ts`, add `github: null,` next to each of the three `intake: null,` lines.

- [ ] **Step 5: Verify**

`npm run lint` (no new errors), `npm test` (baseline only). Manual: drawer verification happens post-deploy against the live demo ticket.

- [ ] **Step 6: Commit**

```bash
git add src/lib/github/dev-data.ts "src/app/(dashboard)/tasks/[id]/page.tsx" src/lib/ticket-detail-data.ts src/lib/ticket-detail-placeholder.ts
git commit -m "feat: Development section in ticket drawer via shared dev-data helper"
```

---

### Task 5: github-map API route + shared guard

**Files:**
- Create: `src/lib/team-manage.ts` (extract `canManageTeam` from `src/app/api/teams/[id]/statuses/route.ts:6-16`)
- Modify: `src/app/api/teams/[id]/statuses/route.ts` and `src/app/api/teams/[id]/statuses/[statusId]/route.ts` (import the extracted helper instead of local copies — check the second file for its own copy)
- Create: `src/app/api/teams/[id]/github-map/route.ts`
- Test: `src/app/api/teams/[id]/github-map/route.test.ts`

**Interfaces:**
- Produces: `canManageTeam(profile, teamId)` from `@/lib/team-manage`; `GET /api/teams/[id]/github-map` → `{ config: TeamGitHubMapRow | null, defaults: { prOpened: string | null, prReadyForReview: string | null, prMerged: string | null } }`; `PUT` body `{ onPrOpened?: string | null, onPrReadyForReview?: string | null, onPrMerged?: string | null }` → upserted row.

- [ ] **Step 1: Extract the guard**

`src/lib/team-manage.ts` — move `canManageTeam` verbatim (typed `profile: AuthProfile` from `@/lib/auth` instead of `any` if trivially compatible; else keep the existing loose typing). Update both statuses route files to import it; delete local copies. Run `npx vitest run src/app/api` to confirm no regressions (statuses routes have no tests — lint + typecheck of changed files is the gate).

- [ ] **Step 2: Write failing route tests**

```ts
// src/app/api/teams/[id]/github-map/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }))
vi.mock("@/lib/team-manage", () => ({ canManageTeam: vi.fn() }))
vi.mock("@/lib/dept-scope", () => ({ canReadTeamData: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    teamStatus: { findMany: vi.fn() },
    teamGitHubStatusMap: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

import { requireAuth } from "@/lib/auth"
import { canManageTeam } from "@/lib/team-manage"
import { canReadTeamData } from "@/lib/dept-scope"
import { prisma } from "@/lib/db"
import { GET, PUT } from "./route"

const mockAuth = vi.mocked(requireAuth)
const mockManage = vi.mocked(canManageTeam)
const mockRead = vi.mocked(canReadTeamData)
const mockStatuses = vi.mocked(prisma.teamStatus.findMany)
const mockFind = vi.mocked(prisma.teamGitHubStatusMap.findUnique)
const mockUpsert = vi.mocked(prisma.teamGitHubStatusMap.upsert)

const params = { params: Promise.resolve({ id: "team-1" }) }

function putRequest(body: unknown) {
  return new Request("http://localhost/api/teams/team-1/github-map", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const WEB_STATUSES = [
  { label: "To Do", order: 0, isComplete: false },
  { label: "In Progress", order: 1, isComplete: false },
  { label: "Pull Request", order: 2, isComplete: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ profile: { id: "u1" }, error: null } as never)
  mockManage.mockResolvedValue(true)
  mockRead.mockResolvedValue(true)
  mockStatuses.mockResolvedValue(WEB_STATUSES as never)
  mockFind.mockResolvedValue(null as never)
})

describe("GET /api/teams/[id]/github-map", () => {
  it("returns config and resolved defaults", async () => {
    const res = await GET(new Request("http://localhost"), params)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.config).toBeNull()
    expect(body.defaults).toEqual({
      prOpened: "In Progress",
      prReadyForReview: null,
      prMerged: "Pull Request",
    })
  })

  it("403s when the profile cannot read team data", async () => {
    mockRead.mockResolvedValue(false)
    const res = await GET(new Request("http://localhost"), params)
    expect(res.status).toBe(403)
  })
})

describe("PUT /api/teams/[id]/github-map", () => {
  it("upserts valid fields", async () => {
    mockUpsert.mockResolvedValue({ teamId: "team-1", onPrOpened: "Blocked" } as never)
    const res = await PUT(putRequest({ onPrOpened: "In Progress", onPrReadyForReview: "", onPrMerged: null }), params)
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { teamId: "team-1" },
      create: { teamId: "team-1", onPrOpened: "In Progress", onPrReadyForReview: "", onPrMerged: null },
      update: { onPrOpened: "In Progress", onPrReadyForReview: "", onPrMerged: null },
    })
  })

  it("rejects a label the team does not have", async () => {
    const res = await PUT(putRequest({ onPrOpened: "Ghost" }), params)
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it("403s when the profile cannot manage the team", async () => {
    mockManage.mockResolvedValue(false)
    const res = await PUT(putRequest({ onPrOpened: "" }), params)
    expect(res.status).toBe(403)
  })
})
```

Run: FAIL (no `./route`).

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/teams/[id]/github-map/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canReadTeamData } from "@/lib/dept-scope"
import { canManageTeam } from "@/lib/team-manage"
import {
  resolveTargetLabel,
  type GitHubStatusEvent,
  type TeamGitHubMapRow,
} from "@/lib/github/status-map"

const EVENTS: GitHubStatusEvent[] = ["prOpened", "prReadyForReview", "prMerged"]
const FIELDS = ["onPrOpened", "onPrReadyForReview", "onPrMerged"] as const

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!(await canReadTeamData(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const statuses = await prisma.teamStatus.findMany({
    where: { teamId: id },
    orderBy: { order: "asc" },
    select: { label: true, order: true, isComplete: true },
  })
  const config = await prisma.teamGitHubStatusMap.findUnique({ where: { teamId: id } })

  const defaults = Object.fromEntries(
    EVENTS.map((e) => [e, resolveTargetLabel(e, statuses, null)]),
  )
  return NextResponse.json({ config, defaults })
}

export async function PUT(
  request: NextRequest | Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!(await canManageTeam(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as Partial<TeamGitHubMapRow> | null
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const statuses = await prisma.teamStatus.findMany({
    where: { teamId: id },
    select: { label: true },
  })
  const labels = new Set(statuses.map((s) => s.label))

  const data: Record<string, string | null> = {}
  for (const field of FIELDS) {
    if (!(field in body)) continue
    const value = body[field]
    if (value === null || value === "") {
      data[field] = value
    } else if (typeof value === "string" && labels.has(value)) {
      data[field] = value
    } else {
      return NextResponse.json(
        { error: `Unknown status label for ${field}: ${String(value)}` },
        { status: 400 },
      )
    }
  }

  const saved = await prisma.teamGitHubStatusMap.upsert({
    where: { teamId: id },
    create: { teamId: id, ...data },
    update: data,
  })
  return NextResponse.json(saved)
}
```

- [ ] **Step 4: Run tests**

`npx vitest run "src/app/api/teams/[id]/github-map/route.test.ts"` — 5 PASS. Then `npm test` — baseline only.

- [ ] **Step 5: Commit**

```bash
git add src/lib/team-manage.ts "src/app/api/teams/[id]"
git commit -m "feat: per-team GitHub status map API with shared team-manage guard"
```

---

### Task 6: "GitHub automation" settings card

**Files:**
- Modify: `src/lib/api/teams.ts` (append fetch helpers)
- Modify: `src/components/settings/settings-workflows-page.tsx` (append card below the statuses card)

No unit tests (no component-test infra) — gate: lint + typecheck + no new test failures.

**Interfaces:**
- Consumes: `GET/PUT /api/teams/[id]/github-map` (Task 5 shapes).
- Produces: helpers in `@/lib/api/teams`:

```ts
export type TeamGitHubMap = {
  onPrOpened: string | null
  onPrReadyForReview: string | null
  onPrMerged: string | null
}
export type TeamGitHubMapResponse = {
  config: TeamGitHubMap | null
  defaults: { prOpened: string | null; prReadyForReview: string | null; prMerged: string | null }
}
export async function getTeamGitHubMap(teamId: string): Promise<TeamGitHubMapResponse>
export async function updateTeamGitHubMap(teamId: string, body: Partial<TeamGitHubMap>): Promise<TeamGitHubMap>
```

(follow the fetch style of `getTeamStatuses`/`updateTeamStatus` in the same file).

- [ ] **Step 1: Add the API helpers** (per the interface above, `PUT` with JSON body, throw on `!res.ok`).

- [ ] **Step 2: Add the card**

In `settings-workflows-page.tsx`, below the existing statuses card (reusing the page's selected team state), add a "GitHub automation" card:

- Same card classes as the statuses card (`rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pb-2 pt-4`), heading "GitHub automation" with a `text-pen-muted` one-line subtitle ("Where tickets move when linked pull requests change on GitHub").
- Three labeled rows: "PR opened", "Marked ready for review", "PR merged". Each row: a select (reuse the select component/pattern already used on this page — check how the team selector is built and mirror it) with options:
  1. `Auto — → <resolved default label>` or `Auto — no move` when the default resolves to null (value: `null`)
  2. `No change` (value: `""`)
  3. One option per team status label (value: the label)
- Load state with `getTeamGitHubMap(selectedTeamId)` whenever the selected team changes (react-query if the page already uses it for statuses; otherwise mirror the page's data-loading pattern).
- On select change: call `updateTeamGitHubMap(teamId, { <field>: <value> })`, optimistic update, error toast on failure using the page's existing toast mechanism (sonner `toast` if that's what the page uses).
- Follow the page's existing typography and spacing; do not restructure existing code.

- [ ] **Step 3: Verify** — `npm run lint` (no new), `npx tsc --noEmit` (no new in changed files), `npm test` (baseline).

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/teams.ts src/components/settings/settings-workflows-page.tsx
git commit -m "feat: GitHub automation settings card for per-team status mapping"
```

---

### Task 7: README

**Files:**
- Modify: `README.md` (GitHub Integration section — the status mapping table area)

- [ ] **Step 1: Replace the mapping table + caveat paragraph**

Replace the fixed-labels table and its intro with:

```markdown
PR lifecycle events advance ticket status (always forward-only; intake
tickets are never auto-completed):

| GitHub event               | Default target                                                        |
| -------------------------- | --------------------------------------------------------------------- |
| PR opened (non-draft)      | "In Progress"                                                          |
| PR marked ready for review | First non-complete status named In Review / Review / Code Review / Pull Request |
| PR merged                  | "Done", else the team's first complete-flagged status                  |

Teams can override any of these (or disable an event) in
**Settings → Workflows & statuses → GitHub automation**.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: per-team GitHub status mapping"
```

---

## Self-Review Notes

- Spec coverage: resolver → Task 2; model → Task 1; event-based advance + webhook → Task 3; drawer → Task 4; API + guard extraction → Task 5; UI → Task 6; docs → Task 7.
- Type consistency: `GitHubStatusEvent`, `TeamGitHubMapRow`, `buildGitHubDevData`, route response shapes are named identically across tasks.
- Known judgment call: `""` sentinel for "disabled" keeps the model to three nullable strings; validated at the API boundary.
