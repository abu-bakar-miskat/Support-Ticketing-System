# Feature List — Multi-Tenant Support Ticketing Platform

_Derived from BRD v0.3 (Multi-Tenant Support Ticketing Platform). Every feature below traces back to a requirement ID in the BRD. Items tagged **[Recommended]** or **[Interpretation]** are analyst proposals not yet confirmed by the business._

---

## 1. Super Admin — Tenancy & Platform Management

- **SA-01** — Create, edit, suspend and delete tenant accounts.
- **SA-02** — Record and manage each tenant's commercial agreement (start/end date, renewal status, supporting documents).
- **SA-03** — Restrict or re-enable access for a tenant, or individual users within a tenant, without deleting their data.
- **SA-04** — Enable or disable specific platform features on a per-tenant basis.
- **SA-05** — Summary view of all tenants and their status (active, suspended, trial, expired). _[Recommended]_
- **SA-06** — Notify the Super Admin ahead of a tenant agreement's renewal/expiry date. _[Recommended]_

## 2. Template Marketplace

- **TM-01** — Create and manage multiple templates (e.g. "Support"), each a distinct functionality package.
- **TM-02** — Enable one or more templates for a given tenant.
- **TM-03** — Authorised tenant users can view a catalogue of all available templates.
- **TM-04** — Authorised tenant users can request access to a template not yet enabled for their tenancy.
- **TM-05** — Super Admin can review and approve/reject template access requests. _[Recommended]_
- **TM-06** — A tenant can have multiple templates active simultaneously.

## 3. Project Admin & Department Admin Roles

- **PA-01** — Project Admin creates and manages users within the tenant's Support template.
- **PA-02** — Project Admin creates departments within the Support template.
- **PA-03** — Project Admin assigns one or more Department Admins to each department.
- **PA-04** — Project Admin has reporting-only visibility across all departments (no board/ticket/communication access unless separately granted).
- **DA-01** — Department Admin adds and manages users within their own department only.
- **DA-02** — Department Admin cannot view/manage users, boards or settings of another department (isolation). _[Recommended]_

## 4. Sub-Departments

- **SD-01** — Create one or more sub-departments within a department.
- **SD-02** — Each sub-department has its own manager; defaults to the parent Department Admin where none assigned.
- **SD-03** — A sub-department can have its own dedicated shared mailbox (email routes tickets only to that sub-department).
- **SD-04** — Access controllable at sub-department level: grant a colleague one/multiple sub-departments, or the whole department (both grant levels supported).
- **SD-05** — Sub-departments inherit the parent department's forms, SLAs and rules; they do not define their own.
- **SD-06** — A user scoped to specific sub-departments cannot view tickets of other sub-departments in the same parent (hard isolation rule).

## 5. Board Management

- **BD-01** — Each department has its own board, created automatically on department setup.
- **BD-02** — Every new board defaults to five columns: To Do, In Progress, On Hold, Escalated, Done.
- **BD-03** — Department Admin can add custom columns.
- **BD-04** — Department Admin can rename any column, including the default five.
- **BD-05** — Each column maps to a fixed underlying status category (Open, Paused, Escalated, Resolved) independent of display name. _[Recommended]_
- **BD-06** — Department Admin can reorder and delete non-default columns. _[Recommended]_
- **BD-07** — Each ticket shows a "Waiting for Customer" / "Waiting for Support" sub-status, set automatically from the most recent visible reply (internal notes ignored).
- **BD-08** — Tickets move to Escalated only via manual action, not automatically on SLA breach.
- **BD-09** — A customer reply to a ticket in Done moves it back to To Do with a "Reopened" label.

## 6. Department Settings — Branding, Email & Notification Templates

- **DS-01** — Upload department-level branding (logo, colour scheme) for customer-facing communications.
- **DS-02** — Configure one or more sender/reply-to email addresses for outbound correspondence.
- **DS-03** — Create/edit notification templates for each lifecycle stage (ticket raised, status change/in progress, reply received, resolved/closed).
- **DS-04** — Notification templates support dynamic placeholder fields (customer name, ticket ID, department name, agent name).
- **DS-05** — Each notification template has its own customisable footer.
- **DS-06** — System-wide default footer, used where a template defines none. _[Interpretation]_
- **DS-07** — Outbound sender addresses domain-verified before use (spam reduction). _[Recommended]_
- **DS-08** — Provide suggested default templates for new departments; hard-block Department Admin from proceeding until initial setup review is complete (brand-new department, no board yet).
- **DS-09** — For an already-active department with a newly-joined manager, show a non-blocking step-by-step overview of current configuration instead of a forced setup review.
- **DS-10** — The setup overview/walkthrough is available on demand at any time, startable from any chosen step.

