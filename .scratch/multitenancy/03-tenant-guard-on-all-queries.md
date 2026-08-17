# 03 — Tenant guard on all data queries

**Type:** AFK
**Triage:** ready-for-agent

## What to build

Add the active tenant as the outermost, non-negotiable filter on every data-access path, so no query can return rows from another tenant — even one that filters by raw `teamId`/`projectId`.

- Every `where` builder in the scoping layer (ticket, project, team, sprint, label, template, intake, recruitment, people pickers, etc.) gains an outer `tenantId = activeTenantId` clause, using the denormalized `tenantId` where present and the department relation otherwise.
- Audit all API routes (~50) that run Prisma queries directly to ensure each goes through a tenant-guarded builder or applies the clause itself. This audit is the real work and the main leak risk.

## Acceptance criteria

- [ ] All shared `where` builders include an outer active-tenant clause.
- [ ] Every API route querying tenant-scoped data is audited and guarded (checklist of routes recorded in the PR).
- [ ] A request for a resource in another tenant returns empty/404/403 — never another tenant's data.
- [ ] Integration test: two tenants with overlapping data; cross-tenant reads across tickets, projects, teams, labels, templates all return nothing.

## Blocked by

- 02 — Active-tenant session + scope resolution
