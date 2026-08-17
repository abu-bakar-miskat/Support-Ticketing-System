# Manager View "Morning Briefing" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the manager dashboard as a single scrollable "Morning Briefing" page: compact header + digest, grouped Needs Attention, per-member Team Today, project health cards, and a today's-activity feed.

**Architecture:** Server component (`manager/page.tsx`) fetches raw rows via Prisma and aggregates them with pure functions in `src/components/manager/aggregate.ts` (unit-tested with Vitest). A slim client shell (`manager-dashboard.tsx`) composes four section components; interactive bits (collapsible groups, join-request actions) stay client-side.

**Tech Stack:** Next.js 16 App Router (see `node_modules/next/dist/docs/` for any API you're unsure of), Prisma, Tailwind with `pen-*` design tokens, Vitest.

## Global Constraints

- **DO NOT COMMIT.** User inspects on localhost first, then approves commits explicitly (standing project rule).
- Stay on branch `dev-v2`.
- Reuse existing tokens/components: `pen-card`, `pen-surface`, `pen-foreground`, `pen-muted`, `pen-subtle`, `pen-id`, `pen-blue`, `pen-page-header`, `pen-text-display`, `pen-text-section-label`, `UserAvatar`, `DrawerLink`, `cn`.
- `DONE_STATUSES` list is copied verbatim from current `manager/page.tsx` (includes review/PR stages).
- "Today" = midnight in `Asia/Dhaka`, matching existing `startOfToday` logic.
- Shared dev Supabase DB has a pre-existing 24-failure test baseline — only the new `aggregate.test.ts` must pass; do not chase unrelated failures.
- Test runner: `npx vitest run <file>`.

---

### Task 1: Pure aggregation helpers

**Files:**
- Create: `src/components/manager/aggregate.ts`
- Test: `src/components/manager/aggregate.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2 & 6):
  - `type OpenTicketRow`, `type MemberRow`, `type MemberWorkload`, `type ProjectHealth`
  - `buildMemberWorkloads(members: MemberRow[], openTickets: OpenTicketRow[], lastActivityByActor: Record<string, string>, startOfToday: Date): MemberWorkload[]`
  - `buildProjectHealth(allTickets: ProjectTicketRow[], startOfToday: Date): ProjectHealth[]`
  - `buildDigest(parts: DigestParts): string`
  - `IN_REVIEW_STATUSES`, `NOT_STARTED_STATUSES` constants

- [ ] **Step 1: Write the failing test**

```ts
// src/components/manager/aggregate.test.ts
import { describe, it, expect } from "vitest";
import {
  buildMemberWorkloads,
  buildProjectHealth,
  buildDigest,
  type OpenTicketRow,
  type MemberRow,
  type ProjectTicketRow,
} from "./aggregate";

const T0 = new Date("2026-07-22T00:00:00Z"); // startOfToday for tests

const members: MemberRow[] = [
  { id: "u1", name: "Miskat", avatarUrl: null },
  { id: "u2", name: "Nur", avatarUrl: null },
  { id: "u3", name: "Sadia", avatarUrl: null },
];

function ticket(over: Partial<OpenTicketRow>): OpenTicketRow {
  return {
    id: "t", humanId: "WEB-1", title: "x", status: "In Progress",
    priority: "Medium", dueDate: null, updatedAt: "2026-07-21T10:00:00Z",
    assigneeId: null, projectId: null, projectName: null, projectColor: null,
    ...over,
  };
}

describe("buildMemberWorkloads", () => {
  it("computes counts, current ticket, and sorts overloaded first / idle last", () => {
    const rows: OpenTicketRow[] = [
      ticket({ id: "a", humanId: "WEB-10", assigneeId: "u1", status: "In Progress", updatedAt: "2026-07-21T09:00:00Z" }),
      ticket({ id: "b", humanId: "WEB-11", assigneeId: "u1", status: "In Progress", updatedAt: "2026-07-21T12:00:00Z" }),
      ticket({ id: "c", humanId: "WEB-12", assigneeId: "u1", status: "To Do", dueDate: "2026-07-20T00:00:00Z" }), // overdue
      ticket({ id: "d", humanId: "WEB-13", assigneeId: "u2", status: "Pull Request" }), // in review, not open-active
    ];
    const out = buildMemberWorkloads(members, rows, { u2: "2026-07-22T05:00:00Z" }, T0);

    expect(out.map((m) => m.name)).toEqual(["Miskat", "Nur", "Sadia"]); // overdue first, then active, idle last
    const miskat = out[0];
    expect(miskat.open).toBe(3);
    expect(miskat.overdue).toBe(1);
    expect(miskat.inReview).toBe(0);
    expect(miskat.current?.humanId).toBe("WEB-11"); // most recently updated in-progress
    const nur = out[1];
    expect(nur.inReview).toBe(1);
    expect(nur.current).toBeNull(); // PR stage is not "working on now"
    expect(nur.lastActivityAt).toBe("2026-07-22T05:00:00Z");
    const sadia = out[2];
    expect(sadia.open).toBe(0);
    expect(sadia.idle).toBe(true);
  });

  it("does not mark done-status or null-dueDate tickets overdue", () => {
    const rows = [ticket({ assigneeId: "u1", status: "In Progress", dueDate: null })];
    const out = buildMemberWorkloads(members.slice(0, 1), rows, {}, T0);
    expect(out[0].overdue).toBe(0);
  });
});

describe("buildProjectHealth", () => {
  it("buckets per project with no-project fallback, sorted by total desc", () => {
    const rows: ProjectTicketRow[] = [
      { projectId: "p1", projectName: "EducateU", projectColor: "#111", status: "Done", dueDate: null },
      { projectId: "p1", projectName: "EducateU", projectColor: "#111", status: "In Progress", dueDate: "2026-07-20T00:00:00Z" },
      { projectId: "p1", projectName: "EducateU", projectColor: "#111", status: "To Do", dueDate: null },
      { projectId: null, projectName: null, projectColor: null, status: "In Progress", dueDate: null },
    ];
    const out = buildProjectHealth(rows, T0);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "EducateU", total: 3, done: 1, overdue: 1, active: 1 });
    expect(out[1].name).toBe("No project");
  });
});

