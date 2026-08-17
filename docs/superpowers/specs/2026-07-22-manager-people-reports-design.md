# Manager Team Reports — per-person report page

**Date:** 2026-07-22
**Status:** Approved by Dumitru-radu
**Follows:** 2026-07-22-manager-view-redesign-design.md

## Goal

A `/manager/people` page giving the manager a full report per team member:
what's on their plate, what they shipped, where their tracked time went, and
what they did today.

## Page structure

Route `src/app/(dashboard)/manager/people/page.tsx`, same access guards and
dept scoping as `/manager`. Header: "Team reports" + subtitle naming the
period ("last 7 days"). Below, one collapsible card per member, sorted like
Team Today (overdue first, then busiest; idle last). Cards are collapsed by
default to a summary row:

- avatar, name
- open count, late count (red), time logged last 7 days (mono)
- green pulse dot when a timer is running right now

Expanding a card reveals:

1. **Stat tiles** (shared `StatTile`): Open · Overdue · In review ·
   Done (7d) · Time today · Time (7d).
2. **Open tickets table** — priority dot + ID, title, status pill,
   due/late column. Same grid-table conventions as the attention section.
3. **Shipped recently** — tickets with this assignee that reached a
   review/PR or finished status in the last 7 days (by `updatedAt`).
4. **Time by ticket** — this member's last-7-day entries grouped by ticket,
   largest first, mono durations (`3h 20m`); running entries counted up to
   now and flagged. Entries with no ticket grouped as "No ticket". Notes
   shown when present.
5. **Today's activity** — their ActivityLog entries today, dashboard
   timeline style.

Deep-linking: `/manager/people#p-<profileId>` auto-expands that member.
Entry points: "View reports" footer link in the dashboard's Team Today card;
member names in Team Today link to their anchor.

## Data

One server fetch batch (all `Promise.all`): members in scope (existing
query), open tickets in scope (existing query shape), recently-shipped
tickets (`teamId` in scope, `assigneeId` not null, `status` in done+review
sets, `updatedAt >= now-7d`), today's activity (existing query, cap 500),
and `timeEntry.findMany` for member profiles with `startedAt >= now-7d`
(include ticket id/number/prefix/title).

Pure helpers in `aggregate.ts` (unit-tested): `summarizeTime(entries,
startOfToday, now)` → `{ todaySecs, weekSecs, running, byTicket[] }` and
`formatDuration(secs)` → `"3h 20m"` / `"45m"` / `"0m"`. Running entries
(`endedAt` null) contribute `now - startedAt`.

## Out of scope

Billable/non-billable split, date-range picker, CSV export, editing time.
