# SRS v1.0 gap analysis

| | |
| --- | --- |
| **Source spec** | [SRS v1.0](./requirements.md) (IEEE 830 / ISO-IEC-IEEE 29148) |
| **Also used** | §10 Resolved Design Decisions in `docs/requirements.md` (2026-08-17) |
| **Audited** | 2026-08-21 against the current codebase |
| **Verdict** | **Not all requirements are resolved.** Core Support operations (SLA, rules, assignment methods, email intake, comments, templates, agreements) are largely in place. The live board, Project Admin isolation, form versioning, and several interface/NFR items are not. |

Status meanings:

| Status | Meaning |
| --- | --- |
| **Met** | Behaviour exists end-to-end (schema + API + UI/tests where the spec requires them). |
| **Partial** | Schema and/or backend exist, but live behaviour, UI, or a hard constraint is incomplete. |
| **Missing** | The specified behaviour is not implemented. |
| **Not verified** | Cannot be confirmed from code (WCAG, load, uptime, backups). |
| **Deferred** | Explicitly parked by §8 or a §10 design decision. No close-out issue filed. |

---

## 1. Scorecard

Counted independently verifiable IDs: constraints C-01–C-05, DAT-01–DAT-05, functional SRS-SA through SRS-FLT, UI/API/MAIL/IDP, SRS-NFR-01–12. **134 items.** Section 8 (AR-01–AR-14) is out of scope and excluded.

| Status | Count | Share |
| --- | --- | --- |
| Met | 68 | 51% |
| Partial | 56 | 42% |
| Missing | 4 | 3% |
| Not verified | 6 | 4% |

**Missing (must-fix):** `DAT-04`, `SRS-RE-05`, `MAIL-03`. `SRS-PA-04` is superseded by [role-hierarchy.md](./role-hierarchy.md).

**Highest-risk partial:** live board still uses per–sub-department statuses instead of department `BoardColumn` (`SRS-BD-01`–`06`, `08`, `09`). That cutover is D-04 and blocks typed reopen/escalate.

---

## 2. What is already in good shape

These areas meet the spec closely enough that no close-out issue is needed:

- **Template marketplace** — create/publish templates, per-tenant enablement, catalogue (enabled/requested/available), duplicate-pending rejection, approve/reject with notify (`SRS-TM-01`–`05`). Concurrent templates exist (`SRS-TM-06` is only partial because departments still key off `type`, not `template_id`).
- **Agreements** — start/end/renewal/documents; 60/30/7-day reminders (`SRS-SA-02`, `SRS-SA-06`).
- **Tenant suspend / restrict** — soft-delete, login block with message, session invalidation via broadcast + ~25s poll (`SRS-SA-03`, `DAT-01`, `DAT-05` audit immutability).
- **Department create** — atomic board column seed + Department Admin assignment (`SRS-PA-02`, `SRS-PA-03`).
- **SLA** — policies, most-restrictive match, first-response/resolution timers, pause-outside-hours, at-risk/breach notify, ticket indicator, immutable breach rows (`SRS-SLA-01`–`07`).
- **Rules engine** — operators, confirmed actions, order + stop-processing, dry-run (`SRS-RE-01`–`04`). Execution **logging** is missing (`SRS-RE-05`).
- **Assignment methods** — rule-based / round robin / workload / manual; `ASSIGNMENT_FAILED` + manager notify; bulk reassign; transfer with retained read access (`SRS-ASG-01`–`03`, `05`, `06`).
- **Working hours model** — per-user schedule, unavailability, “Waiting — agent unavailable” label, department business calendar (`SRS-WH-01`, `02`, `04`, `05`).
- **Email intake (Resend)** — mailbox connect, shared/individual, sub-dept routing, threading, auto-reply suppression, health/backoff (`SRS-EM-01`–`04`, `06`, `07`).
- **Comments** — single feed, Internal Note vs Reply, internal notes never emailed, @mentions (`SRS-CM-01`, `03`, `05`).
- **Sub-status** — derived from last public message (`SRS-BD-07`).
- **Setup hard-block** until first review (`SRS-DS-08`); placeholder tokens and footers (`SRS-DS-04`–`06`).

