# Claude MCP Connector — Design

**Date:** 2026-07-07
**Status:** Approved (Approach A: in-app MCP server over API keys)

## Goal

Team members connect claude.ai (browser) to the ticketing system as a custom connector, so Claude can create and look up tickets in chat. Auth rides on the existing `ApiKey` system (`pen_…` Bearer keys, hashed at rest, dept-scoped, revocable, attributable via `createdById`).

## Architecture

- **New deps:** `mcp-handler` (Vercel's MCP adapter for Next.js) + `zod` (tool input schemas).
- **Route:** `src/app/api/mcp/[key]/[transport]/route.ts`. Per-request: validate the `key` path segment, then delegate to `createMcpHandler(registerTools(ctx), {}, { basePath: "/api/mcp/<key>" })` — a fresh handler per request so the validated key context is closed over. Streamable HTTP only (no Redis).
- **Connector URL:** `https://pen-ticketing-system.vercel.app/api/mcp/<api-key>/mcp` — pasted into claude.ai → Settings → Connectors → Add custom connector (paid claude.ai plan required). Key-in-URL because custom connectors support only OAuth-or-nothing; acceptable for an internal tool with hashed, revocable keys.
- **Key validation:** new `requireApiKeyRaw(raw: string)` in `src/lib/api-key-auth.ts` — same logic as `requireApiKey` minus header parsing, and the context gains `createdById` plus the creator's profile basics (`{ id, name }`). `requireApiKey` refactors to call it. Invalid/revoked key → 401 JSON before any MCP handling.
- **Proxy:** `/api/mcp/` joins the public-path allowlist in `src/proxy.ts` (self-authenticated, like `/api/webhooks/`).

## Tools (`src/lib/mcp/tools.ts` — handlers exported as plain functions for testability)

All results are compact JSON in a text content block. Dept-scoped keys (non-null `departmentId`) see only that department's teams/projects/tickets (same OR-of-department-or-team filter as `/api/v1/projects`). Errors return MCP `isError` content with a human-readable message.

| Tool | Input (zod) | Behavior |
|---|---|---|
| `list_teams` | — | Teams (id, name, prefix, department, ordered status labels) in scope. Tells Claude valid types (`Bug/Feature/Task/Chore`) and priorities (`Low/Medium/High/Critical`) in its description. |
| `list_projects` | — | In-scope projects (id, name, status, team, department). |
| `search_tickets` | `query?`, `status?`, `teamPrefix?`, `limit?` (default 20, max 50) | Non-deleted tickets, title contains-insensitive match, dept-scoped; returns humanId (`PREFIX-N`), title, status, priority, assignee name, project name. |
| `get_ticket` | `ref` (`PREFIX-N`) | Resolves via team prefix + ticketNumber (reuses `parseTicketRefs`); full detail (description, dates, assignees, labels) + last 5 comments. |
| `create_ticket` | `title`, `description?`, `type`, `priority`, `teamPrefix`, `projectId?`, `assigneeEmail?` | Requires key scope `read_write` or `admin` (read keys → error). Team by prefix (must be in key's dept scope). Project optional — defaults to the team's Miscellaneous project via `resolveMiscProjectForTeam`. Assignee by email lookup (error if not found). Creates with `ticketNumber: 0` (DB trigger stamps), status = team's lowest-`order` `TeamStatus` label (fallback `"To Do"`), `creatorId` = the key's `createdById`. Assignment notification + email via existing `createNotification`/`sendAssignmentEmail` (skipped when assignee = creator, matching the app). Returns humanId, id, and the ticket URL. |

Deliberately NOT extracted from `POST /api/tickets`: the session route carries session-only concerns (dept-scope of the logged-in user, parents, sprints, templates). The MCP creation path is a small, focused insert using the same primitives (trigger numbering, misc-project resolution, notification helpers) — duplication is limited to the `prisma.ticket.create` call shape.

## Out of scope (v1)

Comments, status changes, attachments, OAuth, self-serve key UI (admins mint keys in the existing admin screen), SSE transport.

## Testing

- Unit: `requireApiKeyRaw` (valid/revoked/unknown/malformed); each tool handler with mocked prisma — scope enforcement (read key cannot create), dept filtering, unknown team prefix, assignee-not-found, status fallback, humanId output.
- Live (post-deploy): JSON-RPC `initialize` → `tools/list` → `tools/call` (`create_ticket` on a throwaway, then `get_ticket`, then cleanup) against production with a real key, plus connecting the real claude.ai connector.

## Documentation

README "Claude connector" section: how to mint a key (admin UI), the connector URL format, the claude.ai setup steps, and the revocation story.
