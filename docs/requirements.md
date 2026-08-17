# Software Requirements Specification
## Multi-Tenant Support Ticketing Platform

| | |
| --- | --- |
| **Document** | Software Requirements Specification (SRS) |
| **Version** | 1.0 (Draft) |
| **Derived from** | BRD – Multi-Tenant Support Ticketing Platform v0.3.1 |
| **Status** | For technical review |
| **Standard** | Structured per IEEE 830 / ISO-IEC-IEEE 29148 |

---

## 1. Introduction

### 1.1 Purpose
This SRS translates the business requirements defined in BRD v0.3.1 into a specification suitable for design, implementation and test. It defines the functional behaviour, data model, interfaces, constraints and quality attributes of a multi-tenant support ticketing platform in which a Super Admin administers multiple client tenancies, each of which may enable one or more service templates (initially a Support template) that departments then configure independently.

### 1.2 Intended Audience
- **Engineering** — as the build contract.
- **QA** — as the basis for test case derivation; every `SRS-*` requirement is intended to be independently verifiable.
- **Product / BA** — for traceability back to BRD requirement IDs.
- **DevOps / Security** — for NFR, deployment and data-isolation obligations.

### 1.3 Scope

**In scope**
- Platform administration: tenancy lifecycle, agreement records, per-tenant feature flags, user access restriction.
- Template catalogue and marketplace, including tenant-side access requests.
- The Support template: roles, departments, sub-departments, boards, department settings, email intake, dynamic forms, rules engine, SLA management, assignment, working hours, unified comment feed.
- Reporting and analytics at department and tenant level.
- Board filtering and free-text search.

**Out of scope (this phase)**
- Billing, invoicing and payment processing. `Agreement` is an administrative record only.
- The internal functionality of any template other than Support; other templates exist at catalogue level only.
- Native mobile applications. A responsive web client is assumed.
- Data migration from any incumbent ticketing tool.
- Customer self-service portal — all customer interaction is by email.

### 1.4 Definitions and Acronyms

| Term | Definition |
| --- | --- |
| **Tenant** | An external client organisation onboarded by the Super Admin, with its own users, agreement and enabled templates. |
| **Template** | A packaged functional module (e.g. Support) that a tenant can enable and configure. |
| **Department** | An operational unit within a tenant's template instance; owns exactly one board and its own configuration. |
| **Sub-department** | An optional subdivision of a department, with its own manager and optional dedicated mailbox. Inherits parent forms, SLAs and rules. |
| **Board** | A department's visual workflow, composed of ordered columns representing ticket stages. |
| **Status Type** | The fixed, non-editable status category behind a column (`OPEN`, `PAUSED`, `ESCALATED`, `RESOLVED`). |
| **Sub-status** | `WAITING_FOR_CUSTOMER` / `WAITING_FOR_SUPPORT`, derived from the last customer-visible message. |
| **Internal Note** | A ticket comment visible only to users with department/sub-department access; never sent to the customer. |
| **Reply** | A ticket comment delivered to the customer by email via a notification template. |
| **SLA** | A time target (first response and/or resolution) applied to a ticket by policy. |
| **RBAC** | Role-Based Access Control. |
| **SSO / MFA** | Single Sign-On / Multi-Factor Authentication. |

### 1.5 References
- BRD – Multi-Tenant Support Ticketing Platform, v0.3.1 (Sections 7–12, Appendices A–D).
- UK GDPR / Data Protection Act 2018.
- WCAG 2.1 Level AA.

---

## 2. Overall Description

### 2.1 Product Perspective
The system is a new, self-contained, multi-tenant web application. It is not a replacement for, nor an extension of, an existing product. External dependencies are limited to:

- **Mail providers** (Microsoft 365, Google Workspace, generic IMAP/SMTP) for inbound ticket creation and outbound correspondence.
- **Identity providers** for SSO (SAML 2.0 / OIDC).
- **Object storage** for attachments and branding assets.

### 2.2 System Context

```
                     ┌──────────────────────────────┐
   Customer ──email──▶│  Inbound Mail Processor      │
        ▲             └──────────────┬───────────────┘
        │                            ▼
        │             ┌──────────────────────────────┐
        └───email─────│  Application Core            │
                      │  (Tenancy, Template, Ticket, │
                      │   Rules, SLA, Assignment)    │
                      └──┬────────────┬──────────────┘
                         │            │
   Web Client ──HTTPS────┘            └──── PostgreSQL / Object Store / Job Queue
   (Super Admin, Project Admin,
    Dept Admin, Sub-dept Manager, Agent)
```

### 2.3 User Classes

| Role | Scope | Summary of authority |
| --- | --- | --- |
| Super Admin | Platform-wide | Tenants, agreements, feature flags, template catalogue, access requests. |
| Project Admin | One tenant, within one template | Tenant users, departments, Department Admin assignment, cross-department **reporting only**. |
| Department Admin | One department | Full self-service configuration of the department and its sub-departments. |
| Sub-department Manager | One sub-department | Day-to-day management and user administration within that sub-department. Defaults to the Department Admin where unassigned. |
| Agent | Department or specific sub-department(s) | Work, reply to, transfer and reassign tickets within scope. |
| Customer / Requester | Own tickets | Raise and reply to tickets by email; no system login in this phase. |

### 2.4 Operating Environment
- Server: containerised web/API services and asynchronous workers; relational database (PostgreSQL); object storage; scheduled job runner for SLA timers, digests and mailbox polling.
- Client: current-major and previous-major versions of Chrome, Edge, Firefox and Safari; responsive down to a 360 px viewport.

