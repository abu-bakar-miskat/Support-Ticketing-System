# 21 — Agreement record + expiry reminders

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 4

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
`Agreement(tenant_id, start_date, end_date, renewal_status, documents[])` — a Super-Admin-maintained administrative record per tenant with zero or more uploaded supporting documents; **no billing** (SA-02). Notify the Super Admin at configurable intervals (default 60/30/7 days) before renewal/expiry (SA-06). A Super-Admin summary lists tenants with status, agreement end date, department count and active user count, sortable/filterable by status (SA-05).

## Acceptance criteria
- [ ] Super Admin can record/maintain per-tenant agreement fields + upload documents.
- [ ] Renewal/expiry reminders fire at configurable intervals (default 60/30/7 days).
- [ ] A sortable/filterable tenant summary shows status, agreement end date, department and active-user counts.
- [ ] No billing/payment behavior is introduced.

## Blocked by
None - can start immediately.
