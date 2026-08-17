# MCP Full-Control Tools — Design

**Date:** 2026-08-07
**Author:** Dumitru-radu (with Claude)
**Status:** Approved design, pending implementation plan

## Goal

Let Dumitru's claude.ai browser connector make any change in the PEN ticketing
system through the existing MCP endpoint (`/api/mcp/<key>/<transport>`), using
an admin-scope API key. Today the MCP server exposes five tools (list_teams,
list_projects, search_tickets, get_ticket, create_ticket); this adds the
mutation and admin surface.

## Non-goals

- No OAuth for the connector — the URL-embedded API key pattern stays.
- No generic REST passthrough tool; every capability is a curated MCP tool.
- No schema changes, no migrations (the shared live DB is untouched
  structurally).
- No changes to how the web UI authenticates or behaves.

## The key (no code)

- `ApiKeyScope` already has `read | read_write | admin`; the Settings → API
  keys UI already lets an admin-role profile mint an `admin` key with no
  department (= org-wide).
- Gating, enforced inside each tool exactly like `create_ticket` does today:
  - Ticket mutations (`update_ticket`, `add_comment`, `delete_ticket`):
    require `read_write` or `admin`.
  - Admin tools (phase 2): require `admin`.
  - Department-scoped keys remain limited to their department's teams,
    projects, and tickets for every tool, old and new.

## Architecture

All new tools follow the existing pattern:

- Implemented in `src/lib/mcp/tools.ts` as pure async functions taking
  (`ApiKeyContext`, input) and returning `ToolResult`, hitting Prisma
  directly (no HTTP round-trip through the REST routes).
- Registered in `src/app/api/mcp/[key]/[transport]/route.ts` with zod input
  schemas and model-facing descriptions.
- Mutations are attributed to the key owner (`ctx.createdById`), same as
  `create_ticket`.
- Activity logging: ticket field changes are captured by the existing DB
  triggers / ActivityLog conventions; where the REST routes write explicit
  activity rows (e.g. `TICKET_DELETED`), the MCP tool writes the same rows.
- Notifications fire normally: tools reuse the same helpers the REST routes
  use (`src/lib/notify.ts`, `notification-routing.ts`, `mentions.ts`) so a
  change made via Claude emails the same people as the same change made in
  the UI. No quiet mode.

## Phase 1 — ticket mutations

### `update_ticket`
Input: `ref` (e.g. WEB-123) plus any of: `title`, `description`, `type`,
`priority`, `status` (exact status label), `assigneeEmail` (nullable to
unassign), `projectId`, `sprintId`, `moduleId`.
- Only provided fields change; response reports old → new per field.
- Status: an admin key may set any status directly, skipping the UI's
  "assignee-only, one step forward" rule — that is the point of the special
  key. Status labels are validated against the ticket's team workflow.
- Assignee changes send the same email the REST `PATCH /api/tickets/[id]`
  sends; status changes route through the same notification path as
  `PATCH /api/tickets/[id]/status` (including completion notifications).

### `add_comment`
Input: `ref`, `body`.
- Creates the comment as the key owner, logs activity, and processes
  `@mentions` with the same mention-email logic as
  `POST /api/tickets/[id]/comments`.

### `delete_ticket`
Input: `ref`. Admin scope required (destructive).
- Soft-delete: sets `deletedAt` and writes the `TICKET_DELETED` activity row,
  mirroring `DELETE /api/tickets/[id]`. Deleting an already-deleted ticket
  returns ok (idempotent, same as the route).

## Phase 2 — admin operations

Admin-scope-only tools mirroring the `/api/admin` surface, with the same
guards the REST routes enforce:

- Projects: `create_project`, `update_project`, `delete_project` (blocked
  while the project has tickets).
- Teams: `create_team`, `update_team`, `delete_team` (same constraints as
  `/api/admin/teams`).
- Members/users: `list_users`, `set_team_members` (add/remove a user from a
  team), mirroring `/api/admin/members` and `/api/admin/users`.
- Sprints & modules: create/update/close via the same rules as
  `/api/sprints` and `/api/modules`.
- Labels: create/rename/delete via the same rules as `/api/labels`.

Exact input shapes are derived from each REST route's body during planning;
each phase-2 tool is a thin wrapper over the same validation + Prisma logic
the route uses (extracting shared logic into `src/lib/` where the route
currently inlines it, so UI and MCP cannot drift).

## Error handling

- Scope/permission failures return `ToolResult` errors with a message naming
  the required scope (pattern already used by `create_ticket`).
- Unknown refs/ids return not-found errors that tell the model which lookup
  tool to call (`search_tickets`, `list_projects`, …).
- Validation failures (bad status label, unknown assignee email) name the
  offending field and valid alternatives where cheap to compute.

## Testing

- Unit tests alongside the existing `src/lib/mcp/tools.test.ts` pattern:
  scope gating, department scoping, field-change semantics, idempotent
  delete, error messages.
- All notification/email helpers are mocked in tests — nothing in the test
  suite may email real department managers or teammates (shared-DB rule).
- No destructive test writes against the shared DB; tests use the existing
  mock/fixture approach of `tools.test.ts`.

## Rollout

1. Phase 1 lands first on `dev-v2` (no commits without explicit approval).
2. Phase 2 follows as a separate change set, tool group by tool group.
3. User manual (`src/components/docs/user-manual.tsx`) MCP section gains the
   new tools and a warning that admin keys let the connector change and
   delete real data.
4. Dumitru mints an org-wide admin key and updates his claude.ai connector
   URL to use it.