### 2.5 Design and Implementation Constraints
- **C-01** Tenant isolation shall be enforced in the data layer (every tenant-owned row carries a tenant discriminator, applied by a non-bypassable query filter), not by application code convention alone.
- **C-02** Authorisation shall be evaluated server-side on every request. UI affordances are a convenience only and shall never be the sole control.
- **C-03** Column display names are user-editable; all logic (SLA, reporting, automation) shall key on Status Type, never on the display name.
- **C-04** All timestamps shall be persisted in UTC and rendered in the relevant user's or department's timezone.
- **C-05** Long-running operations (mail polling, SLA evaluation, bulk reassignment, report export) shall run asynchronously via a queue and be idempotent on retry.

### 2.6 Assumptions and Dependencies
- **A-01** Tenants can provide a mailbox and, where required, administrative consent for OAuth mail access.
- **A-02** A responsive web interface satisfies all mobile needs.
- **A-03** No historical data migration is required.
- **A-04** Customers are identified by email address; no customer account record with credentials is created.
- **D-01** Outbound deliverability depends on tenant-side DNS records (SPF/DKIM) for domain verification.

---

## 3. Data Requirements

### 3.1 Core Entities

| Entity | Key attributes | Notes |
| --- | --- | --- |
| `Tenant` | id, name, status (`ACTIVE`, `SUSPENDED`, `TRIAL`, `EXPIRED`), created_at | Root of the isolation boundary. |
| `Agreement` | id, tenant_id, start_date, end_date, renewal_status, documents[] | Administrative record; no billing. |
| `FeatureFlag` | tenant_id, feature_key, enabled | Per-tenant feature control. |
| `Template` | id, key, name, description, is_published | Catalogue entry. |
| `TenantTemplate` | tenant_id, template_id, enabled_at | Many-to-many; multiple concurrent templates permitted. |
| `TemplateAccessRequest` | id, tenant_id, template_id, requested_by, status, decided_by, decided_at | `PENDING` / `APPROVED` / `REJECTED`. |
| `User` | id, tenant_id (nullable for Super Admin), email, status, timezone | |
| `RoleAssignment` | user_id, role, scope_type (`PLATFORM`/`TENANT`/`DEPARTMENT`/`SUB_DEPARTMENT`), scope_id | Multiple assignments permitted per user. |
| `Department` | id, tenant_id, template_id, name | Owns exactly one board. |
| `SubDepartment` | id, department_id, name, manager_user_id (nullable) | Nullable manager resolves to parent Department Admin. |
| `Board` | id, department_id | Auto-created with the department. |
| `BoardColumn` | id, board_id, name, status_type, position, is_default | `status_type` immutable after creation. |
| `Ticket` | id, department_id, sub_department_id (nullable), reference, subject, column_id, sub_status, priority, category, requester_email, assignee_id, created_at, resolved_at, reopened_flag | |
| `TicketMessage` | id, ticket_id, author_type (`CUSTOMER`/`AGENT`/`SYSTEM`), visibility (`PUBLIC`/`INTERNAL`), body, created_at | Single feed; drives sub-status. |
| `Attachment` | id, owner_type, owner_id, filename, mime_type, size_bytes, storage_key | |
| `Form` | id, department_id, name, slug, public_url, is_active | |
| `FormField` | id, form_id, key, type, label, position, validation, visibility_condition | |
| `FormSubmission` | id, form_id, ticket_id, values (JSON) | Source data for rules and custom reports. |
| `Rule` | id, department_id, name, priority_order, conditions (JSON), actions (JSON), is_active | |
| `SlaPolicy` | id, department_id, name, conditions (JSON), first_response_target, resolution_target, pause_outside_hours | |
| `SlaTimer` | id, ticket_id, policy_id, type, started_at, due_at, paused_ms, breached_at | |
| `WorkingHours` | id, user_id, weekday, start_time, end_time, timezone | |
| `UnavailabilityPeriod` | id, user_id, start_date, end_date, reason | |
| `BusinessCalendar` | id, department_id, weekly_pattern, holidays[] | Department-level default. |
| `MailboxConnection` | id, scope_type (`DEPARTMENT`/`SUB_DEPARTMENT`), scope_id, address, auth_type, credentials_ref, status | |
| `NotificationTemplate` | id, department_id, event_key, subject, body, footer | |
| `BrandingProfile` | id, department_id, logo_key, primary_colour, secondary_colour | |
| `AuditEvent` | id, tenant_id, actor_id, action, target_type, target_id, before, after, occurred_at | Append-only. |

### 3.2 Data Integrity Rules
- **DAT-01** Deleting a tenant shall be a soft delete; restricting access (SRS-SA-03) shall not remove any data.
- **DAT-02** A `BoardColumn.status_type` shall be immutable once tickets have occupied that column.
- **DAT-03** A ticket shall always reference exactly one board column belonging to its own department's board.
- **DAT-04** `FormSubmission.values` shall be schema-validated against the `FormField` definitions at submission time; historical submissions shall remain readable after subsequent form edits (field definitions are versioned, not destructively overwritten).
- **DAT-05** `AuditEvent` records shall be immutable and shall not be deletable through any application interface.

---

## 4. Functional Requirements

