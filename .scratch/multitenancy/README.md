# Multitenancy — issue batch

Decisions: shared DB with `tenantId` column (app-enforced); one global identity with membership in one/many tenants; new **super-admin** role above single-tenant `admin`; super-admins create tenants, tenant-admins invite into their own.

Published to GitHub: `PlanetEducationNetworks/PEN-Ticketing-System` (label `multitenancy`).

| GH | Issue | Type | Blocked by |
|----|-------|------|-----------|
| [#89](https://github.com/PlanetEducationNetworks/PEN-Ticketing-System/issues/89) | [Tenant data model + backfill foundation](01-tenant-data-model-and-backfill.md) | HITL | — |
| [#90](https://github.com/PlanetEducationNetworks/PEN-Ticketing-System/issues/90) | [Active-tenant session + scope resolution](02-active-tenant-session-and-scope.md) | AFK | #89 |
| [#91](https://github.com/PlanetEducationNetworks/PEN-Ticketing-System/issues/91) | [Tenant guard on all data queries](03-tenant-guard-on-all-queries.md) | AFK | #90 |
| [#92](https://github.com/PlanetEducationNetworks/PEN-Ticketing-System/issues/92) | [Ticket access tenant gate](04-ticket-access-tenant-gate.md) | AFK | #90 |
| [#93](https://github.com/PlanetEducationNetworks/PEN-Ticketing-System/issues/93) | [Super-admin console: create & switch tenants](05-super-admin-console.md) | HITL | #90 (#91, #92) |
| [#94](https://github.com/PlanetEducationNetworks/PEN-Ticketing-System/issues/94) | [Tenant-admin invite flow](06-tenant-admin-invite-flow.md) | AFK | #93 |
| [#95](https://github.com/PlanetEducationNetworks/PEN-Ticketing-System/issues/95) | [(Optional) RLS hardening](07-rls-hardening-optional.md) | HITL | #91, #92 |

Suggested order: #89 → #90 → (#91 ∥ #92) → #93 → #94 → #95.
