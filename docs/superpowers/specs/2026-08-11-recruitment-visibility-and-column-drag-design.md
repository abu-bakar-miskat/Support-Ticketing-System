# Recruitment: per-manager visibility + drag-and-drop column reorder

**Date:** 2026-08-11 · **Approved by:** Dumitru-radu

## Feature 1: Per-manager board visibility

Managers see only recruitment boards where `RecruitmentBoard.createdById` is
their own profile id. Admins see all boards. No schema change — the column
already existed but was never used for reads.

- Helper `recruitmentBoardWhere(profile)` in `src/lib/auth.ts`: `{}` for
  admins, `{ createdById: profile.id }` otherwise. Spread into board queries
  or passed as a `board:` relation filter for fields/candidates.
- Inaccessible boards return **404** (not 403) so board ids can't be probed.
- Applied at every read/ownership check: board list GET, server page
  (initial boards **and** overview stats), board detail GET/PATCH/DELETE,
  fields POST/PATCH(bulk)/field PATCH/DELETE, candidates POST/PATCH/DELETE,
  upload POST/DELETE, and the MCP recruitment tools (scoped by the key
  owner's profile role via `boardScope(ctx)`).
- Rollout: existing boards keep their current `createdById`; reassigning a
  board to another manager is a one-time data fix.

## Feature 2: Drag-and-drop column reorder

- `reorderByMove(items, dragId, targetId)` in `src/lib/recruitment.ts` moves
  the dragged field to the target's position in the **full** field list, so
  hidden columns keep their relative position.
- `ColumnHeader` in `recruitment-page.tsx`: each `<th>` is a react-dnd drag
  source + drop target (`recruitment-column` type), wrapped in the existing
  `BoardDndProvider` (desktop + touch backends). Drop indicator = inset
  primary edge on the hovered header; clicking still opens the column menu.
- Persistence: optimistic state update, then one bulk
  `PATCH /api/recruitment/boards/[id]/fields` with `{ orderedIds }` —
  validated as exactly the board's field id set, resequenced `order = index`
  in a transaction. Failure → toast + board refetch.

## Testing

- `reorderByMove` unit tests (forward/backward move, unknown ids, no mutation).
- Bulk reorder endpoint: transaction order, manager scoping, admin bypass,
  404 on foreign board, invalid payload shapes.
- Board list GET: manager filtered to own boards, admin unfiltered.
- Upload route tests updated for the new board-scope mocks.