Each requirement carries an SRS identifier and traces to its BRD origin. Requirements derived from BRD items marked *Recommended* or *Interpretation* are flagged **[Unconfirmed]** and should not be built until the business confirms them.

### 4.1 Tenancy and Platform Administration

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-SA-01 | The system shall allow a Super Admin to create, edit, suspend and soft-delete tenant accounts. A suspended tenant's users shall be denied authentication with an explanatory message; their data shall be retained intact. | SA-01 |
| SRS-SA-02 | The system shall allow a Super Admin to record and maintain, per tenant, an agreement comprising start date, end date, renewal status and zero or more uploaded supporting documents. | SA-02 |
| SRS-SA-03 | The system shall allow a Super Admin to restrict or re-enable access at tenant level or for an individual user, without data deletion. Restriction shall take effect on the next request; active sessions shall be invalidated within 60 seconds. | SA-03 |
| SRS-SA-04 | The system shall allow a Super Admin to enable or disable named platform features per tenant. A disabled feature shall be hidden in the UI **and** rejected at the API with HTTP 403. | SA-04 |
| SRS-SA-05 | The system shall present a Super Admin summary view listing all tenants with status, agreement end date, department count and active user count, sortable and filterable by status. **[Unconfirmed]** | SA-05 |
| SRS-SA-06 | The system shall notify the Super Admin at configurable intervals (default 60, 30 and 7 days) before an agreement's renewal or expiry date. **[Unconfirmed]** | SA-06 |

### 4.2 Template Marketplace

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-TM-01 | The system shall allow a Super Admin to create, edit, publish and unpublish templates, each identified by a unique key. | TM-01 |
| SRS-TM-02 | The system shall allow a Super Admin to enable or disable one or more templates for a given tenant. | TM-02 |
| SRS-TM-03 | The system shall present authorised tenant users a catalogue of all published templates, indicating for each whether it is enabled, requested or available. | TM-03 |
| SRS-TM-04 | The system shall allow an authorised tenant user to submit an access request for a template not enabled for their tenancy. A duplicate `PENDING` request for the same tenant/template pair shall be rejected. | TM-04 |
| SRS-TM-05 | The system shall allow a Super Admin to approve or reject template access requests; approval shall enable the template for that tenant and notify the requester. **[Unconfirmed]** | TM-05 |
| SRS-TM-06 | The system shall permit a tenant to hold multiple templates in an enabled state concurrently, each with independent configuration and users. | TM-06 |

### 4.3 Roles, Departments and Access Control

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-PA-01 | The system shall allow a Project Admin to create, edit, deactivate and reactivate users within their tenant's Support template instance. | PA-01 |
| SRS-PA-02 | The system shall allow a Project Admin to create departments within the Support template; department creation shall atomically create the department's board with default columns (SRS-BD-02). | PA-02, BD-01 |
| SRS-PA-03 | The system shall allow a Project Admin to assign one or more Department Admins to each department. | PA-03 |
| SRS-PA-04 | The system shall grant a Project Admin read access to reporting data across all departments in their tenancy, and shall deny access to boards, individual tickets and ticket message content unless a separate department-scoped role is assigned. | PA-04 |
| SRS-DA-01 | The system shall allow a Department Admin to add, remove and manage user access within their own department and its sub-departments only. | DA-01 |
| SRS-DA-02 | The system shall deny a Department Admin any read or write access to users, boards, tickets, settings or reports belonging to a department to which they hold no role assignment. | DA-02 |
| SRS-AC-01 | The system shall evaluate every authorisation decision server-side against the requesting user's `RoleAssignment` set and the target resource's scope chain (tenant → department → sub-department). | NFR-02, C-02 |

### 4.4 Sub-Departments

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-SD-01 | The system shall allow a Department Admin to create one or more sub-departments within their department. | SD-01 |
| SRS-SD-02 | The system shall allow assignment of a manager to each sub-department; where none is assigned, the system shall resolve the parent Department Admin as the effective manager for all authorisation and notification purposes. | SD-02 |
| SRS-SD-03 | The system shall allow a dedicated mailbox to be connected at sub-department scope, such that inbound mail to that address creates tickets assigned to that sub-department only. | SD-03, EM-03 |
| SRS-SD-04 | The system shall support granting a user access at whole-department scope **or** at one-or-more specific sub-department scopes. | SD-04 |
| SRS-SD-05 | The system shall apply the parent department's forms, SLA policies and rules to all its sub-departments; the system shall not permit sub-department-level definition of forms, SLAs or rules. | SD-05 |
| SRS-SD-06 | The system shall exclude from every read path — board, list, search, filter, report, export, notification and API response — any ticket whose sub-department is outside the requesting user's granted sub-department scope. This is a hard constraint and shall be covered by explicit negative test cases. | SD-06 |

> **Design note.** SD-06 is the binding constraint, not the board topology. A single board with permission-filtered queries and separate boards per sub-department are both acceptable, but the choice determines how filtering (§4.13) and reporting (§4.12) aggregate. Recommendation: one board per department with a mandatory sub-department scope predicate applied at the repository layer, so no query path can omit it.

