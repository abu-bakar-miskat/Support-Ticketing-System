# GitHub Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link GitHub PRs/commits to tickets by `PREFIX-N` references and auto-advance ticket status from PR lifecycle webhooks, per the spec in `docs/superpowers/specs/2026-07-06-github-integration-design.md`.

**Architecture:** A signature-verified webhook route (`/api/webhooks/github`) parses ticket references from PR branch/title/body and commit messages, upserts PR/commit records (new Prisma models), and applies a fixed, forward-only status mapping. A read-only PAT powers an admin backfill route and CI check-status display in a new "Development" section on the ticket page.

**Tech Stack:** Next.js 16.2.7 (App Router route handlers), Prisma 7 (client generated to `src/generated/prisma`), Supabase Postgres, vitest, `node:crypto`.

## Global Constraints

- **Next.js has breaking changes vs training data** (per `AGENTS.md`): route handlers use Web `Request`/`Response`; `request.text()` reads the raw body; dynamic `params` are Promises. Reference: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.
- Path alias: `@` → `src` (both tsconfig and vitest).
- Tests are colocated `*.test.ts` files run with `npx vitest run <file>`; all Prisma/helper modules are mocked with `vi.mock` (see `src/app/api/tickets/route.test.ts` for the house pattern).
- No new npm dependencies.
- Status labels are exact strings: `"In Progress"`, `"In Review"`, `"Done"`.
- Env vars (never hardcode): `GITHUB_WEBHOOK_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO` (value: `PlanetEducationNetworks/PEN-Ticketing-System`).
- Ticket human ID format: `<Team.prefix>-<ticketNumber>`; `Team.prefix` is unique; tickets are unique on `(teamId, ticketNumber)`; soft delete via `deletedAt`.
- Webhook returns 200 for anything ignorable after signature verification (GitHub shows non-2xx as delivery failures).
- Commit messages follow repo style, end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Prisma models + migration

**Files:**
- Modify: `prisma/schema.prisma` (Ticket model at ~line 321; add new models after the `TicketTemplate` section or at end of file)

**Interfaces:**
- Consumes: existing `Ticket` model.
- Produces: Prisma client delegates `prisma.gitHubPullRequest`, `prisma.ticketPullRequest`, `prisma.gitHubCommit`; enum `GitHubPRState` with values `draft | open | merged | closed`; `Ticket.pullRequests` and `Ticket.commits` relations.

- [ ] **Step 1: Add enum and models to `prisma/schema.prisma`**

Append to the Enums section:

```prisma
enum GitHubPRState {
  draft
  open
  merged
  closed
}
```

Append at the end of the file:

```prisma
// ─── GitHub Integration ───────────────────────────────────────────────────────

model GitHubPullRequest {
  id          String        @id @default(cuid())
  number      Int           @unique // single-repo integration, so PR number is unique
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

- [ ] **Step 2: Add relations to the `Ticket` model**

In `model Ticket` (~line 321), after the `intake Intake?` line, add:

```prisma
  pullRequests  TicketPullRequest[]
  commits       GitHubCommit[]
```

- [ ] **Step 3: Validate and migrate**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid`

Run: `npx prisma migrate dev --name github_integration`
Expected: new folder `prisma/migrations/<timestamp>_github_integration/` and `Your database is now in sync`. (This also regenerates the client into `src/generated/prisma`.)

- [ ] **Step 4: Confirm existing tests still pass**

Run: `npm test`
Expected: all existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add GitHub PR/commit models for GitHub integration"
```

---

### Task 2: Ticket reference parser

**Files:**
- Create: `src/lib/github/parse-refs.ts`
- Test: `src/lib/github/parse-refs.test.ts`

**Interfaces:**
- Produces: `type TicketRef = { prefix: string; number: number }`; `parseTicketRefs(...texts: Array<string | null | undefined>): TicketRef[]` — deduped, prefixes uppercased.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/github/parse-refs.test.ts
import { describe, it, expect } from "vitest"
import { parseTicketRefs } from "./parse-refs"

describe("parseTicketRefs", () => {
  it("finds a ref in a branch name", () => {
    expect(parseTicketRefs("feat/DEV-42-dark-mode")).toEqual([
      { prefix: "DEV", number: 42 },
    ])
  })

  it("is case-insensitive and uppercases the prefix", () => {
    expect(parseTicketRefs("fix/dev-7-login")).toEqual([
      { prefix: "DEV", number: 7 },
    ])
  })

  it("finds multiple distinct refs across several inputs", () => {
    expect(parseTicketRefs("DEV-1 and OPS-2", "also DEV-3")).toEqual([
      { prefix: "DEV", number: 1 },
      { prefix: "OPS", number: 2 },
      { prefix: "DEV", number: 3 },
    ])
  })

  it("dedupes the same ref appearing in multiple inputs", () => {
    expect(parseTicketRefs("DEV-42", "[DEV-42] fix it", "dev-42 again")).toEqual([
      { prefix: "DEV", number: 42 },
    ])
  })

  it("ignores null, undefined, and text without refs", () => {
    expect(parseTicketRefs(null, undefined, "no refs here", "")).toEqual([])
  })

  it("does not match when digits run into letters", () => {
    expect(parseTicketRefs("DEV-42x")).toEqual([])
  })

  it("requires the prefix to start with a letter", () => {
    expect(parseTicketRefs("123-42")).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/parse-refs.test.ts`
Expected: FAIL — cannot resolve `./parse-refs`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/github/parse-refs.ts
export type TicketRef = { prefix: string; number: number }

const REF_RE = /\b([A-Za-z][A-Za-z0-9]*)-(\d+)\b/g

/**
 * Extracts ticket references like "DEV-42" from branch names, PR titles/bodies,
 * and commit messages. Case-insensitive; prefixes are uppercased; deduped.
 */
