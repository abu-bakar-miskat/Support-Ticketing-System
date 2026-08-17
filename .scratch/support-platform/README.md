# Support Platform — issue backlog

Tracer-bullet slices realizing the Multi-Tenant Support Ticketing Platform.
Parent PRD: [PEN-Ticketing-System#96](https://github.com/PlanetEducationNetworks/PEN-Ticketing-System/issues/96).
Spec + decisions: `docs/requirements.md` (SRS v1.0, §10 Resolved Design Decisions).
Triage: all `ready-for-agent`.

| # | Slice | Type | Phase | Blocked by |
|---|-------|------|-------|-----------|
| 01 | [RoleAssignment model + scope-chain resolver](01-roleassignment-model-and-scope-resolver.md) | HITL | 1 | — |
| 02 | [Non-bypassable Prisma scope extension + CI negative tests](02-prisma-scope-extension-and-ci-negative-tests.md) | AFK | 1 | 01 |
| 03 | [Authorization cutover + retire Profile.role](03-authorization-cutover-retire-profile-role.md) | AFK | 1 | 02 |
| 04 | [Department board + status-typed columns](04-department-board-status-typed-columns.md) | HITL | 2 | 03 |
| 05 | [Team→SubDepartment scope tag + SD-06](05-subdepartment-scope-tag-sd06.md) | AFK | 2 | 04 |
| 06 | [Ticket reference; retire Projects & hub](06-ticket-reference-retire-projects-hub.md) | HITL | 2 | 04 |
| 07 | [Sub-status + reopen/escalate](07-sub-status-reopen-escalate.md) | AFK | 2 | 04, 05 |
| 08 | [Dynamic forms: versioned + conditional + public URL](08-dynamic-forms-versioned-conditional.md) | AFK | 3 | 04 |
| 09 | [Rules engine](09-rules-engine.md) | AFK | 3 | 08 |
| 10 | [SLA policies + timers + indicator](10-sla-policies-timers-indicator.md) | AFK | 3 | 04, 07, 08 |
| 11 | [Assignment methods + failure handling](11-assignment-methods-failure.md) | AFK | 3 | 04 |
| 12 | [Working hours + availability](12-working-hours-availability.md) | AFK | 3 | 11 |
| 13 | [Bulk reassignment + transfer](13-bulk-reassign-transfer.md) | AFK | 3 | 05, 11 |
| 14 | [MailboxConnection intake + threading](14-mailbox-connection-intake-threading.md) | HITL | 3 | 04, 05 |
| 15 | [Dept settings: branding + senders + notifications + walkthrough](15-department-settings-branding-notifications.md) | AFK | 3 | 04 |
| 16 | [Comments feed: internal/reply + attachments + @mention](16-comments-feed-internal-reply-mentions.md) | AFK | 3 | 05, 14 |
| 17 | [Board filtering & search](17-board-filtering-search.md) | AFK | 3 | 05, 08 |
| 18 | [Reporting: dept + custom + cross-dept + export](18-reporting-dept-custom-crossdept-export.md) | AFK | 3 | 03, 08, 10 |
| 19 | [Per-tenant FeatureFlag](19-feature-flags.md) | AFK | 4 | 03 |
| 20 | [Immutable AuditEvent log](20-audit-event-log.md) | AFK | 4 | 03 |
| 21 | [Agreement record + expiry reminders](21-agreement-record.md) | AFK | 4 | — |
| 22 | [Tenant lifecycle + access restriction](22-tenant-lifecycle-access-restriction.md) | HITL | 4 | 03 |
| 23 | [RLS hardening](23-rls-hardening.md) | HITL | 4 | 02 |

**Suggested order:** 01 → 02 → 03 → 04 → (05, 06) → 07 → then Phase 3 (08→09; 10; 11→12; 13; 14→16; 15; 17; 18) → Phase 4 (19, 20, 21, 22, 23).

**HITL slices** (need a human decision/migration review): 01, 04, 06, 14, 22, 23.