### 4.5 Board Management

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-BD-01 | The system shall create exactly one board per department automatically at department creation. | BD-01 |
| SRS-BD-02 | The system shall initialise every new board with five columns in order: To Do (`OPEN`), In Progress (`OPEN`), On Hold (`PAUSED`), Escalated (`ESCALATED`), Done (`RESOLVED`). | BD-02, Appendix A |
| SRS-BD-03 | The system shall allow a Department Admin to add custom columns, each assigned to one of the four Status Types at creation. | BD-03, BD-05 |
| SRS-BD-04 | The system shall allow a Department Admin to rename any column, including the five defaults. Renaming shall not alter the column's Status Type. | BD-04 |
| SRS-BD-05 | The system shall persist an immutable Status Type per column and shall use that Status Type — never the display name — for all SLA, automation and reporting logic. **[Unconfirmed]** | BD-05, C-03 |
| SRS-BD-06 | The system shall allow reordering of all columns and deletion of non-default columns. Deletion shall be blocked while the column holds tickets, unless the user selects a destination column to which those tickets are moved. **[Unconfirmed]** | BD-06 |
| SRS-BD-07 | The system shall set each ticket's sub-status to `WAITING_FOR_SUPPORT` when the most recent `PUBLIC` message was authored by the customer, and to `WAITING_FOR_CUSTOMER` when it was authored by an agent. Messages with visibility `INTERNAL` shall be excluded from this evaluation. | BD-07 |
| SRS-BD-08 | The system shall move a ticket into an `ESCALATED` column only in response to explicit user action. SLA breach shall not trigger a column change. | BD-08 |
| SRS-BD-09 | On receipt of a customer reply to a ticket in a `RESOLVED` column, the system shall move the ticket to the board's first `OPEN` column, apply a `Reopened` label, and append the reply to the existing ticket feed. | BD-09 |

### 4.6 Department Settings — Branding, Email and Notification Templates

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-DS-01 | The system shall allow a Department Admin to upload a logo and define a colour scheme, applied to that department's customer-facing email and forms. | DS-01 |
| SRS-DS-02 | The system shall allow configuration of one or more sender / reply-to addresses per department, with one designated default. | DS-02 |
| SRS-DS-03 | The system shall provide an editable notification template per lifecycle event, covering at minimum: `TICKET_RAISED`, `STATUS_CHANGED`, `REPLY_RECEIVED`, `TICKET_RESOLVED`. | DS-03 |
| SRS-DS-04 | The system shall substitute placeholder tokens (at minimum customer name, ticket reference, department name, agent name, ticket subject, ticket URL) at send time. Unresolved tokens shall render as empty strings, never as raw token text. | DS-04 |
| SRS-DS-05 | The system shall allow each notification template to define its own footer. | DS-05 |
| SRS-DS-06 | The system shall apply a platform-level default footer where a template defines none. **[Unconfirmed — see §7 OQ-02: editable fallback vs. fixed legal disclaimer]** | DS-06 |
| SRS-DS-07 | The system shall require domain verification (SPF/DKIM check) of a sender address before permitting its use for outbound mail. **[Unconfirmed]** | DS-07 |
| SRS-DS-08 | The system shall seed a new department with suggested default notification templates and shall block the Department Admin from operational use of the department until the initial setup review is explicitly completed. The block shall apply only where no board configuration review has yet been recorded. | DS-08 |
| SRS-DS-09 | Where a department is already active and a user is newly assigned as its manager, the system shall present a non-blocking, dismissible step-by-step overview of the department's current configuration in place of the DS-08 hard block. | DS-09 |
| SRS-DS-10 | The system shall make the setup walkthrough available on demand from department settings at any time, with the user able to enter it at any step. | DS-10 |

### 4.7 Email Intake and Shared Mailboxes

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-EM-01 | The system shall allow a Department Admin to connect a mailbox to a department such that each newly received message creates a ticket on that department's board. | EM-01 |
| SRS-EM-02 | The system shall support shared mailboxes as well as individual mailboxes. | EM-02 |
| SRS-EM-03 | The system shall route tickets created from a sub-department-scoped mailbox to that sub-department only. | EM-03 |
| SRS-EM-04 | The system shall thread a customer reply onto its originating ticket, matching on message headers (`In-Reply-To` / `References`) with the ticket reference in the subject as fallback, and shall not create a duplicate ticket. **[Unconfirmed]** | EM-04 |
| SRS-EM-05 | The system shall support OAuth 2.0 for Microsoft 365 and Google Workspace mailboxes and IMAP with stored credentials otherwise; credentials shall be encrypted at rest and never returned by any API. **[Unconfirmed]** | EM-05, NFR-03 |
| SRS-EM-06 | The system shall suppress ticket creation for auto-generated mail (bounces, out-of-office, `Auto-Submitted` headers) and shall log each suppression. | Derived |
| SRS-EM-07 | The system shall surface mailbox connection failures (auth expiry, unreachable host) to the Department Admin within one polling cycle and shall retry with exponential backoff. | Derived |

### 4.8 Dynamic Forms

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-FM-01 | The system shall allow a Department Admin to create multiple forms per department. | FM-01 |
| SRS-FM-02 | The system shall support field types: single-line text, multi-line text, dropdown, checkbox, radio, date, number and file upload. | FM-02, Appendix B |
| SRS-FM-03 | The system shall support per-field validation: required/optional, min/max length, numeric range and format (email). Validation shall be enforced server-side on submission as well as client-side. | FM-03 |
| SRS-FM-04 | The system shall allow fields to be added, removed and reordered. | FM-04 |
| SRS-FM-05 | The system shall support conditional field visibility driven by the value of another field on the same form; hidden fields shall be excluded from required-field validation. **[Unconfirmed]** | FM-05 |
| SRS-FM-06 | The system shall publish each form at a distinct, unguessable public URL that requires no authentication. | FM-06 |
| SRS-FM-07 | The system shall create a ticket on the owning department's board for each form submission, linking the submission values to the ticket. | Derived |
| SRS-FM-08 | The system shall rate-limit and apply bot mitigation to public form endpoints. | Derived, NFR-03 |