export function parseTicketRefs(
  ...texts: Array<string | null | undefined>
): TicketRef[] {
  const seen = new Set<string>()
  const refs: TicketRef[] = []
  for (const text of texts) {
    if (!text) continue
    for (const match of text.matchAll(REF_RE)) {
      const prefix = match[1].toUpperCase()
      const number = parseInt(match[2], 10)
      const key = `${prefix}-${number}`
      if (seen.has(key)) continue
      seen.add(key)
      refs.push({ prefix, number })
    }
  }
  return refs
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github/parse-refs.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/parse-refs.ts src/lib/github/parse-refs.test.ts
git commit -m "feat: parse PREFIX-N ticket references from GitHub text"
```

---

### Task 3: Webhook signature verification

**Files:**
- Create: `src/lib/github/verify-signature.ts`
- Test: `src/lib/github/verify-signature.test.ts`

**Interfaces:**
- Produces: `verifyGitHubSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/github/verify-signature.test.ts
import { describe, it, expect } from "vitest"
import { createHmac } from "node:crypto"
import { verifyGitHubSignature } from "./verify-signature"

const SECRET = "test-secret"

function sign(body: string, secret = SECRET) {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex")
}

describe("verifyGitHubSignature", () => {
  it("accepts a valid signature", () => {
    const body = JSON.stringify({ hello: "world" })
    expect(verifyGitHubSignature(body, sign(body), SECRET)).toBe(true)
  })

  it("rejects a signature computed with a different secret", () => {
    const body = "{}"
    expect(verifyGitHubSignature(body, sign(body, "wrong"), SECRET)).toBe(false)
  })

  it("rejects a signature for a different body", () => {
    expect(verifyGitHubSignature("{\"a\":2}", sign("{\"a\":1}"), SECRET)).toBe(false)
  })

  it("rejects a missing header", () => {
    expect(verifyGitHubSignature("{}", null, SECRET)).toBe(false)
  })

  it("rejects a header without the sha256= prefix", () => {
    const digest = createHmac("sha256", SECRET).update("{}").digest("hex")
    expect(verifyGitHubSignature("{}", digest, SECRET)).toBe(false)
  })

  it("rejects malformed hex without throwing", () => {
    expect(verifyGitHubSignature("{}", "sha256=nothex!!", SECRET)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/verify-signature.test.ts`
Expected: FAIL — cannot resolve `./verify-signature`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/github/verify-signature.ts
import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Verifies GitHub's X-Hub-Signature-256 header: HMAC-SHA256 of the raw request
 * body, hex-encoded, prefixed with "sha256=". Timing-safe comparison.
 */
export function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false
  const expected = Buffer.from(
    createHmac("sha256", secret).update(rawBody).digest("hex"),
    "hex",
  )
  const provided = Buffer.from(signatureHeader.slice("sha256=".length), "hex")
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github/verify-signature.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/verify-signature.ts src/lib/github/verify-signature.test.ts
git commit -m "feat: verify GitHub webhook HMAC signatures"
```

---

### Task 4: Status mapping guard (pure)

**Files:**
- Create: `src/lib/github/status-map.ts`
- Test: `src/lib/github/status-map.test.ts`

**Interfaces:**
- Produces: `GITHUB_TARGET_STATUS = { prOpened: "In Progress", prReadyForReview: "In Review", prMerged: "Done" }`; `type TeamStatusRow = { label: string; order: number; isComplete: boolean }`; `pickStatusMove(currentStatus: string, targetLabel: string, statuses: TeamStatusRow[], hasIntake: boolean): { label: string; isComplete: boolean } | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/github/status-map.test.ts
import { describe, it, expect } from "vitest"
import { pickStatusMove, GITHUB_TARGET_STATUS } from "./status-map"

const STATUSES = [
  { label: "Not Started", order: 0, isComplete: false },
  { label: "In Progress", order: 1, isComplete: false },
  { label: "In Review", order: 2, isComplete: false },
  { label: "Done", order: 3, isComplete: true },
]

describe("pickStatusMove", () => {
  it("allows a forward move", () => {
    expect(pickStatusMove("Not Started", "In Progress", STATUSES, false)).toEqual({
      label: "In Progress",
      isComplete: false,
    })
  })

  it("allows jumping several steps forward", () => {
    expect(pickStatusMove("Not Started", "Done", STATUSES, false)).toEqual({
      label: "Done",
      isComplete: true,
    })
  })

  it("rejects a backward move", () => {
    expect(pickStatusMove("Done", "In Progress", STATUSES, false)).toBeNull()
  })

  it("rejects a move to the same status", () => {
    expect(pickStatusMove("In Review", "In Review", STATUSES, false)).toBeNull()
  })

  it("rejects when the team has no status with the target label", () => {
    expect(pickStatusMove("Not Started", "QA", STATUSES, false)).toBeNull()
  })

  it("rejects when the current status is not in the team's list", () => {
    expect(pickStatusMove("Legacy", "Done", STATUSES, false)).toBeNull()
  })

  it("rejects completing an intake-linked ticket", () => {
    expect(pickStatusMove("In Review", "Done", STATUSES, true)).toBeNull()
  })

  it("allows non-completing moves on intake-linked tickets", () => {
    expect(pickStatusMove("Not Started", "In Progress", STATUSES, true)).toEqual({
      label: "In Progress",
      isComplete: false,
    })
  })

  it("exports the fixed event-to-status mapping", () => {
    expect(GITHUB_TARGET_STATUS).toEqual({
      prOpened: "In Progress",
      prReadyForReview: "In Review",
      prMerged: "Done",
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/status-map.test.ts`
Expected: FAIL — cannot resolve `./status-map`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/github/status-map.ts

/** Fixed mapping from PR lifecycle events to target status labels. */
export const GITHUB_TARGET_STATUS = {
  prOpened: "In Progress",
  prReadyForReview: "In Review",
  prMerged: "Done",
} as const

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github/status-map.test.ts`
Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/status-map.ts src/lib/github/status-map.test.ts
git commit -m "feat: forward-only GitHub status mapping guard"
```

---

### Task 5: Resolve ticket refs to ticket IDs

**Files:**
- Create: `src/lib/github/resolve-refs.ts`
- Test: `src/lib/github/resolve-refs.test.ts`

**Interfaces:**
- Consumes: `TicketRef` from `./parse-refs`; `prisma` from `@/lib/db`.
- Produces: `resolveTicketIds(refs: TicketRef[]): Promise<string[]>` — matches `Team.prefix` then `(teamId, ticketNumber)`, skips soft-deleted tickets, silently drops unknown prefixes/numbers.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/github/resolve-refs.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    team: { findMany: vi.fn() },
    ticket: { findMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"
import { resolveTicketIds } from "./resolve-refs"

const mockTeamFindMany = vi.mocked(prisma.team.findMany)
const mockTicketFindMany = vi.mocked(prisma.ticket.findMany)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolveTicketIds", () => {
  it("returns [] without querying when there are no refs", async () => {
    expect(await resolveTicketIds([])).toEqual([])
    expect(mockTeamFindMany).not.toHaveBeenCalled()
  })

  it("resolves refs through team prefix and ticket number", async () => {
    mockTeamFindMany.mockResolvedValue([{ id: "team-1", prefix: "DEV" }] as never)
    mockTicketFindMany.mockResolvedValue([{ id: "ticket-1" }] as never)

    const ids = await resolveTicketIds([{ prefix: "DEV", number: 42 }])

    expect(ids).toEqual(["ticket-1"])
    expect(mockTicketFindMany).toHaveBeenCalledWith({
      where: {
        OR: [{ teamId: "team-1", ticketNumber: 42 }],
        deletedAt: null,
      },
      select: { id: true },
    })
  })

  it("drops refs whose prefix matches no team", async () => {
    mockTeamFindMany.mockResolvedValue([] as never)

    const ids = await resolveTicketIds([{ prefix: "NOPE", number: 1 }])

    expect(ids).toEqual([])
    expect(mockTicketFindMany).not.toHaveBeenCalled()
  })

  it("resolves refs across multiple teams", async () => {
    mockTeamFindMany.mockResolvedValue([
      { id: "team-1", prefix: "DEV" },
      { id: "team-2", prefix: "OPS" },
    ] as never)
    mockTicketFindMany.mockResolvedValue([{ id: "t1" }, { id: "t2" }] as never)

    const ids = await resolveTicketIds([
      { prefix: "DEV", number: 1 },
      { prefix: "OPS", number: 2 },
    ])

    expect(ids).toEqual(["t1", "t2"])
    expect(mockTicketFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { teamId: "team-1", ticketNumber: 1 },
          { teamId: "team-2", ticketNumber: 2 },
        ],
        deletedAt: null,
      },
      select: { id: true },
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/resolve-refs.test.ts`
Expected: FAIL — cannot resolve `./resolve-refs`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/github/resolve-refs.ts
import { prisma } from "@/lib/db"
import type { TicketRef } from "./parse-refs"

/**
 * Resolves parsed ticket refs to ticket IDs. Prefix must match a Team.prefix
 * exactly; the ticket is looked up by (teamId, ticketNumber). Soft-deleted
 * tickets and unknown refs are silently dropped.
 */
export async function resolveTicketIds(refs: TicketRef[]): Promise<string[]> {
  if (refs.length === 0) return []

  const prefixes = [...new Set(refs.map((r) => r.prefix))]
  const teams = await prisma.team.findMany({
    where: { prefix: { in: prefixes } },
    select: { id: true, prefix: true },
  })
  const teamByPrefix = new Map(teams.map((t) => [t.prefix, t.id]))

  const lookups = refs.flatMap((r) => {
    const teamId = teamByPrefix.get(r.prefix)
    return teamId ? [{ teamId, ticketNumber: r.number }] : []
  })
  if (lookups.length === 0) return []

  const tickets = await prisma.ticket.findMany({
    where: { OR: lookups, deletedAt: null },
    select: { id: true },
  })
  return tickets.map((t) => t.id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github/resolve-refs.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/resolve-refs.ts src/lib/github/resolve-refs.test.ts
git commit -m "feat: resolve ticket refs to ticket ids"
```

---

### Task 6: Advance ticket status (side-effecting)

**Files:**
- Create: `src/lib/github/advance-status.ts`
- Test: `src/lib/github/advance-status.test.ts`

**Interfaces:**
- Consumes: `pickStatusMove` from `./status-map`; `prisma` from `@/lib/db`; `notifyTicketCompletion` from `@/lib/ticket-completion-notify` (signature: `{ ticketId, ticketTitle, humanId, teamId, creatorId, actorId, actorName }`); `cascadeCompleteToSubtickets(parentId: string)` from `@/lib/ticket-cascade`.
- Produces: `advanceTicketStatus(ticketId: string, targetLabel: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/github/advance-status.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn(), updateMany: vi.fn() },
    teamStatus: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/ticket-completion-notify", () => ({
  notifyTicketCompletion: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/ticket-cascade", () => ({
  cascadeCompleteToSubtickets: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "@/lib/db"
import { notifyTicketCompletion } from "@/lib/ticket-completion-notify"
import { cascadeCompleteToSubtickets } from "@/lib/ticket-cascade"
import { advanceTicketStatus } from "./advance-status"

const mockFindUnique = vi.mocked(prisma.ticket.findUnique)
const mockUpdateMany = vi.mocked(prisma.ticket.updateMany)
const mockStatusFindMany = vi.mocked(prisma.teamStatus.findMany)
const mockNotify = vi.mocked(notifyTicketCompletion)
const mockCascade = vi.mocked(cascadeCompleteToSubtickets)

const baseTicket = {
  id: "ticket-1",
  title: "Fix login",
  status: "Not Started",
  teamId: "team-1",
  ticketNumber: 42,
  creatorId: "user-1",
  closedAt: null,
  deletedAt: null,
  team: { prefix: "DEV" },
  intake: null,
}

const STATUSES = [
  { label: "Not Started", order: 0, isComplete: false },
  { label: "In Progress", order: 1, isComplete: false },
  { label: "Done", order: 2, isComplete: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockFindUnique.mockResolvedValue(baseTicket as never)
  mockStatusFindMany.mockResolvedValue(STATUSES as never)
  mockUpdateMany.mockResolvedValue({ count: 1 } as never)
})

describe("advanceTicketStatus", () => {
  it("moves the ticket forward with an optimistic status guard", async () => {
    await advanceTicketStatus("ticket-1", "In Progress")

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "ticket-1", status: "Not Started" },
      data: { status: "In Progress", closedAt: null },
    })
    expect(mockNotify).not.toHaveBeenCalled()
    expect(mockCascade).not.toHaveBeenCalled()
  })

  it("does nothing when the ticket does not exist", async () => {
    mockFindUnique.mockResolvedValue(null as never)
    await advanceTicketStatus("gone", "Done")
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it("does nothing when the ticket is soft-deleted", async () => {
    mockFindUnique.mockResolvedValue({ ...baseTicket, deletedAt: new Date() } as never)
    await advanceTicketStatus("ticket-1", "Done")
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it("does nothing when the guard rejects (backward move)", async () => {
    mockFindUnique.mockResolvedValue({ ...baseTicket, status: "Done" } as never)
    await advanceTicketStatus("ticket-1", "In Progress")
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it("never auto-completes an intake-linked ticket", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseTicket,
      intake: { id: "intake-1" },
    } as never)
    await advanceTicketStatus("ticket-1", "Done")
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it("sets closedAt and fires completion side effects on completing moves", async () => {
    await advanceTicketStatus("ticket-1", "Done")

    const updateArg = mockUpdateMany.mock.calls[0][0]
    expect(updateArg.data.status).toBe("Done")
    expect(updateArg.data.closedAt).toBeInstanceOf(Date)
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: "ticket-1",
        humanId: "DEV-42",
        actorName: "GitHub",
      }),
    )
    expect(mockCascade).toHaveBeenCalledWith("ticket-1")
  })

  it("preserves an existing closedAt", async () => {
    const earlier = new Date("2026-01-01T00:00:00Z")
    mockFindUnique.mockResolvedValue({ ...baseTicket, closedAt: earlier } as never)
    await advanceTicketStatus("ticket-1", "Done")
    expect(mockUpdateMany.mock.calls[0][0].data.closedAt).toBe(earlier)
  })

  it("skips completion side effects when the ticket changed concurrently", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 } as never)
    await advanceTicketStatus("ticket-1", "Done")
    expect(mockNotify).not.toHaveBeenCalled()
    expect(mockCascade).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/advance-status.test.ts`
Expected: FAIL — cannot resolve `./advance-status`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/github/advance-status.ts
import { prisma } from "@/lib/db"
import { notifyTicketCompletion } from "@/lib/ticket-completion-notify"
import { cascadeCompleteToSubtickets } from "@/lib/ticket-cascade"
import { pickStatusMove } from "./status-map"

/**
 * Webhook-driven status change. Bypasses the sequential-transition rule the
 * user-facing status route enforces (that rule is for the human workflow UI),
 * but is forward-only and never auto-completes intake tickets — see
 * pickStatusMove. The STATUS_CHANGED ActivityLog entry is written by the DB
 * trigger, attributed to the ticket creator via its built-in fallback.
 */
export async function advanceTicketStatus(
  ticketId: string,
  targetLabel: string,
): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      title: true,
      status: true,
      teamId: true,
      ticketNumber: true,
      creatorId: true,
      closedAt: true,
      deletedAt: true,
      team: { select: { prefix: true } },
      intake: { select: { id: true } },
    },
  })
  if (!ticket || ticket.deletedAt !== null) return

  const statuses = await prisma.teamStatus.findMany({
    where: { teamId: ticket.teamId },
    orderBy: { order: "asc" },
    select: { label: true, order: true, isComplete: true },
  })

  const move = pickStatusMove(ticket.status, targetLabel, statuses, ticket.intake !== null)
  if (!move) return

  // Optimistic guard: only update if the status hasn't changed since we read it
  const { count } = await prisma.ticket.updateMany({
    where: { id: ticket.id, status: ticket.status },
    data: {
      status: move.label,
      closedAt: move.isComplete ? (ticket.closedAt ?? new Date()) : null,
    },
  })
  if (count === 0 || !move.isComplete) return

  notifyTicketCompletion({
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    humanId: `${ticket.team.prefix}-${ticket.ticketNumber}`,
    teamId: ticket.teamId,
    creatorId: ticket.creatorId,
    actorId: ticket.creatorId,
    actorName: "GitHub",
  }).catch(() => undefined)
  cascadeCompleteToSubtickets(ticket.id).catch(() => undefined)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github/advance-status.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/advance-status.ts src/lib/github/advance-status.test.ts
git commit -m "feat: webhook-driven forward-only ticket status advance"
```

---

### Task 7: PR upsert-and-link helper

**Files:**
- Create: `src/lib/github/upsert-pr.ts`
- Test: `src/lib/github/upsert-pr.test.ts`

**Interfaces:**
- Consumes: `parseTicketRefs` (`./parse-refs`), `resolveTicketIds` (`./resolve-refs`), `prisma` (`@/lib/db`).
- Produces:
  - `type GitHubPRStateValue = "draft" | "open" | "merged" | "closed"` (string union matching the Prisma enum — avoids importing from the generated client)
  - `type GitHubApiPullRequest = { number: number; title: string; html_url: string; body?: string | null; draft?: boolean; state: string; merged_at: string | null; head: { ref: string }; user?: { login?: string | null } | null }` (shape shared by webhook payloads and the REST API)
  - `prState(pr: GitHubApiPullRequest): GitHubPRStateValue`
  - `upsertAndLinkPullRequest(pr: GitHubApiPullRequest): Promise<{ prId: string; ticketIds: string[] }>` — `ticketIds` are the tickets referenced by *this* payload (not necessarily all historic links).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/github/upsert-pr.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    gitHubPullRequest: { upsert: vi.fn() },
    ticketPullRequest: { createMany: vi.fn() },
  },
}))
vi.mock("./resolve-refs", () => ({ resolveTicketIds: vi.fn() }))

import { prisma } from "@/lib/db"
import { resolveTicketIds } from "./resolve-refs"
import { prState, upsertAndLinkPullRequest, type GitHubApiPullRequest } from "./upsert-pr"

const mockUpsert = vi.mocked(prisma.gitHubPullRequest.upsert)
const mockCreateMany = vi.mocked(prisma.ticketPullRequest.createMany)
const mockResolve = vi.mocked(resolveTicketIds)

const basePr: GitHubApiPullRequest = {
  number: 7,
  title: "[DEV-42] Fix login",
  html_url: "https://github.com/org/repo/pull/7",
  body: "Closes DEV-42",
  draft: false,
  state: "open",
  merged_at: null,
  head: { ref: "fix/dev-42-login" },
  user: { login: "nurmohammod-web" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpsert.mockResolvedValue({ id: "pr-row-1" } as never)
  mockResolve.mockResolvedValue(["ticket-1"])
  mockCreateMany.mockResolvedValue({ count: 1 } as never)
})

describe("prState", () => {
  it("maps merged, closed, draft, and open", () => {
    expect(prState({ ...basePr, merged_at: "2026-07-06T00:00:00Z", state: "closed" })).toBe("merged")
    expect(prState({ ...basePr, state: "closed" })).toBe("closed")
    expect(prState({ ...basePr, draft: true })).toBe("draft")
    expect(prState(basePr)).toBe("open")
  })
})

describe("upsertAndLinkPullRequest", () => {
  it("upserts by PR number and links resolved tickets", async () => {
    const result = await upsertAndLinkPullRequest(basePr)

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { number: 7 },
      create: expect.objectContaining({
        number: 7,
        title: "[DEV-42] Fix login",
        branch: "fix/dev-42-login",
        authorLogin: "nurmohammod-web",
        state: "open",
        mergedAt: null,
      }),
      update: expect.objectContaining({ title: "[DEV-42] Fix login", state: "open" }),
    })
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [{ ticketId: "ticket-1", prId: "pr-row-1" }],
      skipDuplicates: true,
    })
    expect(result).toEqual({ prId: "pr-row-1", ticketIds: ["ticket-1"] })
  })

  it("skips link creation when no tickets resolve", async () => {
    mockResolve.mockResolvedValue([])
    const result = await upsertAndLinkPullRequest(basePr)
    expect(mockCreateMany).not.toHaveBeenCalled()
    expect(result.ticketIds).toEqual([])
  })

  it("stores mergedAt as a Date when merged", async () => {
    await upsertAndLinkPullRequest({
      ...basePr,
      state: "closed",
      merged_at: "2026-07-06T12:00:00Z",
    })
    const arg = mockUpsert.mock.calls[0][0]
    expect(arg.update.state).toBe("merged")
    expect(arg.update.mergedAt).toEqual(new Date("2026-07-06T12:00:00Z"))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/upsert-pr.test.ts`
Expected: FAIL — cannot resolve `./upsert-pr`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/github/upsert-pr.ts
import { prisma } from "@/lib/db"
import { parseTicketRefs } from "./parse-refs"
import { resolveTicketIds } from "./resolve-refs"

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
  head: { ref: string }
  user?: { login?: string | null } | null
}

export function prState(pr: GitHubApiPullRequest): GitHubPRStateValue {
  if (pr.merged_at) return "merged"
  if (pr.state === "closed") return "closed"
  if (pr.draft) return "draft"
  return "open"
}

/**
 * Upserts the PR record (idempotent by PR number) and links every ticket
 * referenced in its branch name, title, or body. Links are additive — a
 * later edit never removes earlier links.
 */
export async function upsertAndLinkPullRequest(
  pr: GitHubApiPullRequest,
): Promise<{ prId: string; ticketIds: string[] }> {
  const data = {
    title: pr.title,
    url: pr.html_url,
    branch: pr.head.ref,
    authorLogin: pr.user?.login ?? "",
    state: prState(pr),
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
  }
  const record = await prisma.gitHubPullRequest.upsert({
    where: { number: pr.number },
    create: { number: pr.number, ...data },
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github/upsert-pr.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/upsert-pr.ts src/lib/github/upsert-pr.test.ts
git commit -m "feat: upsert GitHub PRs and link referenced tickets"
```

---

### Task 8: Webhook route — pull_request events

**Files:**
- Create: `src/app/api/webhooks/github/route.ts`
- Test: `src/app/api/webhooks/github/route.test.ts`

**Interfaces:**
- Consumes: `verifyGitHubSignature`, `upsertAndLinkPullRequest`/`GitHubApiPullRequest`, `advanceTicketStatus`, `GITHUB_TARGET_STATUS`, `prisma.ticketPullRequest.findMany`.
- Produces: `POST /api/webhooks/github`. Task 9 extends this same file with the `push` handler.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/webhooks/github/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHmac } from "node:crypto"

vi.mock("@/lib/db", () => ({
  prisma: {
    ticketPullRequest: { findMany: vi.fn() },
    gitHubCommit: { createMany: vi.fn() },
  },
}))
vi.mock("@/lib/github/upsert-pr", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  upsertAndLinkPullRequest: vi.fn(),
}))
vi.mock("@/lib/github/advance-status", () => ({ advanceTicketStatus: vi.fn() }))
vi.mock("@/lib/github/resolve-refs", () => ({ resolveTicketIds: vi.fn() }))

import { prisma } from "@/lib/db"
import { upsertAndLinkPullRequest } from "@/lib/github/upsert-pr"
import { advanceTicketStatus } from "@/lib/github/advance-status"
import { POST } from "./route"

const mockLinkFindMany = vi.mocked(prisma.ticketPullRequest.findMany)
const mockUpsertPr = vi.mocked(upsertAndLinkPullRequest)
const mockAdvance = vi.mocked(advanceTicketStatus)

const SECRET = "test-secret"
const REPO = "PlanetEducationNetworks/PEN-Ticketing-System"

function signedRequest(event: string, payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload)
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex")
  return new Request("http://localhost/api/webhooks/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": sig,
      "x-github-event": event,
    },
    body,
  })
}

function prPayload(action: string, pr: Partial<Record<string, unknown>> = {}) {
  return {
    action,
    repository: { full_name: REPO },
    pull_request: {
      number: 7,
      title: "[DEV-42] Fix login",
      html_url: "https://github.com/org/repo/pull/7",
      body: null,
      draft: false,
      state: "open",
      merged_at: null,
      head: { ref: "fix/dev-42-login" },
      user: { login: "dev" },
      ...pr,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.GITHUB_WEBHOOK_SECRET = SECRET
  process.env.GITHUB_REPO = REPO
  mockUpsertPr.mockResolvedValue({ prId: "pr-row-1", ticketIds: ["ticket-1"] })
  mockLinkFindMany.mockResolvedValue([{ ticketId: "ticket-1" }] as never)
  mockAdvance.mockResolvedValue(undefined)
})

describe("POST /api/webhooks/github", () => {
  it("returns 503 when the webhook secret is not configured", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET
    const res = await POST(signedRequest("pull_request", prPayload("opened")))
    expect(res.status).toBe(503)
  })

  it("rejects an invalid signature with 401", async () => {
    const res = await POST(signedRequest("pull_request", prPayload("opened"), "wrong-secret"))
    expect(res.status).toBe(401)
    expect(mockUpsertPr).not.toHaveBeenCalled()
  })

  it("ignores payloads from a different repository", async () => {
    const payload = { ...prPayload("opened"), repository: { full_name: "other/repo" } }
    const res = await POST(signedRequest("pull_request", payload))
    expect(res.status).toBe(200)
    expect(mockUpsertPr).not.toHaveBeenCalled()
  })

  it("ignores unhandled event types with 200", async () => {
    const res = await POST(signedRequest("issues", { repository: { full_name: REPO } }))
    expect(res.status).toBe(200)
    expect(mockUpsertPr).not.toHaveBeenCalled()
  })

  it("links and advances to In Progress on opened", async () => {
    const res = await POST(signedRequest("pull_request", prPayload("opened")))
    expect(res.status).toBe(200)
    expect(mockUpsertPr).toHaveBeenCalled()
    expect(mockAdvance).toHaveBeenCalledWith("ticket-1", "In Progress")
  })

  it("does not advance status for a draft PR opened", async () => {
    await POST(signedRequest("pull_request", prPayload("opened", { draft: true })))
    expect(mockUpsertPr).toHaveBeenCalled()
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it("advances to In Review on ready_for_review", async () => {
    await POST(signedRequest("pull_request", prPayload("ready_for_review")))
    expect(mockAdvance).toHaveBeenCalledWith("ticket-1", "In Review")
  })

  it("advances to Done on merged close", async () => {
    await POST(
      signedRequest(
        "pull_request",
        prPayload("closed", { state: "closed", merged_at: "2026-07-06T12:00:00Z" }),
      ),
    )
    expect(mockAdvance).toHaveBeenCalledWith("ticket-1", "Done")
  })

  it("does not advance on unmerged close", async () => {
    await POST(signedRequest("pull_request", prPayload("closed", { state: "closed" })))
    expect(mockUpsertPr).toHaveBeenCalled()
    expect(mockAdvance).not.toHaveBeenCalled()
  })

  it("advances every ticket linked to the PR, and survives per-ticket failures", async () => {
    mockLinkFindMany.mockResolvedValue([
      { ticketId: "ticket-1" },
      { ticketId: "ticket-2" },
    ] as never)
    mockAdvance.mockRejectedValueOnce(new Error("boom"))
    const res = await POST(signedRequest("pull_request", prPayload("opened")))
    expect(res.status).toBe(200)
    expect(mockAdvance).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/webhooks/github/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/webhooks/github/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { verifyGitHubSignature } from "@/lib/github/verify-signature"
import {
  upsertAndLinkPullRequest,
  type GitHubApiPullRequest,
} from "@/lib/github/upsert-pr"
import { advanceTicketStatus } from "@/lib/github/advance-status"
import { GITHUB_TARGET_STATUS } from "@/lib/github/status-map"

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
  if (repo !== process.env.GITHUB_REPO) {
    return NextResponse.json({ ok: true, skipped: "repository not configured" })
  }

  const event = request.headers.get("x-github-event")
  if (event === "pull_request") return handlePullRequest(payload)
  return NextResponse.json({ ok: true, skipped: `unhandled event: ${event}` })
}

function targetStatusFor(
  action: unknown,
  pr: GitHubApiPullRequest,
): string | null {
  if (action === "opened" && !pr.draft) return GITHUB_TARGET_STATUS.prOpened
  if (action === "ready_for_review") return GITHUB_TARGET_STATUS.prReadyForReview
  if (action === "closed" && pr.merged_at) return GITHUB_TARGET_STATUS.prMerged
  return null
}

async function handlePullRequest(payload: Record<string, unknown>) {
  const pr = payload.pull_request as GitHubApiPullRequest
  const { prId, ticketIds } = await upsertAndLinkPullRequest(pr)

  const target = targetStatusFor(payload.action, pr)
  if (target) {
    // Apply to every ticket ever linked to this PR, not just this payload's refs
    const links = await prisma.ticketPullRequest.findMany({
      where: { prId },
      select: { ticketId: true },
    })
    await Promise.all(
      links.map((link) =>
        advanceTicketStatus(link.ticketId, target).catch((err) =>
          console.error(
            `[github webhook] status update failed for ticket ${link.ticketId}:`,
            err,
          ),
        ),
      ),
    )
  }

  return NextResponse.json({ ok: true, linked: ticketIds.length })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/webhooks/github/route.test.ts`
Expected: 10 tests PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`
Expected: all tests PASS.

```bash
git add src/app/api/webhooks/github
git commit -m "feat: GitHub webhook route for pull_request events"
```

---

### Task 9: Webhook route — push events (commit linking)

**Files:**
- Modify: `src/app/api/webhooks/github/route.ts`
- Test: `src/app/api/webhooks/github/route.test.ts` (append)

**Interfaces:**
- Consumes: `parseTicketRefs` (`@/lib/github/parse-refs`), `resolveTicketIds` (`@/lib/github/resolve-refs`), `prisma.gitHubCommit.createMany`.
- Produces: `push` event handling in the same route.

- [ ] **Step 1: Append the failing tests**

Append inside the existing `describe("POST /api/webhooks/github")` block (the mocks for `gitHubCommit.createMany` and `resolveTicketIds` already exist from Task 8):

```ts
  it("links commits whose messages reference tickets on push", async () => {
    const { resolveTicketIds } = await import("@/lib/github/resolve-refs")
    vi.mocked(resolveTicketIds).mockResolvedValue(["ticket-1"])
    const mockCommitCreateMany = vi.mocked(prisma.gitHubCommit.createMany)
    mockCommitCreateMany.mockResolvedValue({ count: 1 } as never)

    const res = await POST(
      signedRequest("push", {
        repository: { full_name: REPO },
        commits: [
          {
            id: "abc123def456",
            message: "DEV-42: fix login redirect",
            url: "https://github.com/org/repo/commit/abc123def456",
            author: { username: "dev" },
          },
          {
            id: "no-ref-sha",
            message: "chore: bump deps",
            url: "https://github.com/org/repo/commit/no-ref-sha",
            author: { username: "dev" },
          },
        ],
      }),
    )

    expect(res.status).toBe(200)
    expect(mockCommitCreateMany).toHaveBeenCalledTimes(1)
    expect(mockCommitCreateMany).toHaveBeenCalledWith({
      data: [
        {
          sha: "abc123def456",
          message: "DEV-42: fix login redirect",
          url: "https://github.com/org/repo/commit/abc123def456",
          authorLogin: "dev",
          ticketId: "ticket-1",
        },
      ],
      skipDuplicates: true,
    })
  })

  it("handles a push with no commits array", async () => {
    const res = await POST(signedRequest("push", { repository: { full_name: REPO } }))
    expect(res.status).toBe(200)
  })
```

- [ ] **Step 2: Run test to verify the new tests fail**

Run: `npx vitest run src/app/api/webhooks/github/route.test.ts`
Expected: the two new tests FAIL (push currently falls through to "unhandled event"); the 10 existing tests still PASS.

- [ ] **Step 3: Implement the push handler**

In `src/app/api/webhooks/github/route.ts`, add imports:

```ts
import { parseTicketRefs } from "@/lib/github/parse-refs"
import { resolveTicketIds } from "@/lib/github/resolve-refs"
```

In `POST`, before the final `return NextResponse.json({ ok: true, skipped: ... })`, add:

```ts
  if (event === "push") return handlePush(payload)
```

Add at the bottom of the file:

```ts
type PushCommit = {
  id: string
  message: string
  url: string
  author?: { username?: string; name?: string }
}

async function handlePush(payload: Record<string, unknown>) {
  const commits = (payload.commits ?? []) as PushCommit[]
  let linked = 0
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
    linked += ticketIds.length
  }
  return NextResponse.json({ ok: true, linked })
}
```

- [ ] **Step 4: Run test to verify all pass**

Run: `npx vitest run src/app/api/webhooks/github/route.test.ts`
Expected: 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/github
git commit -m "feat: link commits to tickets from GitHub push events"
```

---

### Task 10: CI check-status fetcher

**Files:**
- Create: `src/lib/github/checks.ts`
- Test: `src/lib/github/checks.test.ts`

**Interfaces:**
- Consumes: `process.env.GITHUB_TOKEN`, `process.env.GITHUB_REPO`, global `fetch`.
- Produces: `type CheckState = "pending" | "passing" | "failing"`; `getCheckState(ref: string): Promise<CheckState | null>` — null when unconfigured, no check runs exist, or the API fails. In-memory cache, 60s TTL per ref.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/github/checks.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

function checkRunsResponse(runs: Array<{ status: string; conclusion: string | null }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ check_runs: runs }),
  } as Response
}

beforeEach(() => {
  vi.resetModules() // fresh module → fresh cache per test
  vi.unstubAllGlobals()
  process.env.GITHUB_TOKEN = "test-token"
  process.env.GITHUB_REPO = "PlanetEducationNetworks/PEN-Ticketing-System"
})

async function loadGetCheckState() {
  const mod = await import("./checks")
  return mod.getCheckState
}

describe("getCheckState", () => {
  it("returns null when GITHUB_TOKEN is not set", async () => {
    delete process.env.GITHUB_TOKEN
    const getCheckState = await loadGetCheckState()
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    expect(await getCheckState("main")).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("returns passing when all runs completed successfully", async () => {
    const getCheckState = await loadGetCheckState()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      checkRunsResponse([
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "skipped" },
      ]),
    ))
    expect(await getCheckState("branch-a")).toBe("passing")
  })

  it("returns failing when any run failed", async () => {
    const getCheckState = await loadGetCheckState()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      checkRunsResponse([
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "failure" },
      ]),
    ))
    expect(await getCheckState("branch-b")).toBe("failing")
  })

  it("returns pending when runs are still in progress", async () => {
    const getCheckState = await loadGetCheckState()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      checkRunsResponse([{ status: "in_progress", conclusion: null }]),
    ))
    expect(await getCheckState("branch-c")).toBe("pending")
  })

  it("returns null when there are no check runs", async () => {
    const getCheckState = await loadGetCheckState()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(checkRunsResponse([])))
    expect(await getCheckState("branch-d")).toBeNull()
  })

  it("returns null and does not throw on API errors", async () => {
    const getCheckState = await loadGetCheckState()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response))
    expect(await getCheckState("branch-e")).toBeNull()
  })

  it("caches results per ref for the TTL", async () => {
    const getCheckState = await loadGetCheckState()
    const fetchSpy = vi.fn().mockResolvedValue(
      checkRunsResponse([{ status: "completed", conclusion: "success" }]),
    )
    vi.stubGlobal("fetch", fetchSpy)
    await getCheckState("branch-f")
    await getCheckState("branch-f")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github/checks.test.ts`
Expected: FAIL — cannot resolve `./checks`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/github/checks.ts
export type CheckState = "pending" | "passing" | "failing"

const TTL_MS = 60_000
const cache = new Map<string, { state: CheckState | null; at: number }>()

const FAILING_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "action_required"])

/**
 * Fetches combined CI check state for a git ref (branch) via the GitHub
 * check-runs API. Returns null when the integration is unconfigured, there
 * are no check runs, or the API call fails. Results are cached for 60s.
 */
export async function getCheckState(ref: string): Promise<CheckState | null> {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  if (!token || !repo) return null

  const hit = cache.get(ref)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.state

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}/check-runs?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      },
    )
    if (!res.ok) throw new Error(`GitHub API responded ${res.status}`)
    const data = (await res.json()) as {
      check_runs?: Array<{ status: string; conclusion: string | null }>
    }
    const runs = data.check_runs ?? []

    let state: CheckState | null
    if (runs.length === 0) state = null
    else if (runs.some((r) => r.conclusion && FAILING_CONCLUSIONS.has(r.conclusion))) state = "failing"
    else if (runs.every((r) => r.status === "completed")) state = "passing"
    else state = "pending"

    cache.set(ref, { state, at: Date.now() })
    return state
  } catch (err) {
    console.error("[github checks] fetch failed:", err)
    return hit?.state ?? null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/github/checks.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github/checks.ts src/lib/github/checks.test.ts
git commit -m "feat: fetch CI check status for PR branches"
```

---

### Task 11: "Development" section UI

**Files:**
- Create: `src/components/tickets/github-dev-section.tsx`
- Modify: `src/components/tickets/ticket-detail-page.tsx` (props type ~line 405; destructure ~line 458; render site after `{intake && <IntakeCard intake={intake} />}` ~line 1457)
- Modify: `src/app/(dashboard)/tasks/[id]/page.tsx` (prisma include ~line 43; `<TicketDetailPage` props ~line 253)

No unit test — the project has no component-test setup (vitest env is `node`, no jsdom). Verification is typecheck + lint + manual dev-server check.

**Interfaces:**
- Consumes: `getCheckState` from `@/lib/github/checks`; `Ticket.pullRequests`/`Ticket.commits` relations from Task 1.
- Produces: `GitHubDevSection` component and types `DevPullRequest`, `DevCommit`, `GitHubDevData` exported from `@/components/tickets/github-dev-section`; new optional `github?: GitHubDevData | null` prop on `TicketDetailPage`.

- [ ] **Step 1: Create the section component**

Note on styling: `pen-*` utility classes (`pen-text-label`, `bg-pen-surface`) are the house design system — before finishing, grep `src/app/globals.css` (or wherever `pen-text-label` is defined) and match the border/muted-text utilities used by neighboring cards (e.g. `intake-card.tsx`) rather than inventing new ones.

```tsx
// src/components/tickets/github-dev-section.tsx
"use client";

export type DevPullRequest = {
  number: number;
  title: string;
  url: string;
  branch: string;
  authorLogin: string;
  state: "draft" | "open" | "merged" | "closed";
  checkState: "pending" | "passing" | "failing" | null;
};

export type DevCommit = {
  sha: string;
  message: string;
  url: string;
  authorLogin: string;
};

export type GitHubDevData = {
  pullRequests: DevPullRequest[];
  commits: DevCommit[];
};

const STATE_STYLES: Record<DevPullRequest["state"], string> = {
  draft: "bg-gray-500/15 text-gray-500",
  open: "bg-green-500/15 text-green-600",
  merged: "bg-purple-500/15 text-purple-600",
  closed: "bg-red-500/15 text-red-600",
};

const CHECK_STYLES: Record<NonNullable<DevPullRequest["checkState"]>, string> = {
  passing: "text-green-600",
  failing: "text-red-600",
  pending: "text-amber-600",
};

const CHECK_LABELS: Record<NonNullable<DevPullRequest["checkState"]>, string> = {
  passing: "✓ checks",
  failing: "✗ checks",
  pending: "● checks",
};

export function GitHubDevSection({ data }: { data: GitHubDevData }) {
  if (data.pullRequests.length === 0 && data.commits.length === 0) return null;

  return (
    <div>
      <p className="pen-text-label mb-2">Development</p>
      <div className="space-y-1.5">
        {data.pullRequests.map((pr) => (
          <a
            key={pr.number}
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md bg-pen-surface px-3 py-2 text-sm hover:opacity-80"
          >
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${STATE_STYLES[pr.state]}`}
            >
              {pr.state}
            </span>
            <span className="truncate font-medium">{pr.title}</span>
            <span className="shrink-0 opacity-60">#{pr.number}</span>
            {pr.checkState && (
              <span className={`shrink-0 text-xs ${CHECK_STYLES[pr.checkState]}`}>
                {CHECK_LABELS[pr.checkState]}
              </span>
            )}
            <span className="ml-auto hidden truncate text-xs opacity-60 sm:block">
              {pr.branch} · {pr.authorLogin}
            </span>
          </a>
        ))}
        {data.commits.map((commit) => (
          <a
            key={commit.sha}
            href={commit.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md bg-pen-surface px-3 py-2 text-sm hover:opacity-80"
          >
            <span className="shrink-0 font-mono text-xs opacity-60">
              {commit.sha.slice(0, 7)}
            </span>
            <span className="truncate">{commit.message.split("\n")[0]}</span>
            <span className="ml-auto shrink-0 text-xs opacity-60">
              {commit.authorLogin}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the prop through `TicketDetailPage`**

In `src/components/tickets/ticket-detail-page.tsx`:

Add the import near the other `@/components/tickets/*` imports (~line 76):

```tsx
import { GitHubDevSection, type GitHubDevData } from "@/components/tickets/github-dev-section";
```

In the props type (after `assetLinks?: { label: string; url: string }[];` ~line 405):

```tsx
  github?: GitHubDevData | null;
```

In the destructuring (after `assetLinks = [],` ~line 458):

```tsx
  github = null,
```

At the render site (~line 1457), after `{intake && <IntakeCard intake={intake} />}`:

```tsx
            {/* GitHub development activity */}
            {github && <GitHubDevSection data={github} />}
```

- [ ] **Step 3: Fetch and pass the data in the server page**

In `src/app/(dashboard)/tasks/[id]/page.tsx`:

Add imports:

```tsx
import { getCheckState } from "@/lib/github/checks";
import type { GitHubDevData } from "@/components/tickets/github-dev-section";
```

In the `prisma.ticket.findUnique` include (alongside `subTickets`, `comments`, etc.):

```tsx
      pullRequests: { include: { pr: true } },
      commits: { orderBy: { createdAt: "desc" } },
```

After the ticket is fetched and before the JSX return, build the prop (check state only for open/draft PRs; merged/closed don't need it):

```tsx
  const github: GitHubDevData = {
    pullRequests: await Promise.all(
      ticket.pullRequests.map(async ({ pr }) => ({
        number: pr.number,
        title: pr.title,
        url: pr.url,
        branch: pr.branch,
        authorLogin: pr.authorLogin,
        state: pr.state,
        checkState:
          pr.state === "open" || pr.state === "draft"
            ? await getCheckState(pr.branch)
            : null,
      })),
    ),
    commits: ticket.commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      url: c.url,
      authorLogin: c.authorLogin,
    })),
  };
```

In the `<TicketDetailPage` JSX (near `assetLinks={...}` ~line 308), add:

```tsx
        github={github}
```

(The ticket drawer variant fetches via API and won't pass `github`; the section simply stays hidden there — acceptable for v1.)

- [ ] **Step 4: Verify with lint, full test suite, and dev server**

Run: `npm run lint`
Expected: no new errors.

Run: `npm test`
Expected: all tests PASS.

Run: `npm run dev`, open a ticket page — with no linked PRs the page renders unchanged (section hidden). To see the section, insert a test row (Prisma-level `cuid()` defaults don't apply to raw SQL, so the id is explicit):

```bash
npx prisma db execute --stdin <<'SQL'
INSERT INTO "GitHubPullRequest" (id, number, title, url, branch, "authorLogin", state, "createdAt", "updatedAt")
VALUES ('test-pr-9999', 9999, 'Test PR', 'https://github.com', 'test/DEV-1', 'tester', 'open', NOW(), NOW());
INSERT INTO "TicketPullRequest" ("ticketId", "prId")
SELECT id, 'test-pr-9999' FROM "Ticket" WHERE "deletedAt" IS NULL LIMIT 1;
SQL
```

Open a ticket that has the link (find it with the SQL `SELECT "ticketId" FROM "TicketPullRequest" WHERE "prId" = 'test-pr-9999'` if needed) → Development section shows the PR. Then clean up:

```bash
npx prisma db execute --stdin <<'SQL'
DELETE FROM "TicketPullRequest" WHERE "prId" = 'test-pr-9999';
DELETE FROM "GitHubPullRequest" WHERE id = 'test-pr-9999';
SQL
```

- [ ] **Step 5: Commit**

```bash
git add src/components/tickets/github-dev-section.tsx src/components/tickets/ticket-detail-page.tsx "src/app/(dashboard)/tasks/[id]/page.tsx"
git commit -m "feat: Development section showing linked PRs and commits on ticket page"
```

---

### Task 12: Admin backfill route

**Files:**
- Create: `src/app/api/admin/github/backfill/route.ts`
- Test: `src/app/api/admin/github/backfill/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` from `@/lib/auth` (returns `{ profile, error }`); `upsertAndLinkPullRequest` from `@/lib/github/upsert-pr`.
- Produces: `POST /api/admin/github/backfill` → `{ ok: true, processed: number, linked: number }`. Links only — never changes ticket status.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/admin/github/backfill/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/github/upsert-pr", () => ({ upsertAndLinkPullRequest: vi.fn() }))

import { requireAdmin } from "@/lib/auth"
import { upsertAndLinkPullRequest } from "@/lib/github/upsert-pr"
import { POST } from "./route"

const mockRequireAdmin = vi.mocked(requireAdmin)
const mockUpsertPr = vi.mocked(upsertAndLinkPullRequest)

function apiPage(prs: Array<{ number: number }>) {
  return { ok: true, status: 200, json: async () => prs } as Response
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  process.env.GITHUB_TOKEN = "test-token"
  process.env.GITHUB_REPO = "PlanetEducationNetworks/PEN-Ticketing-System"
  mockRequireAdmin.mockResolvedValue({ profile: { id: "admin-1" }, error: null } as never)
  mockUpsertPr.mockResolvedValue({ prId: "pr-row", ticketIds: ["t1"] })
})

describe("POST /api/admin/github/backfill", () => {
  it("returns the auth error for non-admins", async () => {
    mockRequireAdmin.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as never)
    const res = await POST()
    expect(res.status).toBe(403)
  })

  it("returns 503 when GITHUB_TOKEN is missing", async () => {
    delete process.env.GITHUB_TOKEN
    const res = await POST()
    expect(res.status).toBe(503)
  })

  it("processes all open PRs from a single page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiPage([{ number: 1 }, { number: 2 }])))
    const res = await POST()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(mockUpsertPr).toHaveBeenCalledTimes(2)
    expect(body).toEqual({ ok: true, processed: 2, linked: 2 })
  })

  it("pages through results of exactly 100", async () => {
    const pageOf100 = Array.from({ length: 100 }, (_, i) => ({ number: i + 1 }))
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(apiPage(pageOf100))
      .mockResolvedValueOnce(apiPage([{ number: 101 }]))
    vi.stubGlobal("fetch", fetchSpy)
    const res = await POST()
    const body = await res.json()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(body.processed).toBe(101)
  })

  it("returns 502 when the GitHub API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response))
    const res = await POST()
    expect(res.status).toBe(502)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/admin/github/backfill/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/admin/github/backfill/route.ts
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import {
  upsertAndLinkPullRequest,
  type GitHubApiPullRequest,
} from "@/lib/github/upsert-pr"

/**
 * One-time (re-runnable) backfill: pages through the repo's open PRs and
 * runs each through the same parse-and-link pipeline as the webhook.
 * Links only — never changes ticket status.
 */
export async function POST() {
  const { error } = await requireAdmin()
  if (error) return error

  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  if (!token || !repo) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN and GITHUB_REPO must be configured" },
      { status: 503 },
    )
  }

  let page = 1
  let processed = 0
  let linked = 0
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
        { error: `GitHub API responded ${res.status}` },
        { status: 502 },
      )
    }
    const prs = (await res.json()) as GitHubApiPullRequest[]
    for (const pr of prs) {
      const result = await upsertAndLinkPullRequest(pr)
      processed += 1
      linked += result.ticketIds.length
    }
    if (prs.length < 100) break
    page += 1
  }

  return NextResponse.json({ ok: true, processed, linked })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/admin/github/backfill/route.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`
Expected: all tests PASS.

```bash
git add src/app/api/admin/github/backfill
git commit -m "feat: admin backfill route for existing open PRs"
```

---

### Task 13: Documentation

**Files:**
- Modify: `README.md` (append a section)

**Interfaces:**
- Consumes: everything above.
- Produces: setup documentation for env vars, the repo webhook, and team conventions.

- [ ] **Step 1: Append a "GitHub Integration" section to `README.md`**

```markdown
## GitHub Integration

Tickets link to GitHub PRs/commits automatically when a branch name, PR
title, PR body, or commit message contains a ticket reference like `DEV-42`
(`<team prefix>-<ticket number>`, case-insensitive).

PR lifecycle events also advance ticket status (forward-only, and only when
the team has a status with the exact label):

| GitHub event            | Ticket status |
| ----------------------- | ------------- |
| PR opened (non-draft)   | In Progress   |
| PR marked ready for review | In Review  |
| PR merged               | Done          |

Intake-linked tickets are never auto-completed (they require a resolution
note). A non-merged close never changes status.

### Environment variables

| Variable                | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret shared with the repo webhook (required)            |
| `GITHUB_REPO`           | `PlanetEducationNetworks/PEN-Ticketing-System` (required)      |
| `GITHUB_TOKEN`          | Fine-grained PAT, read-only Pull requests + Checks on this repo (optional — enables CI check badges and backfill) |

### Repo webhook setup (GitHub → Settings → Webhooks → Add webhook)

- Payload URL: `https://<deployed-origin>/api/webhooks/github`
- Content type: `application/json`
- Secret: the value of `GITHUB_WEBHOOK_SECRET`
- Events: select **Pull requests** and **Pushes**

### Backfill existing open PRs (admin session required)

    curl -X POST https://<deployed-origin>/api/admin/github/backfill

Safe to re-run; it only creates missing links and never changes ticket status.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: GitHub integration setup guide"
```

---

## Self-Review Notes

- **Spec coverage:** data model → Task 1; signature verification → Task 3; ref parsing → Task 2; forward-only guard + intake skip → Tasks 4/6; pull_request events → Task 8; push/commits → Task 9; check status → Task 10; Development UI → Task 11; backfill → Task 12; env/setup docs → Task 13. The spec's `edited`/`converted_to_draft`/`reopened` rows are covered by Task 8's uniform upsert-and-relink on every `pull_request` action (state field recomputed each time; no status target for those actions).
- **Type consistency:** `TicketRef`, `GitHubApiPullRequest`, `GitHubDevData`, `pickStatusMove`, and `upsertAndLinkPullRequest` signatures are identical wherever referenced.
- **Known judgment calls (from the approved spec):** webhook bypasses the sequential-transition rule on purpose; ActivityLog attribution falls back to the ticket creator via the DB trigger; drawer view omits the Development section in v1.
