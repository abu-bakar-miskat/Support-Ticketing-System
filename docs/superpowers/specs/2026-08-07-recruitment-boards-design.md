# Recruitment Boards — Design

**Date:** 2026-08-07 · **Status:** Approved (user said ship), implemented same day

## Goal

A "Recruitment" section for managers and admins: Notion-style databases
("boards") with fully customizable columns, seeded from the Notion export
`PEN_UIUX_Candidate_Pipeline.xlsx` (41 candidates, 18 columns).

## Access

- Sidebar entry "Recruitment" → `/recruitment`, shown only to `admin` and
  `manager` roles (same block as Members / Team Reports).
- All API routes guarded by `requireAdminOrManager()`.
- Any manager sees all boards (no per-board permissions in v1).

## Data model (additive only — no existing table touched)

- `RecruitmentBoard` — id, name, createdById (plain uuid, no FK to Profile),
  createdAt.
- `RecruitmentField` — one per column: boardId (cascade delete), name,
  `RecruitmentFieldType` enum (`text | select | multi_select | number | date |
  url | email | phone | rating | checkbox`), `options Json?` for selects
  (`[{ id, label, color }]`), order, hidden, createdAt.
- `RecruitmentCandidate` — one per row: boardId (cascade delete),
  `values Json` keyed by field id, order, createdById?, timestamps.

New column = new RecruitmentField row; cells live in JSON — no migration
needed for future columns. Migration applied to the shared DB via the
AGENTS.md diff → prune → execute → resolve workflow.

## API (`/api/recruitment/…`, all manager+)

- `GET/POST boards` — list (with field/candidate counts) / create (default
  "Name" text field).
- `GET/PATCH/DELETE boards/[id]` — detail with fields + candidates / rename /
  delete.
- `POST boards/[id]/fields`, `PATCH/DELETE boards/[id]/fields/[fieldId]` —
  create / rename-retype-options-hide-reorder / delete.
- `POST boards/[id]/candidates`, `PATCH/DELETE boards/[id]/candidates/[cid]`
  — create / merge-patch values / delete.
- Value validation per field type in `src/lib/recruitment.ts` (unit-tested):
  unknown field ids rejected, selects must reference existing option ids,
  rating clamped 0–5, checkbox boolean, number numeric, else string.

## UI

`/recruitment` page (client, follows app styling): board tabs + "New board",
search-as-you-type, editable table — sticky header, per-type cell editors
(text input, select dropdown with colored chips, star rating, date picker,
checkbox, url/email/phone links), add-row button, add-column button. Column
header menu: rename, change type, edit options + colors, hide, sort ↑↓,
delete. Click candidate name → side panel with every field for that row.

## v1 skips (approved)

Kanban view, CV attachments, per-board permissions, formulas/rollups, in-app
xlsx import UI.

## Import

One-time script `scripts/import-recruitment-xlsx.mjs`: creates board
"UI/UX Designer Pipeline" with 18 typed fields (Stage / Stage 2 Outcome /
Reject Reason / Source as colored selects, Rating as rating, Portfolio /
LinkedIn as url, Email as email, Phone as phone, Date Shortlisted as date,
rest text) and all candidate rows. Run once against the shared DB.