### 4.9 Rules Engine

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-RE-01 | The system shall allow a Department Admin to define rules whose conditions evaluate submitted form field values using equals, not-equals, contains, greater-than, less-than and is-empty operators, combined with AND/OR. | RE-01 |
| SRS-RE-02 | The system shall support rule actions: assign to agent or group, set priority, set category/tag, apply an SLA policy, change column, send a notification. **[Unconfirmed — action list to be confirmed]** | RE-02 |
| SRS-RE-03 | The system shall evaluate rules in a Department Admin-configurable order and shall support a per-rule "stop processing further rules" flag. **[Unconfirmed]** | RE-03 |
| SRS-RE-04 | The system shall allow a rule to be tested against sample field values, reporting which conditions matched and which actions would fire, without mutating any ticket. **[Unconfirmed]** | RE-04 |
| SRS-RE-05 | The system shall log each rule execution against the affected ticket for diagnostic purposes. | Derived, NFR-09 |

### 4.10 SLA Management

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-SLA-01 | The system shall allow a Department Admin to define one or more SLA policies per department. | SLA-01 |
| SRS-SLA-02 | The system shall allow SLA policy applicability to be conditioned on form field values (e.g. `Priority = High`). Where multiple policies match, the most restrictive target shall apply. | SLA-02 |
| SRS-SLA-03 | The system shall start SLA timers at ticket creation and shall maintain separate first-response and resolution targets. The first-response timer shall stop on the first `PUBLIC` agent message. | SLA-03 |
| SRS-SLA-04 | The system shall provide a per-department setting determining whether SLA timers pause outside working hours or run continuously, and shall apply it to all timers in that department. | SLA-04 |
| SRS-SLA-05 | The system shall notify the Department Admin at a configurable at-risk threshold (default 80% of target elapsed) and again on breach. **[Unconfirmed]** | SLA-05 |
| SRS-SLA-06 | The ticket view shall display an SLA indicator with states `ON_TRACK`, `AT_RISK` and `BREACHED`, and the remaining or overdue duration. **[Unconfirmed]** | SLA-06 |
| SRS-SLA-07 | The system shall record `breached_at` on a timer that passes its target and shall not delete or reset breach history. | Derived |

> **Open dependency.** SLA behaviour on reopen (BD-09) is unresolved — see OQ-03 in §7. Until answered, implement `SlaTimer` such that restart, resume and fresh-policy are all reachable without schema change.

### 4.11 Ticket Assignment, Working Hours and Availability

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-ASG-01 | The system shall support four per-department assignment methods: rule-based, round robin, workload-based (lowest current open-ticket count) and manual. | ASG-01 |
| SRS-ASG-02 | Where automatic assignment yields no eligible agent, the system shall leave the ticket unassigned, mark it `ASSIGNMENT_FAILED`, and surface an error to the Department Admin. | ASG-02 |
| SRS-ASG-03 | The system shall notify the Department Admin immediately on assignment failure. No ticket shall remain silently unrouted. | ASG-03 |
| SRS-ASG-04 | Automatic assignment shall exclude agents outside their configured working hours and agents within a marked unavailability period. | ASG-04, WH-03 |
| SRS-ASG-05 | The system shall support bulk reassignment of a selected agent's tickets to a single agent, a defined group, or the department pool, executed asynchronously with a progress and result summary. | ASG-05 |
| SRS-ASG-06 | The system shall allow an agent to transfer a ticket to another department or sub-department, retaining the transferring user's read access to that ticket for progress tracking, and recording the transfer in the ticket history. | ASG-06 |
| SRS-WH-01 | The system shall allow a Department Admin to define per-user working days, times and timezone. | WH-01 |
| SRS-WH-02 | The system shall allow a Department Admin to mark a user unavailable for one or more date ranges. | WH-02 |
| SRS-WH-03 | The system shall exclude unavailable users from all automatic assignment during the marked period. | WH-03 |
| SRS-WH-04 | The system shall flag tickets already assigned to a user who becomes unavailable with an indicator (e.g. "Waiting — agent unavailable"), and shall make that flag filterable on the board. | WH-04 |
| SRS-WH-05 | The system shall allow a department-level default business calendar, used for SLA calculation where no user-specific working hours apply. **[Unconfirmed]** | WH-05 |

