# Manager View Redesign — "Morning Briefing"

**Date:** 2026-07-22
**Status:** Approved by Dumitru-radu
**Replaces:** current layout of `src/components/manager/manager-dashboard.tsx`

## Problem

The current manager dashboard fails the "understand where we are in 5 seconds" test:

- Two oversized clocks consume the top-right quarter of the header.
- Overdue Tickets renders as a flat wall of ~29 near-identical rows (mostly one
  project, one assignee, same lateness) with no grouping or insight.
- Needs Review is a second flat wall (50 items).
- Approval Requests occupies half the right column even when empty.
- No answer to "who is working on what today", no unassigned-ticket triage,
  no activity, no project health.
- Fixed-viewport layout (`h-full overflow-hidden`) forces panels into internal
  scrollbars instead of letting the page breathe.

## Goal

A single scrollable page ordered by "what's on fire" first, that tells the
manager in the first screenful: what needs intervention, who is doing what,
and where each project stands.

## Layout (top → bottom, single scroll)

### 1. Compact header

- One-line greeting (`Good morning, Dumitru.`) — no oversized display text block.
- **Digest sentence** below the greeting, composed server-side from the data,
  e.g. *"29 overdue (18 in EducateU) · 50 waiting for review · 2 unassigned ·
  12 tickets moved today."* Segments with zero counts are omitted.
- Clocks shrink to small inline text (`11:06 BST · 16:06 GMT+6`) right-aligned;
  keep `DualClock` component but add/use a compact variant.
- KPI chips row (Overdue / Needs Review / Unassigned / Requests). A chip with a
  zero count is hidden. Chips anchor-scroll to their section.

### 2. Needs Attention

Collapsible groups replace the two flat panels:

- **Overdue, grouped by project.** Group header row: project color dot, name,
  count, worst lateness (e.g. "up to 19d late"), stacked assignee avatars.
  Click expands the ticket rows (existing `OverdueRow` styling). Groups sorted
  by count desc. Tickets with no project fall into a "No project" group.
  First group (or all groups with ≤3 tickets) starts expanded; the rest start
  collapsed.
- **Unassigned.** Open tickets in scope with `assigneeId = null`, not in a done
  status — these need triage. Flat rows, always expanded (expected to be few).
- **Needs Review, grouped by assignee.** Same collapsible pattern; shows the
  requester avatar, status pill (PR vs Review), comment count. Existing query
  is reused.
- **Approval Requests.** Rendered ONLY when there is at least one pending
  request. Row UI (approve/reject buttons, optimistic removal, notifEvents
  refresh) is carried over unchanged.

Empty sections render nothing — no empty-state cards on this page.

### 3. Team Today

One card per member of the managed teams (grid, wraps):

- Avatar, name.
- **Now:** the member's most recently updated in-progress ticket (title +
  humanId, DrawerLink). If none: "idle" badge with days since their last
  activity (from ActivityLog).
- Counts: open / overdue / in review (small colored figures).
- "Last active Xh ago" from their newest ActivityLog entry within scope.

Sorted: members with overdue work first, then by open count desc, idle last.

### 4. Projects

Health card per project that has tickets in the managed teams: name, color,
progress bar (done/total using the existing `DONE_STATUSES` list), overdue
count, active (in-progress) count. Replaces the per-team `TeamStatCard` strip —
team totals live in the digest sentence instead.

### 5. Today's Activity

Feed of `ActivityLog` entries since midnight Dhaka time (same "today"
convention as the existing `startOfToday` in `manager/page.tsx`), scoped to
tickets in the managed teams, newest first, capped at 30 with the count noted
when truncated. Row: time (HH:mm), actor avatar + name, action phrase,
ticket humanId as DrawerLink. Action → phrase mapping reuses the wording
already established in the Activity page components.

## Data layer (`src/app/(dashboard)/manager/page.tsx`)

Existing queries kept: overdue tickets/count, review tickets, join requests.
Removed: per-team stat counts (replaced by per-project aggregates; team totals
derivable from the same fetch). New queries (all `Promise.all`-batched):

1. **Unassigned:** `ticket.findMany` where `teamId in scope`, `deletedAt: null`,
   `assigneeId: null`, `status notIn DONE_STATUSES` (+ not-started statuses are
   INCLUDED — unassigned "To Do" is exactly what needs triage).
2. **Members + workload:** team members of managed teams; per member counts of
   open / overdue / in-review tickets and their latest in-progress ticket.
   Implemented as one `ticket.findMany` over open tickets in scope selecting
   `assigneeId, status, dueDate, updatedAt, title, ticketNumber, team.prefix`
   and aggregated in JS (ticket volume per manager scope is modest; avoids N+1).
3. **Project health:** `ticket.groupBy` by `projectId`/status-bucket or a
   single scoped fetch aggregated in JS alongside (2).
4. **Today's activity:** `activityLog.findMany` where
   `createdAt >= startOfToday` and `ticket.teamId in scope`, include actor
   (name, avatarUrl) and ticket (id, ticketNumber, team.prefix, title),
   `orderBy createdAt desc`, `take 30`.
5. **Moved today count** (for digest): count of distinct tickets with a
   STATUS_CHANGED activity entry today (derived from query 4's data or a
   cheap extra count).

No schema changes. No new API routes — everything is server-rendered like the
current page; the join-request PATCH flow is unchanged.

## Component structure

`manager-dashboard.tsx` is currently one 365-line file; the redesign splits it:

```
src/components/manager/
  manager-dashboard.tsx      — page shell: header, digest, section composition
  attention-section.tsx      — collapsible groups (overdue/unassigned/review/approvals)
  team-today-section.tsx     — member cards
  projects-section.tsx       — project health cards
  activity-today-section.tsx — today's feed
```

Row components (`OverdueRow`, `ReviewRow`, `JoinRow`) move with their sections.
Styling stays within the existing `pen-*` design tokens, fonts, and DrawerLink
patterns — this is a rearrangement, not a re-theme.

The root container drops `h-full overflow-hidden` in favor of normal page
scroll; sections are plain stacked blocks with sticky-ish section headers not
required (YAGNI).

## Error handling & edge cases

- Manager with zero teams in scope: header + "No teams in your scope" note
  (current behavior implicitly shows empty panels; make it explicit).
- All-clear day (nothing overdue/unassigned/review/requests): Needs Attention
  collapses to a single "Nothing needs your attention" line — the one
  intentional empty state.
- Members with zero tickets and zero activity still appear in Team Today
  (marked idle) — invisibility is the failure mode this section exists to fix.
- `dueDate` null tickets are never "overdue" (unchanged).

## Testing

- Existing route/API tests are untouched (no API changes).
- Unit-test the new pure aggregation helpers (member workload, project
  buckets, digest composition) — extracted to
  `src/components/manager/aggregate.ts` (or `src/lib`) as pure functions over
  fetched rows so they're testable without Prisma.
- Manual verification against the shared dev DB (24-failure baseline noted in
  project memory — don't chase pre-existing failures).

## Out of scope

- No changes to member home, admin dashboard, or Activity page.
- No new notification types.
- No re-theming beyond the layout rearrangement.