---

## 3. Highest-impact gaps

1. **Dual board.** Department `BoardColumn` with immutable `statusType` is seeded and has APIs, but the live board/move/reopen path still uses `SubDepartmentStatus` + `ticket.status` labels. Reopen does not apply the `Reopened` label or land on the first `OPEN` column. (D-04 incomplete.)
2. **Roles are flattened and not scope-checked.** Department-scoped Admin is derived as Manager; many routes check global `profile.role` instead of “assigned as Admin / Manager / Sub-manager / Agent on this scope”. Target model: [role-hierarchy.md](./role-hierarchy.md). SRS-PA-04 (reporting-only Project Admin) is superseded — Admin has full department power where added as admin.
3. **Form field definitions are not versioned.** Historical submissions are not guaranteed readable after edits. Checkbox/radio/date cannot be persisted; submit does not run the full validation engine; conditional visibility is engine-only; public POST has no IP rate limit. (`DAT-04`, `SRS-FM-02`/`03`/`05`/`08`.)
4. **Auto-assign falls back to unavailable agents** when nobody is in working hours, instead of leaving the ticket unassigned and failing. (`SRS-ASG-04`, `SRS-WH-03`.)
5. **Feature flags** 403 a subset of APIs; tenant UI does not hide disabled features. (`SRS-SA-04`.)
6. **No per-ticket rule execution log.** (`SRS-RE-05`.)
7. **No ticket-level bounce / delivery-failure recording.** (`MAIL-03`.)

---

## 4. Requirement-by-requirement

### 4.1 Constraints and data integrity

| ID | Status | Notes |
| --- | --- | --- |
| C-01 | Partial | Prisma extension scopes only `ticket`, `project`, `subDepartment`, `department`. RLS migration exists but is inert (app connects as owner). |
| C-02 | Partial | Server-side checks exist; not every route uses `RoleAssignment`. UI is correctly treated as non-authoritative. |
| C-03 | Met | Logic keys on `statusType` where BoardColumn is used. Live board still keys on labels — see BD. |
| C-04 | Partial | Postgres DateTime is UTC; server runtime TZ is pinned to `Asia/Dhaka`. Localization is not systematic. |
| C-05 | Partial | Bulk reassign and report export are async + idempotent via `after()` + cron, not a dedicated queue broker. |
| DAT-01 | Met | Tenant soft-delete; restrict does not delete data. |
| DAT-02 | Met | `statusType` rejected on PATCH unconditionally (stricter than “once tickets occupy”). |
| DAT-03 | Partial | `Ticket.boardColumnId` is nullable; no DB constraint that the column belongs to the ticket’s department. |
| DAT-04 | **Missing** | No versioned field definitions / submission snapshot. |
| DAT-05 | Met | `AuditEvent` UPDATE/DELETE blocked by DB triggers. |

### 4.2 Tenancy and platform admin

| ID | Status | Notes |
| --- | --- | --- |
| SRS-SA-01 | Partial | Create / suspend / soft-delete work. Post-create **name/slug edit** is missing. Tenant status values are `active`/`suspended`, not the SRS enum `ACTIVE`/`SUSPENDED`/`TRIAL`/`EXPIRED`. |
| SRS-SA-02 | Met | Agreement + documents. |
| SRS-SA-03 | Met | Tenant and user restrict; next-request deny; session invalidation within 60s via broadcast + 25s poll. |
| SRS-SA-04 | Partial | Flags exist; `assertFeatureEnabled` on a subset of routes; tenant dashboard does not fetch flags to hide UI. |
| SRS-SA-05 | Partial | Summary has status, agreement end, dept count, active users, sortable. Filter is by renewal status, not tenant status. **[Unconfirmed]** |
| SRS-SA-06 | Met | Default 60/30/7 in-app reminders. **[Unconfirmed but built]** |

### 4.3 Template marketplace