### 4.12 Comments, Communication Feed and Reporting

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-CM-01 | The system shall present all customer messages, agent replies and internal notes in a single chronological feed per ticket. | CM-01 |
| SRS-CM-02 | The system shall require the author to select `Internal Note` or `Reply` before posting. A `Reply` shall be dispatched to the customer using the department's `REPLY_RECEIVED` notification template and branding. | CM-02 |
| SRS-CM-03 | The system shall visually distinguish internal notes from customer-visible replies, and shall never include internal note content in any outbound customer email. **[Unconfirmed as UI treatment; the exclusion rule is mandatory]** | CM-03 |
| SRS-CM-04 | The system shall support rich text formatting and file attachments on comments, subject to configurable size and MIME-type restrictions. **[Unconfirmed]** | CM-04, AR-05 |
| SRS-CM-05 | The system shall allow @mention of a colleague within an internal note, notifying the mentioned user, restricted to users holding access to that ticket's scope. **[Unconfirmed]** | CM-05 |
| SRS-RPT-01 | The system shall provide a per-department report of ticket volume by type/category. | RPT-01 |
| SRS-RPT-02 | The system shall provide resolution time broken down by priority (mean and median). | RPT-02 |
| SRS-RPT-03 | The system shall allow reports to be run over a user-selected date range and compared against a preceding equivalent range. | RPT-03 |
| SRS-RPT-04 | The system shall allow a Department Admin to build custom reports grouped and filtered by that department's own form fields. | RPT-04 |
| SRS-RPT-05 | The system shall export any report to CSV and PDF. Exports exceeding a size threshold shall be generated asynchronously and delivered by download link. | RPT-05 |
| SRS-RPT-06 | The system shall serve the Project Admin's cross-department visibility by both a live dashboard and scheduled exportable reports, aggregated across departments, containing no ticket message content. | RPT-06, PA-04 |
| SRS-RPT-07 | All reporting queries shall respect the requesting user's department and sub-department scope (SRS-SD-06). | Derived |

### 4.13 Board Filtering and Search

| ID | Requirement | Trace |
| --- | --- | --- |
| SRS-FLT-01 | The system shall support filtering board tickets by assignee, including "unassigned". | FLT-01 |
| SRS-FLT-02 | The system shall support filtering by the value of any custom form field belonging to that department. | FLT-02 |
| SRS-FLT-03 | The system shall provide free-text search across ticket subject, reference, requester email and message body, scoped to the user's permitted tickets. | FLT-03 |
| SRS-FLT-04 | The system shall provide standard filters for status, sub-status, priority and date range alongside custom field filters. **[Unconfirmed]** | FLT-04 |
| SRS-FLT-05 | Applied filters shall be reflected in the URL so a filtered view can be bookmarked and shared; the recipient shall see only tickets within their own scope. | Derived |

---

## 5. External Interface Requirements

### 5.1 User Interface
- **UI-01** A single responsive web client shall serve all authenticated roles, with navigation determined by the user's role assignments.
- **UI-02** Public form pages shall render with the owning department's branding and shall be usable without authentication.
- **UI-03** Customer-facing forms and email shall meet WCAG 2.1 AA.
- **UI-04** Board views shall support drag-and-drop between columns, with an accessible keyboard-operable equivalent.

