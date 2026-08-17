# GitHub Status Mapping v2 + Drawer Support — Design

**Date:** 2026-07-07
**Status:** Approved (user chose "Both" mapping options + drawer support)
**Builds on:** `2026-07-06-github-integration-design.md` (shipped)

## Goals

1. Teams whose status labels don't match the fixed names ("In Progress"/"In Review"/"Done") still get useful automation via **smart defaults**, with a **per-team override UI** for full control.
2. The **Development section appears in the board drawer**, not only the full ticket page.

## 1. Smart default resolution

New pure resolver in `src/lib/github/status-map.ts`:

```ts
export type GitHubStatusEvent = "prOpened" | "prReadyForReview" | "prMerged"
resolveTargetLabel(event, statuses /* ordered by order asc */, config): string | null
```

Per event, when no override is configured:
- `prOpened` → status labeled "In Progress" (case-insensitive), else skip.
- `prReadyForReview` → first **non-complete** status whose label (case-insensitive) is one of: "In Review", "Review", "Code Review", "Pull Request". Non-complete guard: a review request must never auto-close a ticket (WEB's "Pull Request" status is complete-flagged).
- `prMerged` → status labeled "Done" (case-insensitive), else the team's **first `isComplete` status in order** — the same rule `cascadeCompleteToSubtickets` uses.

Resolution feeds the existing `pickStatusMove` guard unchanged (forward-only, exact current-status match, intake tickets never auto-completed).

## 2. Per-team override

New model, 1:1 on Team (mirrors `TeamTicketCounter`):

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

Field semantics: `null` = smart default; `""` = automation disabled for that event; any other string = exact status label (validated against `TeamStatus` on save; a configured label that no longer exists resolves to skip at runtime).

`advanceTicketStatus(ticketId, event)` now takes the event, loads the team's statuses + map row, resolves the target label, then applies the existing guard/update/side-effect logic. The webhook passes events instead of labels.

## 3. Config UI

- **API:** `GET/PUT /api/teams/[id]/github-map`. GET returns `{ config, defaults }` where `defaults` are the labels the smart resolution would pick today (for display). PUT validates and upserts. Guard: same `canManageTeam` logic as the statuses API — extracted to `src/lib/team-manage.ts` and reused by both.
- **UI:** a "GitHub automation" card appended to **Settings → Workflows & statuses** (`settings-workflows-page.tsx`), scoped by the page's existing team selector. Three selects (PR opened / Ready for review / PR merged), options: `Auto (→ <resolved label or "skip">)`, `No change`, and each team status. Saves on change via the PUT endpoint. Card follows the page's existing card/heading classes.

## 4. Drawer support

- `src/lib/github/dev-data.ts`: shared `buildGitHubDevData(ticket)` (PR mapping + `getCheckState` for open/draft PRs); `src/app/(dashboard)/tasks/[id]/page.tsx` refactored to use it.
- `src/lib/ticket-detail-data.ts`: `ticketCoreInclude` gains `pullRequests: { include: { pr: true } }` and `commits: { orderBy: { createdAt: "desc" } }`; `getTicketDetailPayload` returns `github: await buildGitHubDevData(ticket)`. The drawer's `{...data}` spread delivers it to the existing `github` prop — no drawer component change.
- `src/lib/ticket-detail-placeholder.ts`: `github: null` stubs (placeholder builds props without the API).

## 5. Testing

- Resolver: override precedence ("" disables, label validated, null falls through), each default rule incl. the non-complete review guard and first-complete merged fallback.
- advance-status: event-based resolution wired to config row; existing guard tests preserved.
- github-map API: guard behavior, validation (unknown label rejected), upsert round-trip, GET defaults shape.
- Existing webhook tests updated from labels to events.

## Out of scope

Multi-repo, checks config, backfill changes, drawer visual redesign.