describe("buildDigest", () => {
  it("joins non-zero segments and omits zero ones", () => {
    expect(
      buildDigest({ overdue: 29, topOverdueProject: "EducateU", topOverdueCount: 18, review: 50, unassigned: 2, movedToday: 12, requests: 0 }),
    ).toBe("29 overdue (18 in EducateU) · 50 waiting for review · 2 unassigned · 12 tickets moved today");
    expect(
      buildDigest({ overdue: 0, topOverdueProject: null, topOverdueCount: 0, review: 0, unassigned: 0, movedToday: 0, requests: 0 }),
    ).toBe("All clear — nothing needs your attention right now.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/manager/aggregate.test.ts`
Expected: FAIL — `Cannot find module './aggregate'` (or missing exports).

- [ ] **Step 3: Write the implementation**

```ts
// src/components/manager/aggregate.ts
// Pure aggregation for the manager Morning Briefing — no Prisma imports so it
// stays unit-testable.

export const DONE_STATUSES = [
  "Live", "Done", "Completed", "Closed",
  "Pull Request", "In Review", "Code Review", "Needs Review", "Review",
];

export const IN_REVIEW_STATUSES = ["Review", "In Review", "Code Review", "Needs Review", "Pull Request"];
export const NOT_STARTED_STATUSES = ["Not Started", "To Do"];

export type OpenTicketRow = {
  id: string; humanId: string; title: string; status: string; priority: string;
  dueDate: string | null; updatedAt: string;
  assigneeId: string | null;
  projectId: string | null; projectName: string | null; projectColor: string | null;
};

export type MemberRow = { id: string; name: string; avatarUrl: string | null };

export type MemberWorkload = {
  id: string; name: string; avatarUrl: string | null;
  open: number; overdue: number; inReview: number;
  current: { id: string; humanId: string; title: string } | null;
  lastActivityAt: string | null;
  idle: boolean;
};

export type ProjectTicketRow = {
  projectId: string | null; projectName: string | null; projectColor: string | null;
  status: string; dueDate: string | null;
};

export type ProjectHealth = {
  projectId: string | null; name: string; color: string;
  total: number; done: number; overdue: number; active: number;
};

function isOverdue(dueDate: string | null, status: string, startOfToday: Date) {
  return !!dueDate && new Date(dueDate) < startOfToday && !DONE_STATUSES.includes(status);
}

function isActive(status: string) {
  return !DONE_STATUSES.includes(status) && !NOT_STARTED_STATUSES.includes(status);
}

export function buildMemberWorkloads(
  members: MemberRow[],
  openTickets: OpenTicketRow[],
  lastActivityByActor: Record<string, string>,
  startOfToday: Date,
): MemberWorkload[] {
  const byMember = new Map<string, OpenTicketRow[]>();
  for (const t of openTickets) {
    if (!t.assigneeId) continue;
    const list = byMember.get(t.assigneeId) ?? [];
    list.push(t);
    byMember.set(t.assigneeId, list);
  }

  const out = members.map((m): MemberWorkload => {
    const tickets = byMember.get(m.id) ?? [];
    const inReview = tickets.filter((t) => IN_REVIEW_STATUSES.includes(t.status));
    const openNotReview = tickets.filter((t) => !IN_REVIEW_STATUSES.includes(t.status));
    const overdue = openNotReview.filter((t) => isOverdue(t.dueDate, t.status, startOfToday));
    const inProgress = openNotReview
      .filter((t) => isActive(t.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const current = inProgress[0]
      ? { id: inProgress[0].id, humanId: inProgress[0].humanId, title: inProgress[0].title }
      : null;
    return {
      id: m.id, name: m.name, avatarUrl: m.avatarUrl,
      open: openNotReview.length,
      overdue: overdue.length,
      inReview: inReview.length,
      current,
      lastActivityAt: lastActivityByActor[m.id] ?? null,
      idle: !current,
    };
  });

  return out.sort((a, b) =>
    (b.overdue - a.overdue) || (b.open - a.open) || (Number(a.idle) - Number(b.idle)) || a.name.localeCompare(b.name),
  );
}

export function buildProjectHealth(rows: ProjectTicketRow[], startOfToday: Date): ProjectHealth[] {
  const byProject = new Map<string, ProjectHealth>();
  for (const r of rows) {
    const key = r.projectId ?? "__none__";
    const entry = byProject.get(key) ?? {
      projectId: r.projectId,
      name: r.projectName ?? "No project",
      color: r.projectColor ?? "#64748b",
      total: 0, done: 0, overdue: 0, active: 0,
    };
    entry.total += 1;
    if (DONE_STATUSES.includes(r.status)) entry.done += 1;
    if (isOverdue(r.dueDate, r.status, startOfToday)) entry.overdue += 1;
    if (isActive(r.status)) entry.active += 1;
    byProject.set(key, entry);
  }
  return [...byProject.values()].sort((a, b) => b.total - a.total);
}

export type DigestParts = {
  overdue: number; topOverdueProject: string | null; topOverdueCount: number;
  review: number; unassigned: number; movedToday: number; requests: number;
};

export function buildDigest(p: DigestParts): string {
  const segments: string[] = [];
  if (p.overdue > 0) {
    const top = p.topOverdueProject && p.topOverdueCount > 0 ? ` (${p.topOverdueCount} in ${p.topOverdueProject})` : "";
    segments.push(`${p.overdue} overdue${top}`);
  }
  if (p.review > 0) segments.push(`${p.review} waiting for review`);
  if (p.unassigned > 0) segments.push(`${p.unassigned} unassigned`);
  if (p.movedToday > 0) segments.push(`${p.movedToday} tickets moved today`);
  if (p.requests > 0) segments.push(`${p.requests} pending requests`);
  if (segments.length === 0) return "All clear — nothing needs your attention right now.";
  return segments.join(" · ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/manager/aggregate.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: No commit** — user inspects localhost before any commit.

---

### Task 2: Server data layer rework

**Files:**
- Modify: `src/app/(dashboard)/manager/page.tsx` (whole `ManagerData` body)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces props for `ManagerDashboard` (Task 6):

```ts
{
  managerName: string;
  digest: string;
  kpis: { overdue: number; review: number; unassigned: number; requests: number };
  overdueGroups: OverdueGroup[];      // Task 3 type
  unassignedTickets: SimpleTicket[];  // Task 3 type
  reviewGroups: ReviewGroup[];        // Task 3 type
  joinRequests: JoinRequest[];        // unchanged shape from current code
  members: MemberWorkload[];          // Task 1 type
  projects: ProjectHealth[];          // Task 1 type
  activity: ActivityItem[];           // Task 5 type
  noTeams: boolean;
}
```

- [ ] **Step 1: Rewrite `ManagerData` queries**

Keep: profile/redirect guards, `deptScope`, `teamIds`, `startOfToday` (Dhaka), join-requests query — all verbatim from current file. Replace the ticket queries and team stats with:

```ts
import {
  DONE_STATUSES, IN_REVIEW_STATUSES,
  buildMemberWorkloads, buildProjectHealth, buildDigest,
  type OpenTicketRow, type ProjectTicketRow,
} from "@/components/manager/aggregate";

const [openTickets, allScopedTickets, teamMembers, todayActivity, pendingJoinRequests] = await Promise.all([
  // Every non-done ticket in scope — feeds overdue groups, unassigned,
  // review groups, and member workloads in one query.
  prisma.ticket.findMany({
    where: { deletedAt: null, teamId: { in: teamIds }, status: { notIn: ["Live", "Done", "Completed", "Closed"] } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, ticketNumber: true, title: true, priority: true, status: true,
      dueDate: true, updatedAt: true, assigneeId: true,
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      creator: { select: { id: true, name: true, avatarUrl: true } },
      team: { select: { prefix: true } },
      project: { select: { id: true, name: true, color: true } },
      _count: { select: { comments: true } },
    },
  }),
  // Lightweight full-scope fetch for project health (includes done tickets).
  prisma.ticket.findMany({
    where: { deletedAt: null, teamId: { in: teamIds } },
    select: { status: true, dueDate: true, project: { select: { id: true, name: true, color: true } } },
  }),
  // Members of managed teams.
  prisma.profile.findMany({
    where: { teamMemberships: { some: { teamId: { in: teamIds } } } },
    select: { id: true, name: true, avatarUrl: true },
    orderBy: { name: "asc" },
  }),
  // Today's activity in scope.
  prisma.activityLog.findMany({
    where: { createdAt: { gte: startOfToday }, ticket: { teamId: { in: teamIds }, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    take: 200, // raw cap; UI caps at 30, extras feed lastActivity + movedToday
    select: {
      id: true, action: true, createdAt: true, metadata: true,
      actor: { select: { id: true, name: true, avatarUrl: true } },
      ticket: { select: { id: true, ticketNumber: true, title: true, team: { select: { prefix: true } } } },
    },
  }),
  /* join-requests query — unchanged from current file */
]);
```

> **Check the actual Prisma schema field name for team membership** (`teamMemberships` above): open `prisma/schema.prisma`, find the relation on `Profile` that links to `TeamMember`/`Team`, and use its exact name. If members are linked via a `TeamMember` join model, the where clause is `{ teamMemberships: { some: { teamId: { in: teamIds } } } }` with the real relation name.

- [ ] **Step 2: Aggregate in JS after the fetch**

```ts
const toRow = (t: (typeof openTickets)[number]): OpenTicketRow => ({
  id: t.id,
  humanId: `${t.team.prefix}-${t.ticketNumber}`,
  title: t.title, status: t.status, priority: t.priority,
  dueDate: t.dueDate?.toISOString() ?? null,
  updatedAt: t.updatedAt.toISOString(),
  assigneeId: t.assigneeId,
  projectId: t.project?.id ?? null,
  projectName: t.project?.name ?? null,
  projectColor: t.project?.color ?? null,
});
const rows = openTickets.map(toRow);

const overdueRows = openTickets.filter(
  (t) => t.dueDate && t.dueDate < startOfToday && !DONE_STATUSES.includes(t.status),
);
const unassignedRows = openTickets.filter(
  (t) => !t.assigneeId && !IN_REVIEW_STATUSES.includes(t.status),
);
const reviewRows = openTickets.filter((t) => IN_REVIEW_STATUSES.includes(t.status));

const toSimple = (t: (typeof openTickets)[number]) => ({
  id: t.id, humanId: `${t.team.prefix}-${t.ticketNumber}`, title: t.title,
  priority: t.priority, status: t.status,
  dueDate: t.dueDate?.toISOString() ?? null, updatedAt: t.updatedAt.toISOString(),
  comments: t._count.comments,
  assignee: t.assignee ? { name: t.assignee.name, avatarUrl: t.assignee.avatarUrl ?? null } : null,
  requester: { name: t.creator.name, avatarUrl: t.creator.avatarUrl ?? null },
});

// Overdue grouped by project, count desc
const overdueByProject = new Map<string, { key: string; name: string; color: string; tickets: typeof overdueRows }>();
for (const t of overdueRows) {
  const key = t.project?.id ?? "__none__";
  const g = overdueByProject.get(key) ?? {
    key, name: t.project?.name ?? "No project", color: t.project?.color ?? "#64748b", tickets: [],
  };
  g.tickets.push(t);
  overdueByProject.set(key, g);
}
const daysLateOf = (t: (typeof overdueRows)[number]) =>
  Math.floor((startOfToday.getTime() - t.dueDate!.getTime()) / 86_400_000) + 1;
const overdueGroups = [...overdueByProject.values()]
  .sort((a, b) => b.tickets.length - a.tickets.length)
  .map((g) => ({
    key: g.key, name: g.name, color: g.color,
    worstDaysLate: Math.max(...g.tickets.map(daysLateOf)),
    tickets: g.tickets
      .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
      .map(toSimple),
  }));

// Review grouped by assignee, count desc
const reviewByAssignee = new Map<string, { key: string; name: string; avatarUrl: string | null; tickets: typeof reviewRows }>();
for (const t of reviewRows) {
  const key = t.assignee?.id ?? "__none__";
  const g = reviewByAssignee.get(key) ?? {
    key, name: t.assignee?.name ?? "Unassigned", avatarUrl: t.assignee?.avatarUrl ?? null, tickets: [],
  };
  g.tickets.push(t);
  reviewByAssignee.set(key, g);
}
const reviewGroups = [...reviewByAssignee.values()]
  .sort((a, b) => b.tickets.length - a.tickets.length)
  .map((g) => ({ key: g.key, name: g.name, avatarUrl: g.avatarUrl, tickets: g.tickets.map(toSimple) }));

const lastActivityByActor: Record<string, string> = {};
for (const a of todayActivity) {
  if (!lastActivityByActor[a.actor.id]) lastActivityByActor[a.actor.id] = a.createdAt.toISOString();
}
const movedToday = new Set(
  todayActivity.filter((a) => a.action === "STATUS_CHANGED").map((a) => a.ticket.id),
).size;

const projectRows: ProjectTicketRow[] = allScopedTickets.map((t) => ({
  projectId: t.project?.id ?? null, projectName: t.project?.name ?? null,
  projectColor: t.project?.color ?? null, status: t.status,
  dueDate: t.dueDate?.toISOString() ?? null,
}));

const members = buildMemberWorkloads(teamMembers, rows, lastActivityByActor, startOfToday);
const projects = buildProjectHealth(projectRows, startOfToday);

const topOverdue = overdueGroups[0] ?? null;
const digest = buildDigest({
  overdue: overdueRows.length,
  topOverdueProject: topOverdue?.name ?? null,
  topOverdueCount: topOverdue?.tickets.length ?? 0,
  review: reviewRows.length,
  unassigned: unassignedRows.length,
  movedToday,
  requests: pendingJoinRequests.length,
});
```

Pass everything to `<ManagerDashboard …/>` per the Interfaces block. Activity items: map the first 30 of `todayActivity` to `ActivityItem` (Task 5 shape), plus `activityTotal: todayActivity.length`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v generated | head -30`
Expected: no new errors in `src/app/(dashboard)/manager/` or `src/components/manager/` (the dashboard component still has old props until Task 6 — acceptable to sequence Tasks 3–6 before typechecking clean; if so, run this step at the end of Task 6 instead).

- [ ] **Step 4: No commit.**

---

### Task 3: Needs Attention section

**Files:**
- Create: `src/components/manager/attention-section.tsx`

**Interfaces:**
- Produces:

```ts
export type SimpleTicket = {
  id: string; humanId: string; title: string; priority: string; status: string;
  dueDate: string | null; updatedAt: string; comments: number;
  assignee: { name: string; avatarUrl: string | null } | null;
  requester: { name: string; avatarUrl: string | null } | null;
};
export type OverdueGroup = { key: string; name: string; color: string; worstDaysLate: number; tickets: SimpleTicket[] };
export type ReviewGroup  = { key: string; name: string; avatarUrl: string | null; tickets: SimpleTicket[] };
export type JoinRequest  = { id: string; message: string; requestedAt: string; user: { name: string; email: string; avatarUrl: string | null }; target: string; teamId: string | null; departmentId: string | null };

export function AttentionSection(props: {
  overdueGroups: OverdueGroup[];
  unassignedTickets: SimpleTicket[];
  reviewGroups: ReviewGroup[];
  joinRequests: JoinRequest[];
}): JSX.Element | null;
```

- [ ] **Step 1: Implement the component**

Client component (`"use client"`). Structure:

- Section header: flame-style icon (`AlertTriangle`), label `Needs Attention`, using `pen-text-section-label` styling conventions.
- If everything is empty → single line card: green check + `Nothing needs your attention.` (the one allowed empty state), return early.
- **Overdue groups:** each group is a `<details>`-style collapsible implemented with `useState` open-set (`Set<string>`, initialised to groups with ≤3 tickets plus the first group). Group header button row: project color dot, name, `{n} overdue`, `up to {worstDaysLate}d late` in red, stacked assignee avatars (max 4, `UserAvatar size={18}` with `-ml-1.5` overlap), chevron. Expanded body renders ticket rows.
- **Ticket row** (shared within this file): copy the current `OverdueRow` row layout from `manager-dashboard.tsx` (priority dot, mono humanId, title, assignee avatar, lateness label right-aligned, `DrawerLink` wrapper, `h-10` row, hover classes) — reuse verbatim styling.
- **Unassigned:** flat list of the same ticket rows, header `Unassigned — needs triage` with amber accent, always expanded; hidden when empty.
- **Review groups:** same collapsible pattern keyed by assignee name; rows reuse the current `ReviewRow` layout (status pill purple for PR / blue otherwise, comment count, requester avatar, `timeAgo`). All groups start collapsed; header shows count.
- **Approvals:** render the current `JoinRow` component (move it into this file unchanged, including the `fetch PATCH /api/join-requests/:id` handler, optimistic removal via local state, `router.refresh()` in a transition) — but the whole block renders only when `joinRequests.length > 0`.
- Move helpers `daysLate`, `timeAgo`, `PRIORITY_COLOR` into this file (they leave the old dashboard in Task 6).

- [ ] **Step 2: No standalone test** — presentational; covered by typecheck + localhost inspection. (Aggregation logic was tested in Task 1.)

- [ ] **Step 3: No commit.**

---

### Task 4: Team Today section

**Files:**
- Create: `src/components/manager/team-today-section.tsx`

**Interfaces:**
- Consumes: `MemberWorkload` from `./aggregate`.
- Produces: `export function TeamTodaySection({ members }: { members: MemberWorkload[] }): JSX.Element | null;`

- [ ] **Step 1: Implement the component**

Server-compatible (no hooks — plain component, no `"use client"` needed since `DrawerLink` handles its own interactivity). Returns `null` when `members.length === 0`.

- Section header: `Users` icon + `Team Today`.
- Grid: `grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3`.
- Card (`rounded-xl border border-pen-card-border bg-pen-card p-3.5`):
  - Row 1: `UserAvatar size={28}` + name (semibold 12.5px) + right-aligned "last active" label: `activeAgo(lastActivityAt)` → `"2h ago"` / `"today"`; if `idle` and no activity today show amber `idle` chip instead.
  - Row 2 ("Now"): if `current` → `DrawerLink` to `/tickets/{current.id}` with mono humanId + truncated title (blue on hover); else muted `— nothing in progress`.
  - Row 3 counts: `open` (foreground), `overdue` in red (only when > 0), `inReview` in blue (only when > 0) as small labeled figures, e.g. `6 open · 2 late · 1 review`.
- `activeAgo(iso: string | null)`: null → `""`; same-day hours → `${h}h ago` (0h → `just now`).

- [ ] **Step 2: No commit.**

---

### Task 5: Projects + Today's Activity sections

**Files:**
- Create: `src/components/manager/projects-section.tsx`
- Create: `src/components/manager/activity-today-section.tsx`

**Interfaces:**
- Consumes: `ProjectHealth` from `./aggregate`.
- Produces:

```ts
export function ProjectsSection({ projects }: { projects: ProjectHealth[] }): JSX.Element | null;

export type ActivityItem = {
  id: string; action: string; createdAt: string;
  actor: { name: string; avatarUrl: string | null };
  ticket: { id: string; humanId: string; title: string };
};
export function ActivityTodaySection({ items, total }: { items: ActivityItem[]; total: number }): JSX.Element | null;
```

- [ ] **Step 1: Implement ProjectsSection**

Returns `null` when empty. Header: `Folder` icon + `Projects`. Horizontal wrap of cards (min-width 200px, same card token classes as TeamStatCard today): name + color dot, progress bar (reuse the exact bar markup/colors from current `TeamStatCard`: `pct >= 80 ? "#10b981" : pct >= 50 ? "#0a76b9" : "#f97316"`), `done/total` mono figure, sub-row with `{overdue} overdue` (red, when > 0) and `{active} active` (blue, when > 0), `On track` (emerald) when neither.

- [ ] **Step 2: Implement ActivityTodaySection**

Returns `null` when `items.length === 0`. Header: `Zap` icon + `Today's Activity` + muted `({total})` when `total > items.length`, appending `· showing last 30`.

Row: time `HH:mm` (Dhaka time — `new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" })`, mono, muted) · `UserAvatar size={18}` · actor name (semibold) · action phrase (muted) · `DrawerLink` humanId (mono, `pen-id`). Action phrase map (subset; anything unmapped falls back to lowercased label):

```ts
const ACTION_PHRASE: Record<string, string> = {
  STATUS_CHANGED: "moved", ASSIGNED: "assigned", COMMENT_ADDED: "commented on",
  ATTACHMENT_ADDED: "attached a file to", TICKET_CREATED: "created",
  PRIORITY_CHANGED: "changed priority of", DATE_CHANGED: "changed the due date of",
  TITLE_CHANGED: "renamed", FORWARDED: "forwarded", MENTION: "mentioned someone on",
};
```

For `STATUS_CHANGED`, if `metadata` is passed with `to`/`newStatus`, append `→ {to}`; otherwise just "moved WEB-485". (Server maps `metadata` — inspect one row's shape in dev; if the key isn't obvious, skip the arrow suffix, YAGNI.)

- [ ] **Step 3: No commit.**

---

### Task 6: Dashboard shell — compact header, digest, composition

**Files:**
- Rewrite: `src/components/manager/manager-dashboard.tsx`
- Modify: `src/components/dashboard/london-clock.tsx` (add `compact` prop to `DualClock`)

**Interfaces:**
- Consumes: all section components (Tasks 3–5), `MemberWorkload`/`ProjectHealth` (Task 1), props from Task 2.

- [ ] **Step 1: Add compact variant to DualClock**

In `london-clock.tsx`, give `DualClockInner` a `compact?: boolean` prop. Compact render: one line, `text-[13px] font-mono text-pen-muted`, e.g. `🇧🇩 16:06 +06 · 🇬🇧 11:06 BST` — reuse the existing refs/interval (hours/minutes only; skip seconds refs updates when compact) and the existing flag SVGs at `h-3`. Keep the default branch pixel-identical.

- [ ] **Step 2: Rewrite the dashboard shell**

`manager-dashboard.tsx` becomes a thin client component (keeps `notifEvents` join-request refresh effect and `useLondonGreeting`):

```tsx
"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { notifEvents } from "@/store";
import { DualClock } from "@/components/dashboard/london-clock";
import { useLondonGreeting } from "@/lib/london-time";
import { AttentionSection, type OverdueGroup, type ReviewGroup, type SimpleTicket, type JoinRequest } from "./attention-section";
import { TeamTodaySection } from "./team-today-section";
import { ProjectsSection } from "./projects-section";
import { ActivityTodaySection, type ActivityItem } from "./activity-today-section";
import type { MemberWorkload, ProjectHealth } from "./aggregate";

export function ManagerDashboard(props: {
  managerName: string; digest: string;
  kpis: { overdue: number; review: number; unassigned: number; requests: number };
  overdueGroups: OverdueGroup[]; unassignedTickets: SimpleTicket[];
  reviewGroups: ReviewGroup[]; joinRequests: JoinRequest[];
  members: MemberWorkload[]; projects: ProjectHealth[];
  activity: ActivityItem[]; activityTotal: number; noTeams: boolean;
}) {
  const firstName = props.managerName.split(" ")[0];
  const timeGreeting = useLondonGreeting();
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    return notifEvents.subscribe((_id, type) => {
      if (type === "join_request") startTransition(() => router.refresh());
    });
  }, [router]);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-5 sm:px-6 xl:px-8">
      {/* header: greeting line + digest + compact clock + KPI chips */}
      {/* sections: Attention / TeamToday / Projects / ActivityToday */}
    </div>
  );
}
```

Header block:

- Row: `<h1 className="font-sans text-[20px] font-bold text-pen-foreground">{timeGreeting}, {firstName}.</h1>` left, `<DualClock compact />` right.
- Digest: `<p className="mt-1 font-sans text-[13px] text-pen-muted">{digest}</p>`.
- KPI chips row (`mt-3 flex flex-wrap gap-2`): chips for Overdue (red, `#ef4444`), Needs Review (blue `#0a76b9`), Unassigned (amber `#f59e0b`), Requests (amber) — each an `<a href="#attention">`-style anchor (`#attention`, `#team`, sections get matching `id`s) rendered as pill: `flex items-center gap-1.5 rounded-full border border-pen-card-border bg-pen-card px-3 py-1 text-[11.5px]` with bold colored count + muted label. Chips with count 0 are not rendered.
- `noTeams` → render header + card "No teams in your scope." and skip sections.

Body: `<AttentionSection id="attention" …/> <TeamTodaySection …/> <ProjectsSection …/> <ActivityTodaySection …/>` (pass ids via wrapper `<section id="…">`). Root scrolls normally — **no** `h-full overflow-hidden`, no internal panel scrollbars.

Delete from this file: `Panel`, `Empty`, `OverdueRow`, `ReviewRow`, `JoinRow`, `TeamStatCard`, `PRIORITY_COLOR`, `daysLate`, `timeAgo` (moved to sections in Tasks 3–5).

- [ ] **Step 3: Full typecheck + lint + tests**

Run: `npx tsc --noEmit 2>&1 | grep -v generated | head -30` → no errors in touched files.
Run: `npx vitest run src/components/manager/aggregate.test.ts` → PASS.

- [ ] **Step 4: No commit.**

---

### Task 7: Localhost verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background). Expected: compiles clean, no runtime errors in the terminal for `/manager`.

- [ ] **Step 2: Verify in browser**

Load `http://localhost:3000/manager` as the manager account. Check against the spec:
1. Header ≤ ~120px tall; digest sentence reads correctly; zero-count chips hidden.
2. Overdue groups collapsed/expanded per rule; counts match the old view's totals (29 overdue at time of writing).
3. Unassigned + review groups render; approvals absent when none pending.
4. Team Today shows every member incl. idle ones; "Now" ticket opens the drawer.
5. Projects bars match done/total; activity feed shows today's entries with sensible phrasing.
6. Page scrolls as one document; drawer links work; dark theme unbroken.

- [ ] **Step 3: Hand to user for inspection — no commit until they approve.**