### 5.2 API Interface
- **API-01** All functionality shall be exposed through an authenticated HTTP API; the web client shall be a consumer of that API with no privileged path.
- **API-02** Every API request shall be authorised against the caller's role assignments before any data access (SRS-AC-01).
- **API-03** List endpoints shall be paginated and shall enforce a maximum page size.
- **API-04** Error responses shall use consistent machine-readable codes and shall not leak the existence of out-of-scope resources (return 404, not 403, for resources outside the caller's tenant).

### 5.3 Mail Interface
- **MAIL-01** Inbound: polling or push subscription per connected mailbox, with per-message deduplication by `Message-ID`.
- **MAIL-02** Outbound: per-department sender identity, `Reply-To` set to the connected mailbox, and a stable ticket reference in headers and subject to support threading (SRS-EM-04).
- **MAIL-03** Bounce and delivery-failure events shall be recorded against the ticket.

### 5.4 Identity Interface
- **IDP-01** SAML 2.0 and OIDC SSO shall be supported, configurable per tenant.
- **IDP-02** MFA shall be supported for local accounts and shall be enforceable per tenant.

---

## 6. Non-Functional Requirements

| ID | Category | Requirement | Trace |
| --- | --- | --- | --- |
| SRS-NFR-01 | Isolation | Tenant and department data shall be logically isolated. No request shall return data outside the caller's scope chain. Verified by automated cross-tenant negative tests in CI. | NFR-01 |
| SRS-NFR-02 | Security | RBAC shall be enforced at the API layer independently of the UI. | NFR-02 |
| SRS-NFR-03 | Security | Data shall be encrypted in transit (TLS 1.2+) and at rest, including attachments and stored mailbox credentials. | NFR-03 |
| SRS-NFR-04 | Authentication | SSO (SAML 2.0 / OIDC) and MFA shall be supported. | NFR-04 |
| SRS-NFR-05 | Performance | Board and ticket views shall render within an agreed target under expected concurrency. *Target to be agreed — proposed: p95 ≤ 2 s for a 500-ticket board at 200 concurrent users.* | NFR-05 |
| SRS-NFR-06 | Scalability | The architecture shall accommodate growth in tenants, tickets and concurrent users by horizontal scaling, without redesign. | NFR-06 |
| SRS-NFR-07 | Availability | An uptime target shall be agreed and documented. *Proposed: 99.5% monthly excluding notified maintenance.* | NFR-07 |
| SRS-NFR-08 | Compliance | The platform shall meet UK GDPR / DPA 2018 obligations for personal data, including export and erasure on request. | NFR-08, AR-11 |
| SRS-NFR-09 | Auditability | Administrative and configuration actions (user, permission, SLA, rule, template, agreement changes) shall be written to an immutable audit log with actor, timestamp and before/after state. | NFR-09, AR-09 |
| SRS-NFR-10 | Accessibility | Customer-facing forms and email shall meet WCAG 2.1 AA. | NFR-10 |
| SRS-NFR-11 | Observability | Mailbox polling, rule execution, SLA evaluation and assignment outcomes shall emit structured logs and metrics sufficient to diagnose a single ticket's lifecycle. | Derived |
| SRS-NFR-12 | Recoverability | Database backups shall be taken at least daily with a documented, tested restore procedure. | Derived |

---

## 7. Open Issues

These must be resolved before the affected requirements are implemented.

> **Status:** All open issues below were resolved in a design-review session on **2026-08-17**. Each resolution is recorded in **§10 Resolved Design Decisions** (see the "Open Questions" table there).

| ID | Question | Blocks |
| --- | --- | --- |
| OQ-01 | Is the deferred customer self-service portal a named future phase, or fully out of scope? | Roadmap; affects whether ticket read-access abstractions are built portal-ready now. |
| OQ-02 | Is the system-wide default footer (SRS-DS-06) an editable fallback or a fixed platform legal disclaimer? | SRS-DS-06 |
| OQ-03 | On reopen (SRS-BD-09), does the SLA timer restart, resume, or does a fresh policy apply? | SRS-SLA-03, SRS-SLA-07 |
| OQ-04 | May any agent move a ticket to `ESCALATED` (SRS-BD-08), or only managers/Department Admins? | SRS-BD-08, SRS-AC-01 |
| OQ-05 | Does the `Reopened` label clear automatically on agent response, or require manual clearing? | SRS-BD-09 |
| OQ-06 | Confirm the rule action list in SRS-RE-02. | SRS-RE-02 |
| OQ-07 | Confirm performance (SRS-NFR-05) and availability (SRS-NFR-07) targets. | SRS-NFR-05, SRS-NFR-07 |
| OQ-08 | Confirm attachment size and MIME-type restrictions. | SRS-CM-04, SRS-FM-02 |

---

## 8. Deferred Scope (from BRD §8)

Recorded for roadmap visibility; **not** specified for build in this release: in-app/email notification preferences (AR-01), self-service portal (AR-02), knowledge base (AR-03), automatic SLA-breach escalation (AR-04), merge/split tickets (AR-06), macros and canned responses (AR-07), CSAT survey (AR-08), webhooks and public REST API (AR-10), multi-language localisation (AR-12), standard priority/category fields (AR-13).

> AR-13 warrants early consideration: without fixed priority and category fields, cross-department reporting (SRS-RPT-06) can only aggregate on ticket counts and timings, not on category, because each department's form fields differ.

---

## 9. Traceability Summary

| BRD Section | BRD IDs | SRS Section |
| --- | --- | --- |
| 7.1 Super Admin | SA-01 → SA-06 | §4.1 |
| 7.2 Template Marketplace | TM-01 → TM-06 | §4.2 |
| 7.3 Project / Department Admin | PA-01 → PA-04, DA-01 → DA-02 | §4.3 |
| 7.4 Sub-Departments | SD-01 → SD-06 | §4.4 |
| 7.5 Board Management | BD-01 → BD-09 | §4.5 |
| 7.6 Department Settings | DS-01 → DS-10 | §4.6 |
| 7.7 Email Intake | EM-01 → EM-05 | §4.7 |
| 7.8 Dynamic Forms | FM-01 → FM-06 | §4.8 |
| 7.9 Rules Engine | RE-01 → RE-04 | §4.9 |
| 7.10 SLA Management | SLA-01 → SLA-06 | §4.10 |
| 7.11 Assignment | ASG-01 → ASG-06 | §4.11 |
| 7.12 Working Hours | WH-01 → WH-05 | §4.11 |
| 7.13 Comments | CM-01 → CM-05 | §4.12 |
| 7.14 Reporting | RPT-01 → RPT-06 | §4.12 |
| 7.15 Filtering & Search | FLT-01 → FLT-04 | §4.13 |
| 8 Additional Recommended | AR-01 → AR-14 | §8 (deferred) |
| 9 Non-Functional | NFR-01 → NFR-10 | §6 |
| 11 Open Questions | — | §7 |

All BRD functional requirements are accounted for. SRS requirements without a BRD trace are marked **Derived** and represent implementation obligations implied by, but not stated in, the BRD.

---

## 10. Resolved Design Decisions

*Recorded 2026-08-17 from a design-review session. These decide how the SRS is realized on the existing PEN ticketing codebase and resolve all §7 open issues. Where a decision changes an existing model, the migration is additive and applied to the dev database first (per the shared-DB rules in `AGENTS.md`).*

### 10.1 Foundation

| # | Decision |
| --- | --- |
| D-01 | **SRS ↔ codebase.** The SRS is the target spec, realized by **mapping onto existing models and refactoring only where forced**. Reuse the current `Tenant`, `Department`, `Team`, ticket and intake models plus the tenant-isolation work already in place; introduce new SRS entities only where no equivalent exists. |
| D-02 | **Isolation (C-01, NFR-01).** Enforce tenant + scope isolation with a **mandatory Prisma client extension** that injects the tenant and `RoleAssignment` scope predicate into every query (no call site can omit it), backed by **CI cross-tenant negative tests**. **Postgres RLS** (non-owner role + per-request tenant GUC) is adopted later as a hardening phase, not as the initial control. |

### 10.2 Object model

| # | Decision |
| --- | --- |
| D-03 | **Template.** Add `Template` + `TenantTemplate` (per-tenant enablement) + `Department.template_id`; seed a single published **Support** template. The **marketplace catalogue and `TemplateAccessRequest` approve/reject flow are deferred** (SRS-SA-05 / SRS-TM-05 [Unconfirmed]). The department-level `type` (development/support/hub) previously shipped is **folded away** as a template concern. |
| D-04 | **Board + Sub-department.** The board moves to **department** level. `BoardColumn` carries an **immutable `status_type`** ∈ {OPEN, PAUSED, ESCALATED, RESOLVED}. **`Team` → `SubDepartment`** as a ticket scope tag (`Ticket.sub_department_id`, nullable); one board per department. **SD-06** is enforced by the repository-layer scope predicate. Migrate `TeamStatus` → `BoardColumn`. |
| D-05 | **Tickets & Projects.** Tickets are organized by the department board + sub-department tag. **`Project`/`Sprint`/`ProjectModule` are retired from the Support experience** (hidden in UI, `projectId` no longer applied) but their tables are **kept (deprecated, no data loss)**. Per-team numbering (`TeamTicketCounter`) is replaced by a **per-department `reference`**. |
| D-06 | **RBAC.** A single **`RoleAssignment(userId, role, scopeType ∈ {PLATFORM, TENANT, DEPARTMENT, SUB_DEPARTMENT}, scopeId)`** is the authorization source of truth. Migrate the existing role tables (`isSuperAdmin`, `TenantMembership`, `DepartmentManager`, `DepartmentMember`, `DepartmentAccess`, `TeamMembership`) into it; **retire `Profile.role` as an authz signal**. |
| D-07 | **Hub retired.** Remove hub-as-a-department-type and its member-level cross-department scope (`isHub` / `buildHubScope`). Cross-department visibility is provided solely by the **Project Admin reporting** capability (PA-04 / RPT-06). |
| D-08 | **Standard priority + category (AR-13).** Keep the existing ticket priority; add a **standard, template/tenant-level category taxonomy** so cross-department reporting (RPT-06) can aggregate by category. Department custom form fields remain for department-level custom reports. |
| D-09 | **New platform entities.** Build **`FeatureFlag`** (SA-04), immutable **`AuditEvent`** (NFR-09) and **`Agreement`** (SA-02) now. `Tenant.type` (institution/agency/company) is **kept as display-only metadata** (drives no behavior). |

### 10.3 Subsystems

| # | Decision |
| --- | --- |
| D-10 | **Email intake.** Add **`MailboxConnection(scope = DEPARTMENT \| SUB_DEPARTMENT)`**; reuse the existing inbound-processing + `TicketMessage` feed + outbound path behind a **provider abstraction**. OAuth (M365/Google) and IMAP (SRS-EM-05 [Unconfirmed]) land behind that abstraction later; threading (EM-04) and auto-generated-mail suppression (EM-06) are implemented now. |
| D-11 | **Dynamic Forms.** Reuse intake as `Form`/`FormField` (map `IntakeFormConfig`/`IntakeFormField`); extend with **versioned field definitions** (DAT-04) and **conditional visibility** (FM-05). Form submissions create tickets (FM-07). |
| D-12 | **Identity.** Keep the existing **Supabase auth + MFA**; **defer per-tenant SAML/OIDC** behind an auth abstraction (IDP-01/02, NFR-04). |

### 10.4 Open-question resolutions (§7)

| OQ | Resolution |
| --- | --- |
| OQ-01 | Self-service portal is a **named future phase** — keep the ticket read-access layer clean/portal-ready, build no portal surface now. |
| OQ-02 | The default footer (DS-06) is an **editable platform/tenant default fallback**, inherited by departments that set none — not a fixed legal string. |
| OQ-03 | On reopen (BD-09): the **resolution timer resumes** from where it paused; a **fresh first-response timer** starts for the new customer message. `SlaTimer` keeps restart/resume/fresh reachable without schema change. |
| OQ-04 | **Any agent** with ticket access may move a ticket to `ESCALATED`; a per-department restriction to managers/Department Admins may be added later. |
| OQ-05 | The `Reopened` label **auto-clears on the first agent response** after reopen. |
| OQ-06 | Rule actions (RE-02) confirmed: assign to agent/group, set priority, set category/tag, apply SLA policy, change column, send notification — plus a per-rule **stop-processing** flag (RE-03). |
| OQ-07 | Performance/availability targets **accepted as proposed**: p95 ≤ 2 s for a 500-ticket board at 200 concurrent users; 99.5% monthly uptime excluding notified maintenance. Revisit with real load data. |
| OQ-08 | Attachments: **≤ 25 MB per attachment**; allowlist images, PDF, office docs, text/CSV and zip; block executables/scripts. |

### 10.5 Delivery sequencing

Additive migrations, dev-database first, per `AGENTS.md`:

1. **Phase 1 — RBAC & isolation:** `RoleAssignment` (D-06) + mandatory Prisma scope-filter (D-02) + CI cross-tenant negative tests.
2. **Phase 2 — Board & sub-department:** department board + `BoardColumn.status_type`, `Team → SubDepartment`, per-department `reference`; retire Projects (D-05) and hub (D-07).
3. **Phase 3 — Support operations:** SLA engine, Rules engine, Working hours / availability, `MailboxConnection` (D-10).
4. **Phase 4 — Platform & hardening:** `Agreement`, `AuditEvent`, `FeatureFlag` (D-09) + Postgres RLS hardening (D-02).

**Highest-risk phases:** Phase 1 (RBAC rewrite underpins all authorization) and Phase 2 (board/ticket restructure changes ticket identity, numbering and every board/query path) — both require the most negative-test coverage.
