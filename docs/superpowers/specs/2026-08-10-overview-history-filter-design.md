# Overview dashboard: History dropdown for archived boards

**Date:** 2026-08-10
**Status:** Approved

## Problem

The recruitment Overview dashboard's scope filter row (`RecruitmentDashboard`, `src/components/recruitment/recruitment-dashboard.tsx`) lists every board inline — including archived ones (marked only by a small Archive icon). Archived boards should be tucked away, consistent with the main board tab bar in `recruitment-page.tsx`, which already hides them behind a "History" dropdown.

## Solution

Client-only change to `src/components/recruitment/recruitment-dashboard.tsx`. No API, DB, or `recruitment-stats` changes.

1. **Split boards**: derive `activeBoards` and `archivedBoards` from `stats.boards` using the existing `archived` flag on `BoardStats`.
2. **Filter row**: render the "All recruitments" chip plus chips for `activeBoards` only. When `archivedBoards.length > 0`, append a `History (n)` dropdown at the end of the row, reusing the same `DropdownMenu` pattern and styling as `recruitment-page.tsx:471-490`: History icon + count on the trigger, "Archived boards" `DropdownMenuLabel`, one item per archived board with an Archive icon. Clicking an item calls `setScope(board.id)`.
3. **Selected-archived chip**: when the current `scope` is an archived board, render it as a highlighted (selected-style) chip with an Archive icon, placed before the History dropdown — mirroring `recruitment-page.tsx:463-467`. This keeps the active selection visible even though archived boards have no permanent chip.
4. **Unchanged**: the "Past recruitments" card and "Per recruitment" chart continue to include archived boards — they are history summaries by design.

## Edge cases

- **Board restored/archived while dashboard is open**: `stats` is a server-computed prop refreshed on navigation; no realtime handling needed.
- **Scope pointing at a missing board**: existing fallback `?? stats.overall` in the `current` memo already covers it.
- **No archived boards**: the History dropdown is not rendered at all.

## Testing

Manual verification in the dev app: archived board absent from the row, present in History dropdown, selectable, and shown as a selected chip while scoped.
