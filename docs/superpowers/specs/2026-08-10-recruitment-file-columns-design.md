# Recruitment file columns (drag-and-drop CV upload)

Approved 2026-08-10 by Dumitru-radu.

## Goal

Let recruiters attach a CV (or any document) to a candidate by dragging a file
onto a cell in the recruitment board, via a new `file` column type.

## Data model

- Add `file` to the `RecruitmentFieldType` Prisma enum. Additive
  `ALTER TYPE ... ADD VALUE` migration applied to the shared DB per AGENTS.md.
- A file cell's value lives in the candidate's existing `values` JSON as
  `{ url: string, path: string, name: string, size: number }`.
- `normalizeValue()` in `src/lib/recruitment.ts` gains a `file` case that
  validates this shape and rejects junk. No new tables.

## Upload flow

- `POST /api/recruitment/boards/[id]/upload` (multipart form, field `file`,
  plus `candidateId`): auth-checked the same way as the other recruitment
  routes for that board.
- Validation: PDF, doc/docx, and images only; 10 MB cap.
- Storage: existing Supabase `attachments` bucket at
  `recruitment/{boardId}/{candidateId}/{timestamp}-{sanitizedName}` via a new
  `uploadRecruitmentFile()` in `src/lib/storage.ts`.
- Returns `{ url, path, name, size }`; the client saves that into the cell
  through the existing candidate values-patch endpoint.
- Replacing/removing a file deletes the old storage object (best effort).

## UI

New `FileCell` in `src/components/recruitment/cells.tsx`:

- Empty: subtle "Drop file" affordance; drag-over highlights the cell; click
  opens a file picker.
- Filled: paperclip + truncated file name; click opens the file in a new tab;
  small x clears the cell; dropping a new file replaces the old one.
- One file per cell; extra files in a multi-drop are ignored.
- The column-type picker gains a "File" entry.

## Board template

`DEFAULT_BOARD_FIELDS` gains `{ name: "CV", type: "file" }` so new boards
include it. Existing boards add a File column through the normal add-column UI.

## Testing

- Unit tests for the `file` case in `normalizeValue` (valid shape accepted,
  wrong/missing keys rejected, null clears).
- Route test for the upload endpoint following the attachments route pattern.