## 7. Email Intake & Shared Mailboxes

- **EM-01** — Connect a mailbox to a department so any received email automatically creates a ticket.
- **EM-02** — Support connecting shared mailboxes, not just individual/personal ones.
- **EM-03** — A sub-department can have its own dedicated shared mailbox routing tickets only to it.
- **EM-04** — Customer replies to the connected mailbox thread onto the existing ticket (no duplicates). _[Recommended]_
- **EM-05** — Mailbox connection uses provider-appropriate auth (OAuth for M365/Google Workspace, or IMAP credentials). _[Recommended]_

## 8. Dynamic Forms

- **FM-01** — Build multiple custom forms per department (e.g. staff vs students).
- **FM-02** — Field types: single-line text, multi-line text, dropdown/select, checkbox, radio, date, number, file upload.
- **FM-03** — Field validation: required/optional, min/max length, numeric range, format (e.g. email).
- **FM-04** — Add, remove and reorder fields on a form.
- **FM-05** — Conditional field visibility (show Field B only when Field A has a value). _[Recommended]_
- **FM-06** — Each form published at its own distinct URL.

## 9. Rules Engine

- **RE-01** — Create rules triggered on submitted form field values.
- **RE-02** — Rule actions: assign to agent/team, set priority, set category/tag, apply an SLA, change status, send a notification. _[Proposed action list — confirm]_
- **RE-03** — Set the evaluation order when multiple rules could match. _[Recommended]_
- **RE-04** — Test a rule against sample data before activating it. _[Recommended]_

## 10. SLA Management

- **SLA-01** — Define one or more SLA policies per department.
- **SLA-02** — SLA policies configurable by form field values (e.g. Priority = High → shorter target).
- **SLA-03** — SLA timers calculated from ticket creation time, with separate first-response and resolution targets.
- **SLA-04** — Per-department setting: whether SLA timers pause outside working hours or keep counting.
- **SLA-05** — Notify Department Admin when a ticket is at risk of, or has, breached its SLA. _[Recommended]_
- **SLA-06** — Ticket view shows a visual SLA countdown / status indicator (on track / at risk / breached). _[Recommended]_

## 11. Ticket Assignment & Reassignment

- **ASG-01** — Multiple configurable assignment methods per department: rule-based (by form field), round robin, workload-based, manual.
- **ASG-02** — On automatic assignment failure (no eligible agent), display an error to the Department Admin.
- **ASG-03** — On failure, immediately notify the Department Admin for manual escalation/reassignment (never silently unrouted).
- **ASG-04** — Automatic assignment respects agent working hours (no routing to off-shift agents).
- **ASG-05** — Bulk reassign tickets from one agent to another agent, a group, or the whole department.
- **ASG-06** — An agent can transfer a ticket to a different department/sub-department while retaining visibility to track progress.

## 12. Working Hours & Availability

- **WH-01** — Define working hours (days, times, timezone) per user.
- **WH-02** — Mark a user as unavailable (e.g. on leave) for specific dates.
- **WH-03** — No automatic assignment to a user during their unavailable dates.
- **WH-04** — Tickets already assigned when a user becomes unavailable are flagged (e.g. "Waiting — agent unavailable").
- **WH-05** — Define a department-level default business calendar for SLA calculation when no agent-specific hours apply. _[Recommended]_

## 13. Comments & Communication Feed

- **CM-01** — All ticket communication (customer messages + agent responses) in a single chronological feed.
- **CM-02** — When posting, agent chooses Internal Note (department-only) or Reply (customer-visible, sent via notification template).
- **CM-03** — Internal notes and customer-visible replies visually distinguished. _[Recommended]_
- **CM-04** — Comments support rich text formatting and file attachments. _[Recommended]_
- **CM-05** — @mention a colleague within an internal note. _[Recommended]_

## 14. Reporting & Analytics

- **RPT-01** — Per-department reporting of ticket volumes by type/category.
- **RPT-02** — Resolution time broken down by ticket priority.
- **RPT-03** — Performance viewable/comparable across user-selectable time ranges.
- **RPT-04** — Build custom reports based on the department's own form fields.
- **RPT-05** — Reports exportable in both CSV and PDF.
- **RPT-06** — Project Admin cross-department view served by both a live real-time dashboard and periodic exportable reports, aggregated across departments.

