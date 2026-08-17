# Claude MCP Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** MCP server at `/api/mcp/<key>/mcp` with 5 tools over the existing API-key system. Spec: `docs/superpowers/specs/2026-07-07-claude-mcp-connector-design.md`.

## Global Constraints

- ~24 pre-existing `npm test` failures — gate on focused files + no NEW failures. House mock pattern (`vi.mock("@/lib/db")`).
- New deps allowed per spec: `mcp-handler`, `zod` (exact — nothing else).
- Priorities are `Low/Medium/High/Critical`; types `Bug/Feature/Task/Chore`.
- Never run `prisma migrate dev` (no schema changes in this feature anyway).
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

### Task 1: `requireApiKeyRaw` + deps

- [ ] `npm install mcp-handler zod`
- [ ] Refactor `src/lib/api-key-auth.ts`: extract `requireApiKeyRaw(raw: string): Promise<{ ctx: ApiKeyContext; error: null } | { ctx: null; error: { message: string; status: number } }>`; `ApiKeyContext` gains `createdById: string` and `creatorName: string` (select `createdById, createdBy: { select: { name: true } }`). `requireApiKey` parses the header then delegates, wrapping errors in `NextResponse.json` as today (same messages/statuses).
- [ ] Tests `src/lib/api-key-auth.test.ts`: raw variant — malformed prefix, unknown key, revoked key, valid key returns full ctx and stamps lastUsedAt (fire-and-forget mocked).
- [ ] Focused tests green; commit `feat: raw API-key validation with creator context`.

### Task 2: MCP tool handlers (TDD)

- [ ] Create `src/lib/mcp/tools.ts` exporting plain async functions, each `(ctx: ApiKeyContext, input) => Promise<Result>` where `Result = { ok: true; data: unknown } | { ok: false; message: string }`: `listTeams`, `listProjects`, `searchTickets`, `getTicket`, `createTicket` per the spec table (dept scope filter identical to `/api/v1/projects`; create uses `ticketNumber: 0`, team's lowest-order status label fallback "To Do", `resolveMiscProjectForTeam`, `createNotification` + `sendAssignmentEmail` skipping self-assignment, creator = `ctx.createdById`).
- [ ] Tests `src/lib/mcp/tools.test.ts` (mock `@/lib/db`, `@/lib/notify`, `@/lib/email`, `@/lib/misc-project`): read-scope key rejected by createTicket; dept-scoped listTeams filter shape; unknown teamPrefix error; assigneeEmail not found error; successful create passes creatorId/status/ticketNumber 0 and returns humanId; search where-clause shape; getTicket unknown ref error.
- [ ] Focused green + `npm test` baseline; commit `feat: MCP tool handlers over API-key context`.

### Task 3: Route + proxy + README

- [ ] `src/app/api/mcp/[key]/[transport]/route.ts`: validate `key` param via `requireApiKeyRaw` (401 JSON on error); build `createMcpHandler` per request with `basePath: \`/api/mcp/${key}\``, registering the 5 tools with zod input schemas and descriptions (create_ticket description documents valid types/priorities and that team prefixes come from list_teams); wrap each handler fn: `ok` → `{ content: [{ type: "text", text: JSON.stringify(data) }] }`, else `{ content: [{ type: "text", text: message }], isError: true }`. Export as GET and POST. `maxDuration` 60.
- [ ] `src/proxy.ts`: add `pathname.startsWith("/api/mcp/") ||` with comment (authenticated by API key in path).
- [ ] README: "Claude connector" section (mint key → connector URL format → claude.ai steps → revoke to disconnect).
- [ ] Gates: `npm run lint` no new, `npx tsc --noEmit` no new in changed files, `npm test` baseline; commit `feat: MCP connector route for claude.ai`.

### Task 4: Live verification (controller)

- [ ] Deploy; JSON-RPC smoke against prod: `initialize`, `tools/list`, `tools/call list_teams`, `create_ticket` on a throwaway (then DB-verify + cleanup); connect real claude.ai connector (user).