| ID | Status | Notes |
| --- | --- | --- |
| SRS-TM-01 | Met | Unique key (`slug`); publish via `isActive`. |
| SRS-TM-02 | Met | Per-tenant grant/revoke. |
| SRS-TM-03 | Met | Catalogue statuses `active` / `requested` / `available`. |
| SRS-TM-04 | Met | Duplicate `PENDING` rejected. |
| SRS-TM-05 | Met | Approve enables template and notifies. **[Unconfirmed but built]** (D-03 had deferred this; code landed anyway.) |
| SRS-TM-06 | Partial | Multiple `TenantTemplate` rows allowed; department config still uses `Department.type`, not `template_id`. |

### 4.4 Roles and access

| ID | Status | Notes |
| --- | --- | --- |
| SRS-PA-01 | Partial | Tenant admin can invite/edit/deactivate users; not gated to a Support template instance. |
| SRS-PA-02 | Met | Dept create seeds five typed columns. |
| SRS-PA-03 | Met | Multiple Department Admins via `DepartmentManager`. |
| SRS-PA-04 | **Superseded** | Product decision 2026-08-21: Admin has **full department power where added as admin**, not reporting-only. See [role-hierarchy.md](./role-hierarchy.md). [#5](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/5) closed. |
| SRS-DA-01 | Met | Manager scoped to own department / sub-departments. |
| SRS-DA-02 | Partial | Own-dept denial works for managers; tenant/platform admin bypass; some lists use hand-written `where`. |
| SRS-AC-01 | Partial | `RoleAssignment` model + resolver exist; cutover (D-06) incomplete. |

### 4.5 Sub-departments

| ID | Status | Notes |
| --- | --- | --- |
| SRS-SD-01 | Met | Create sub-departments. |
| SRS-SD-02 | Partial | Manager assignment exists; `resolveEffectiveSubDepartmentManager` is not wired into production notify/authz paths. |
| SRS-SD-03 | Met | Sub-dept mailbox routes inbound tickets to that sub-department. |
| SRS-SD-04 | Met | Whole-dept or specific sub-dept grants. |
| SRS-SD-05 | Partial | Forms/SLAs/rules are department-scoped. Live workflow columns (`SubDepartmentStatus`) and `RoutingRule` are still sub-dept-level. Forms also require an `intakeSubDepartmentId` (routing destination). |
| SRS-SD-06 | Partial | Prisma extension + board/search/report paths filter by sub-dept. Notifications list by recipient only. Nested `include` reads are not extension-filtered. |

### 4.6 Board

| ID | Status | Notes |
| --- | --- | --- |
| SRS-BD-01 | Partial | Columns seeded at dept create; live UI is per–sub-department statuses (and a project per sub-dept). |
| SRS-BD-02 | Partial | Types match (OPEN×2, PAUSED, ESCALATED, RESOLVED). Default **labels** are `OPEN` / `IN PROGRESS` / `PAUSED` / `ESCALATED` / `RESOLVED`, not To Do / On Hold / Done. |
| SRS-BD-03 | Partial | Dept column API requires `statusType`; live custom columns are untyped `SubDepartmentStatus`. |
| SRS-BD-04 | Partial | Dept PATCH rejects `statusType` change; live renames are on sub-dept statuses. |
| SRS-BD-05 | Partial | Typed columns unused by reporting/live moves. |
| SRS-BD-06 | Partial | Dept delete-with-move exists; default columns can be deleted; sub-dept delete has no destination-move. **[Unconfirmed]** |
| SRS-BD-07 | Met | Derived from last public inbound/outbound message. |
| SRS-BD-08 | Partial | SLA never moves columns. No dedicated escalate action on typed columns; users can set an `ESCALATED` **label**. |
| SRS-BD-09 | Partial | Reply appends to the feed and reopens to first non-complete **sub-dept** status. `Reopened` label is not applied. Typed-column helpers are not wired. |

### 4.7 Department settings

| ID | Status | Notes |
| --- | --- | --- |
| SRS-DS-01 | Partial | Form branding and email branding exist separately; not one department branding profile applied to both. |
| SRS-DS-02 | Partial | Multiple senders + one default. Reply-To is still largely workspace-level. |
| SRS-DS-03 | Partial | `intakeConfirmation` / `customerReply` / `resolution` map to three of four events. **No `STATUS_CHANGED` template.** |
| SRS-DS-04 | Met | Unresolved tokens → empty string. |
| SRS-DS-05 | Met | Per-template footer. |
| SRS-DS-06 | Met | Platform/tenant fallback footer (OQ-02: editable fallback). |
| SRS-DS-07 | Partial | Resend domain verification gates identity save, not an in-app SPF/DKIM workflow. **[Unconfirmed]** |
| SRS-DS-08 | Met | Operational block until `setupCompletedAt`. |
| SRS-DS-09 | Partial | `walkthroughDismissedAt` + API; **no UI** that presents the dismissible overview. |
| SRS-DS-10 | Partial | API only; no on-demand walkthrough in settings. |

### 4.8 Email intake

| ID | Status | Notes |
| --- | --- | --- |
| SRS-EM-01 | Met | Inbound creates tickets (Resend). |
| SRS-EM-02 | Met | Any address can be connected. |
| SRS-EM-03 | Met | Sub-dept scope routing. |
| SRS-EM-04 | Met | In-Reply-To / References + subject reference. **[Unconfirmed but built]** |
| SRS-EM-05 | Partial | Auth types accepted in schema; **only Resend implemented**. OAuth/IMAP rejected at API. Credentials encrypted and never returned. Intentional per D-10 “later”. |
| SRS-EM-06 | Met | Auto-reply detection + `MailSuppressionLog`. |
| SRS-EM-07 | Met | Health sweep, manager alert, exponential backoff. |

### 4.9 Dynamic forms

| ID | Status | Notes |
| --- | --- | --- |
| SRS-FM-01 | Met | Multiple forms per department. |
| SRS-FM-02 | Partial | Persisted types: text, richtext, email, number, select, file. Missing checkbox, radio, date. |
| SRS-FM-03 | Partial | Shared validation engine exists; public submit does not call it (required + email only). |
| SRS-FM-04 | Met | Add / remove / reorder. |
| SRS-FM-05 | Partial | Engine supports `visibleWhen`; not stored or shown in the builder. **[Unconfirmed]** |
| SRS-FM-06 | Met | UUID public URL, no auth. |
| SRS-FM-07 | Met | Submission creates a ticket with values. |
| SRS-FM-08 | Partial | Assist endpoint is IP-limited; main form POST is not. Email verification is friction, not bot mitigation. |

### 4.10 Rules, SLA, assignment, hours

| ID | Status | Notes |
| --- | --- | --- |
| SRS-RE-01 | Met | equals / not-equals / contains / gt / lt / is-empty + AND/OR. |
| SRS-RE-02 | Met | Confirmed action list (OQ-06). |
| SRS-RE-03 | Met | Order + `stopProcessing`. |
| SRS-RE-04 | Met | Dry-run against sample values. |
| SRS-RE-05 | **Missing** | No per-ticket execution log; only `console.error` on failure. |
| SRS-SLA-01–07 | Met | See §2. |
| SRS-ASG-01–03, 05, 06 | Met | See §2. |
| SRS-ASG-04 | Partial | Availability is checked, then **falls back to all active members** if none are in hours. Rule-based path skips hours entirely. |
| SRS-WH-01, 02, 04, 05 | Met | See §2. |
| SRS-WH-03 | Partial | Same fallback as ASG-04. |

### 4.11 Comments, reporting, filtering

| ID | Status | Notes |
| --- | --- | --- |
| SRS-CM-01 | Met | Unified chronological feed. |
| SRS-CM-02 | Partial | Mode select exists; template key is `customerReply` not `REPLY_RECEIVED`. |
| SRS-CM-03 | Met | Visual distinction; internals never emailed. |
| SRS-CM-04 | Partial | Replies are rich text; internal notes are plain. 25 MB + MIME allowlist (OQ-08) is hardcoded, not per-tenant configurable. |
| SRS-CM-05 | Met | Scoped @mentions. |
| SRS-RPT-01 | Partial | Volume-by-category API/export; no first-class UI. |
| SRS-RPT-02 | Partial | Mean/median by priority API/export; no first-class UI. |
| SRS-RPT-03 | Met | Date range + preceding equivalent. |
| SRS-RPT-04 | Met | Custom reports by form fields. |
| SRS-RPT-05 | Met | CSV/PDF (also XLSX); async over 500 rows. |
| SRS-RPT-06 | Partial | Cross-dept aggregation without message content + scheduled exports. Live ticket-count dashboard is API-only. |
| SRS-RPT-07 | Met | Report queries respect dept/sub-dept scope. |
| SRS-FLT-01 | Met | Assignee including unassigned. |
| SRS-FLT-02 | Partial | Server can filter by form fields; **no board UI**. |
| SRS-FLT-03 | Met | Subject, reference, requester email, message body; scoped. |
| SRS-FLT-04 | Partial | Status/priority/date/sub-status exist but split across URL vs client-only JSON. **[Unconfirmed]** |
| SRS-FLT-05 | Partial | Some filters in URL; assignee/priority/date live in client `boardFilters` and are not server-rendered on first load. Recipient still scoped. |

### 4.12 External interfaces

| ID | Status | Notes |
| --- | --- | --- |
| UI-01 | Met | Single web client; nav by role. |
| UI-02 | Met | Public branded forms, no auth. |
| UI-03 | Not verified | No WCAG 2.1 AA evidence. |
| UI-04 | Partial | Drag-and-drop; no keyboard-operable equivalent. |
| API-01 | Partial | Most mutations via HTTP API; some Server Components query Prisma directly. |
| API-02 | Met | With AC-01 caveats. |
| API-03 | Partial | Some list endpoints cap page size; no global max. |
| API-04 | Partial | Out-of-scope unique reads often 404 via Prisma extension; many access checks still return 403. |
| MAIL-01 | Met | Inbound webhook + Message-ID dedupe. |
| MAIL-02 | Met | Per-dept sender, Reply-To, ticket reference in subject/headers. |
| MAIL-03 | **Missing** | Resend webhook ignores non-`email.received` events. No ticket bounce record. |
| IDP-01 | Partial | Org-level Microsoft OIDC via Supabase. Per-tenant SAML/OIDC deferred (D-12). |
| IDP-02 | Partial | Supabase/Azure MFA possible; no per-tenant enforceable MFA in-app (D-12). |

### 4.13 Non-functional

| ID | Status | Notes |
| --- | --- | --- |
| SRS-NFR-01 | Partial | Isolation tests exist; Prisma coverage incomplete; no CI workflow in this repo running the negatives. |
| SRS-NFR-02 | Met | API-layer RBAC (incomplete RoleAssignment cutover is AC-01). |
| SRS-NFR-03 | Partial | TLS via host; mailbox credentials encrypted. At-rest for attachments is platform-dependent. |
| SRS-NFR-04 | Partial | See IDP-01/02 / D-12. |
| SRS-NFR-05 | Not verified | p95 ≤ 2s target accepted (OQ-07); no load test in repo. |
| SRS-NFR-06 | Not verified | Architecture can scale; not demonstrated. |
| SRS-NFR-07 | Not verified | 99.5% monthly accepted (OQ-07); not documented operationally. |
| SRS-NFR-08 | Partial | User erasure (soft-delete) exists; **no personal-data export**. |
| SRS-NFR-09 | Partial | Immutable audit for many admin/config actions; not rule execution (RE-05). |
| SRS-NFR-10 | Not verified | Same as UI-03. |
| SRS-NFR-11 | Partial | Ad-hoc `console` logs; no unified ticket-lifecycle metrics. |
| SRS-NFR-12 | Not verified | Relies on Supabase; no documented tested restore procedure in-repo. |

---

## 5. Intentionally not filed

| Item | Why |
| --- | --- |
| §8 AR-01–AR-14 | Out of scope this phase (portal, KB, macros, CSAT, webhooks, i18n, …). |
| IDP-01 / IDP-02 / NFR-04 per-tenant SAML + MFA | D-12: keep Supabase auth; defer per-tenant IdP. |
| NFR-05, NFR-06, NFR-07, NFR-10, NFR-12 | Accepted targets / host responsibilities; not an implementation slice until there is a test or runbook to write. |
| C-04, C-05, API-01, API-03, CM-04 rich-text-on-notes | Small / environmental; fold into other slices only if they come up. |
| TM-06 `Department.template_id` | Fold into board/template work if a second template’s runtime is actually enabled; Support is the only in-scope template. |

---

## 6. Close-out issues

Filed on `abu-bakar-miskat/Support-Ticketing-System`. Parent: [#2 SRS v1.0 remaining gaps](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/2).

Two chains must run in order: **#3 → #6** (board, then reopen/escalate) and **#4 → #22–#26** (RoleAssignment, then per-role enforcement). [#5](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/5) (Project Admin reporting-only) is **closed** — superseded by [role-hierarchy.md](./role-hierarchy.md).

| Issue | Title | Type | Blocked by | Closes |
| --- | --- | --- | --- | --- |
| [#3](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/3) | Cut the live Support board over to department `BoardColumn` | HITL | — | BD-01–06, BD-08 (typed escalate), DAT-03, C-03 live, SD-05 workflow |
| [#4](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/4) | Finish RoleAssignment as the sole authz source | AFK | — | AC-01, C-02, DA-02, API-04; implements [role-hierarchy.md](./role-hierarchy.md) |
| [#21](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/21) | Role hierarchy parent | HITL | — | Super Admin / Admin / Manager / Sub-manager / Agent |
| [#22](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/22) | Super Admin: tenants, tenant settings, templates | AFK | #4 | SA-01–04, TM-01–05 |
| [#23](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/23) | Admin: full department power only where added as admin | AFK | #4 | PA-01–03, DA-01–02 (PA-04 superseded) |
| [#24](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/24) | Manager: operational power only where assigned | AFK | #4 | DA-01, WH, ASG operational |
| [#25](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/25) | Sub-manager: power only over assigned sub-departments | AFK | #4, #11 | SD-01–06 |
| [#26](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/26) | Agent: ticket work only, no settings | AFK | #4 | Agent staff scope |
| [#6](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/6) | Wire reopen and escalate onto typed columns | AFK | #3 | BD-08, BD-09, OQ-04/05 |
| [#7](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/7) | Extend the tenant scope filter to remaining models | AFK | — | C-01, NFR-01 |
| [#8](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/8) | Forms: versioning, remaining types, server validation, conditional visibility, bot limits | AFK | — | DAT-04, FM-02, FM-03, FM-05, FM-08 |
| [#9](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/9) | Log each rule execution on the affected ticket | AFK | — | RE-05, NFR-09, NFR-11 |
| [#10](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/10) | Fail auto-assign when no agent is inside working hours | AFK | — | ASG-04, WH-03 |
| [#11](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/11) | Close SD-06 leaks and wire sub-department manager fallback | AFK | — | SD-02, SD-06 |
| [#12](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/12) | Hide disabled feature flags in the tenant UI and 403 every gated API | AFK | — | SA-04 |
| [#13](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/13) | Department setup walkthrough UI (new manager + on demand) | AFK | — | DS-09, DS-10 |
| [#14](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/14) | `STATUS_CHANGED` notification template and department branding/senders | AFK | — | DS-01, DS-02, DS-03 |
| [#15](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/15) | Board custom-field filters in the URL + volume/resolution dashboards | AFK | — | FLT-02, FLT-04, FLT-05, RPT-01, RPT-02, RPT-06 |
| [#16](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/16) | Record outbound bounce and delivery failure on the ticket | AFK | — | MAIL-03 |
| [#17](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/17) | Super Admin tenant name edit and summary filter by tenant status | AFK | — | SA-01, SA-05 |
| [#18](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/18) | GDPR personal-data export | AFK | — | NFR-08 |
| [#19](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/19) | Mailbox OAuth (Microsoft 365 / Google) and IMAP providers | HITL | — | EM-05 (D-10 “later”) |
| [#20](https://github.com/abu-bakar-miskat/Support-Ticketing-System/issues/20) | Keyboard-operable equivalent to board drag-and-drop | AFK | — | UI-04 |