## 15. Board Filtering & Search

- **FLT-01** — Filter tickets by assignee.
- **FLT-02** — Filter tickets by any custom form field.
- **FLT-03** — Generic free-text search across tickets.
- **FLT-04** — Common filters (status, sub-status, priority, date range) alongside custom field filters. _[Recommended]_

---

## 16. Additional Recommended Requirements (Proposed — not yet in scope)

- **AR-01 Notifications** — In-app + email notifications for assignment, mentions, SLA breaches, status changes, with per-user preferences.
- **AR-02 Customer Self-Service Portal** — Deferred / out of scope this phase (email-only); revisit as future phase.
- **AR-03 Knowledge Base** — Department-level help articles/FAQs to deflect repetitive tickets.
- **AR-04 Escalation Management** — Partly covered by Escalated column + SLA alerts; open: auto vs manual escalation on breach.
- **AR-05 Attachments** — File upload on tickets, forms and comments, with size/type restrictions.
- **AR-06 Merge & Split Tickets** — Merge duplicates; split a multi-issue ticket.
- **AR-07 Macros / Canned Responses** — Predefined response snippets for agents.
- **AR-08 CSAT Survey** — Optional post-resolution satisfaction rating to the customer.
- **AR-09 Audit Log** — Platform-wide log of key admin actions (user, permission, SLA, rule changes).
- **AR-10 Integrations / API** — Webhooks or REST API for CRM, Slack/Teams, etc.
- **AR-11 Data Retention & Compliance** — Retention policy + UK GDPR (data export, right to erasure).
- **AR-12 Multi-language Support** — Localisation of templates and portal.
- **AR-13 Standard Priority & Category Fields** — Fixed priority/category fields alongside custom form fields for comparable reporting.
- **AR-14 Mobile Responsiveness** — Agent and customer interfaces usable on mobile browsers.

---

## 17. Non-Functional Requirements

- **NFR-01** — Tenant data logically isolated; no cross-tenant/department access.
- **NFR-02** — Role-based access control enforced at the API level, not just the UI.
- **NFR-03** — Data encrypted at rest and in transit.
- **NFR-04** — Authentication supports single sign-on (SSO) and multi-factor authentication (MFA).
- **NFR-05** — Core ticket/board views load within acceptable time under expected concurrent load.
- **NFR-06** — Scales with tenant count, ticket volume and concurrent users without redesign.
- **NFR-07** — Agreed and documented availability/uptime target.
- **NFR-08** — UK GDPR / Data Protection Act compliance for personal data.
- **NFR-09** — Key administrative and configuration actions logged for audit.
- **NFR-10** — Customer-facing forms and portal meet WCAG 2.1 AA accessibility guidelines.

---

## 18. User Roles (Reference)

| Role | Scope | Key Capabilities |
|------|-------|------------------|
| **Super Admin** | Platform-wide | Tenants, agreements, per-tenant feature toggles, template catalogue & access requests |
| **Project Admin** | Tenant (per template) | Tenant users, departments, assign Department Admins, cross-department reporting only |
| **Department Admin** | Single department | Users, sub-departments, board, branding, mailboxes, templates, forms, rules, SLAs, assignment, working hours, reporting |
| **Sub-department Manager** | Single sub-department | Users & day-to-day work in their sub-department (defaults to Department Admin) |
| **Agent** | Department / sub-department | Work tickets, reply, internal notes, transfer/reassign where permitted |
| **Customer / Requester** | Own tickets only | Raise and reply by email |

---

## 19. Open Questions (from BRD Section 11)

- Should the deferred customer self-service portal be a named future phase or fully out of scope?
- Is the system-wide default footer (DS-06) an editable fallback or a fixed platform-level legal disclaimer?
- When a closed ticket is reopened (BD-09), does its SLA restart, resume, or a fresh SLA apply?
- Can any agent move a ticket to Escalated (BD-08), or is it restricted to managers/Department Admins?
- Does the "Reopened" label (BD-09) clear automatically on agent response, or need manual clearing?

---

_Source: BRD v0.3 — Multi-Tenant Support Ticketing Platform. Scope excludes billing/invoicing, non-Support template internals, native mobile apps, data migration, and (this phase) the customer self-service portal._
