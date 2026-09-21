# BRD Gap Analysis — Multi-Tenant Support Ticketing Platform

**Source document:** `BRD_Multi_Tenant_Ticketing_Platform_v0.3 1.docx` (BRD v0.3)
**Codebase:** `support-ticket-system` (branch `main`)
**Report date:** 2026-09-18
**Method:** Every numbered BRD requirement was checked against the Prisma schema, API routes (`src/app/api`), pages (`src/app`), and library code (`src/lib`). Verdicts are evidence-based with file references.

---

## Executive Summary

The platform implements the **overwhelming majority** of the BRD. Every module in the confirmed scope (Sections 7.1–7.15) is present and functional.

| Category | Requirements | ✅ Done | 🟡 Partial | ❌ Not done |
|---|---|---|---|---|
| **Core functional (7.1–7.15)** | 90 | **87** | 2 | 1 |
| Proposed / recommended (Section 8) | 10 assessed | 4 | 3 | 3 |
| Non-functional (Section 9) | 4 assessed | 3 | 1 | 0 |

**Core functional completion: ~97%.**

### What is NOT done (confirmed scope)
- **BD-05** — Board columns do **not** map to a fixed underlying status *type*. Columns store a free-text label/colour but there is no immutable `statusType` behind each column. This is the one hard gap in confirmed scope and the BRD explicitly flags it as important for SLA/cross-department reporting accuracy.
- **SD-02** *(partial)* — Sub-department managers can be assigned, but the "defaults to the parent Department Admin when none assigned" fallback is not explicitly implemented.
- **EM-05** *(partial)* — Mailbox auth enum reserves OAuth (M365/Google) and IMAP, but only the Resend provider is actually implemented.

### Known latent bug (flagged during review)
- **Workload-based assignment ignores `SubDepartment.workloadThreshold`** — `src/lib/assignment-engine.ts` assigns strictly to the lowest open-ticket count and never reads the configured threshold; the threshold-aware `resolveAssignee()` in `src/lib/rota.ts` is dead code (only used in tests). ASG-01 still counts as done (all four methods work), but this config field is inert.

---

## 7.1 Super Admin — Tenancy & Platform Management ✅ 6/6

| ID | Status | Evidence |
|---|---|---|
| SA-01 | ✅ Done | Create/edit/suspend/soft-delete tenants: `api/admin/tenants/route.ts`, `api/admin/tenants/[id]/route.ts`; `Tenant.status`, `Tenant.deletedAt`; `src/lib/tenant-lifecycle.ts`. |
| SA-02 | ✅ Done | `Agreement` model (start/end date, `renewalStatus`, `AgreementDocument`); `api/admin/tenants/[id]/agreements/*`; `src/lib/agreements.ts`. |
| SA-03 | ✅ Done | Tenant suspend + per-user `Profile.isActive` restriction (`api/admin/users/[id]`); `broadcastForceLogout()`; audited. |
| SA-04 | ✅ Done | `FeatureFlag` model + `api/admin/feature-flags`; `src/lib/feature-flags.ts` (fail-open). |
| SA-05 | ✅ Done | `platform/page.tsx` tenant summary with status; `api/admin/tenants` supports `includeDeleted`. |
| SA-06 | ✅ Done | `api/cron/agreement-reminder-sweep` + `sweepAgreementReminders()` (60/30/7-day reminders, idempotent). |

## 7.2 Template Marketplace ✅ 6/6

| ID | Status | Evidence |
|---|---|---|
| TM-01 | ✅ Done | `Template` + `TemplateFeature`; `api/admin/templates/*`; `src/lib/template-catalogue.ts`. |
| TM-02 | ✅ Done | `TenantTemplate` junction; `api/admin/tenants/[id]/templates`; grant/revoke helpers. |
| TM-03 | ✅ Done | `api/templates` + `listCatalogueForTenant()` (available/requested/active). |
| TM-04 | ✅ Done | `TemplateRequest` (PENDING) created via `api/templates` POST; notifies super-admins. |
| TM-05 | ✅ Done | `api/admin/template-requests/[id]/review` + `reviewTemplateRequest()`. |
| TM-06 | ✅ Done | Many-to-many `TenantTemplate`; active features are the UNION across templates. |

## 7.3 Project Admin & Department Admin ✅ 6/6

| ID | Status | Evidence |
|---|---|---|
| PA-01 | ✅ Done | Tenant-admin user management via `api/admin/tenants/[id]/members`, `api/admin/users/[id]`; `applyTenantMembership()`. |
| PA-02 | ✅ Done | `api/admin/departments` POST (guarded by `requireAdmin()`); auto-seeds Support template. |
| PA-03 | ✅ Done | `api/admin/departments/[id]/managers`; `DepartmentManager` model. |
| PA-04 | ✅ Done | Cross-department **reporting** scope via `src/lib/reporting/report-scope.ts`; ticket/board access blocked unless a sub-dept membership / `DepartmentAccess` grant exists (`src/lib/prisma-scope.ts`). |
| DA-01 | ✅ Done | `api/admin/sub-departments/[id]/members` guarded by `assertSubDepartmentScope()`. |
| DA-02 | ✅ Done | `canManageDept()` + department-FK isolation + ticket scope filtering enforce cross-department isolation. |

## 7.4 Sub-Departments 🟡 5/6 (1 partial)

| ID | Status | Evidence |
|---|---|---|
| SD-01 | ✅ Done | `api/admin/sub-departments/route.ts` POST. |
| SD-02 | 🟡 Partial | `SubDepartmentMembership` with `sub_manager` role exists, but the "default to parent Department Admin when unassigned" fallback isn't explicitly implemented. |
| SD-03 | ✅ Done | Sub-department-scoped mailbox: `api/admin/sub-departments/[id]/mailbox-connections`; `MailboxConnection.scopeType`. |
| SD-04 | ✅ Done | `DepartmentAccess.fullAccess` (whole-dept) + sub-department membership (scoped) — both grant levels supported. |
| SD-05 | ✅ Done | `src/lib/rule-executor.ts` documents dept-scoped rules inherited by sub-depts; forms inherited via intake config. |
| SD-06 | ✅ Done | **Hard isolation** at query layer: `src/lib/prisma-scope.ts` `subDepartmentTeamIds` allowlist AND-ed into every query. |

## 7.5 Board Management 🟡 8/9 (1 not done)

| ID | Status | Evidence |
|---|---|---|
| BD-01 | ✅ Done | Board (`SubDepartmentStatus`) auto-seeded on sub-department creation via `seedSubDepartmentStatuses()`. *(Note: board is per sub-department, not per department — consistent with the sub-dept model.)* |
| BD-02 | ✅ Done | `DEFAULT_SUB_DEPARTMENT_STATUSES` = To Do / In Progress / On Hold / Escalated / Done. |
| BD-03 | ✅ Done | `api/sub-departments/[id]/statuses` POST. |
| BD-04 | ✅ Done | `api/sub-departments/[id]/statuses/[statusId]` PATCH renames any column. |
| **BD-05** | ❌ **Not done** | `SubDepartmentStatus` has label/colour but **no `statusType` field**. The `StatusType` enum exists but isn't linked to columns. No immutable status category behind each display name — the BRD flags this as important for SLA countdown and cross-department reporting integrity. |
| BD-06 | ✅ Done | Reorder (bulk PATCH) + delete (with ticket-count guard). |
| BD-07 | ✅ Done | `src/lib/ticket-sub-status.ts` `deriveSubStatus()` from last visible message; internal notes are separate rows (ignored by construction). |
| BD-08 | ✅ Done | No auto-escalation on breach; only manual status change / rule `change_column` action. |
| BD-09 | ✅ Done | `src/lib/customer-reopen.ts` + `ticket-column-moves.ts` reopen Done→To Do with Reopened label. |

## 7.6 Department Settings — Branding, Email & Notification Templates ✅ 10/10

| ID | Status | Evidence |
|---|---|---|
| DS-01 | ✅ Done | `EmailBranding` (logo, colours) in `Department.emailConfig`; `api/admin/branding-logo`, `departments/branding` page. |
| DS-02 | ✅ Done | `EmailConfig.fromName/fromEmail/replyTo` (`src/lib/email-config.ts`). |
| DS-03 | ✅ Done | Notification-template CRUD: `api/admin/email-templates` + `EMAIL_TEMPLATE_KEYS` covering intakeConfirmation (raised), statusChanged, customerReply (reply received), resolution & ticketCompleted (resolved/closed); overrides at workspace/dept/sub-dept scope. |
| DS-04 | ✅ Done | `{{placeholder}}` tokens (e.g. `{{ticketTitle}}`, `{{submitterFirstName}}`, `{{departmentName}}`) in `email-templates/defaults.ts`; unresolved render empty (per code comment). |
| DS-05 | ✅ Done | Per-template `footerText` override on `EmailTemplateOverride`. |
| DS-06 | ✅ Done | `DEFAULT_FOOTER_TEXT` system-wide fallback via dept/tenant/platform default chain. |
| DS-07 | ✅ Done | `checkDomainVerification()` before mailbox use; `api/admin/email-domains` (Resend). |
| DS-08 | ✅ Done | `src/lib/department-setup.ts` `isDepartmentOperational()` hard-blocks ticket creation until `setupCompletedAt` set. |
| DS-09 | ✅ Done | `needsWalkthroughOverview()` non-blocking overview for active dept + new manager. |
| DS-10 | ✅ Done | On-demand walkthrough: `components/departments/department-walkthrough.tsx` + `api/admin/departments/[id]/walkthrough`. |

## 7.7 Email Intake & Shared Mailboxes 🟡 4/5 (1 partial)

| ID | Status | Evidence |
|---|---|---|
| EM-01 | ✅ Done | `src/lib/mailbox-ticket-creation.ts`, `src/lib/process-inbound-email.ts`; `api/admin/mailbox-connections`. |
| EM-02 | ✅ Done | `MailboxConnection` accepts any address; shared-mailbox setup at dept & sub-dept routes. |
| EM-03 | ✅ Done | `scopeType = SUB_DEPARTMENT` routes to a single sub-dept. |
| EM-04 | ✅ Done | Reply threading via reply-token → In-Reply-To → subject reference (`src/lib/inbound-email.ts`). |
| EM-05 | 🟡 Partial | `MailboxAuthType` enum reserves OAUTH_M365 / OAUTH_GOOGLE / IMAP, but only **Resend** is implemented (`src/lib/mail-providers/index.ts`); OAuth/IMAP are placeholders. |

## 7.8 Dynamic Forms ✅ 6/6

| ID | Status | Evidence |
|---|---|---|
| FM-01 | ✅ Done | `IntakeFormConfig` (dept-scoped, multiple); `api/intake/forms`, `api/departments/[id]/forms`. |
| FM-02 | ✅ Done | `IntakeFieldType`: text, richtext/textarea, email, number, select, file, checkbox, radio, date. |
| FM-03 | ✅ Done | `FieldValidation` (required, min/max length, numeric range, email/pattern); server-enforced. |
| FM-04 | ✅ Done | `api/intake/forms/[id]/fields` CRUD + `.../fields/reorder`. |
| FM-05 | ✅ Done | `VisibilityRule` (`visibleWhen` JSON) + `isFieldVisible()`. |
| FM-06 | ✅ Done | Each form has a UUID; public submission at `api/support/{uuid}/submit`. |

## 7.9 Rules Engine ✅ 4/4

| ID | Status | Evidence |
|---|---|---|
| RE-01 | ✅ Done | `Rule.conditions` (ConditionGroup) on form values; `src/lib/rules-engine.ts`. |
| RE-02 | ✅ Done | All actions present: assign_agent/group, set_priority, set_category, set_tag, apply_sla, change_column, send_notification (`src/lib/rule-executor.ts`). |
| RE-03 | ✅ Done | `Rule.order` + ordered evaluation with stop-processing (`planRules()`). |
| RE-04 | ✅ Done | Dry-run test endpoint `api/departments/[id]/rules/test`. |

## 7.10 SLA Management ✅ 6/6

| ID | Status | Evidence |
|---|---|---|
| SLA-01 | ✅ Done | `SlaPolicy` per department; `api/departments/[id]/sla-policies`. |
| SLA-02 | ✅ Done | `SlaPolicy.conditions` matched against form values (`src/lib/sla-policy-match.ts`). |
| SLA-03 | ✅ Done | `SlaTimer` with separate first-response/resolution targets from creation (`src/lib/sla-engine.ts`). |
| SLA-04 | ✅ Done | `slaConfig.pauseOutsideHours` per dept (and sub-dept override). |
| SLA-05 | ✅ Done | `checkAndNotifySla()` fires at-risk/breach notifications (idempotent) to assignee + managers. |
| SLA-06 | ✅ Done | `getSlaIndicatorForTicket()` (on track/at risk/breached); `api/tickets/[id]/sla`. |

## 7.11 Ticket Assignment & Reassignment ✅ 6/6 (1 latent bug)

| ID | Status | Evidence |
|---|---|---|
| ASG-01 | ✅ Done | `AssignmentMethod`: RULE_BASED, ROUND_ROBIN, WORKLOAD_BASED, MANUAL (+ per-sub-dept override). **⚠ Latent bug:** workload method ignores `workloadThreshold` (see summary). |
| ASG-02 | ✅ Done | `recordAssignmentFailure()` logs `ASSIGNMENT_FAILED`. |
| ASG-03 | ✅ Done | Immediate email + notification to all dept managers on failure. |
| ASG-04 | ✅ Done | `src/lib/rota.ts` `getEligibleMembers()` filters off-shift agents. |
| ASG-05 | ✅ Done | `BulkReassignJob` (SINGLE_AGENT / GROUP / DEPARTMENT_POOL); `api/admin/tickets/bulk-reassign`. |
| ASG-06 | ✅ Done | `transferTicket()` moves ticket + `TicketAccessGrant` retains transferrer visibility. |

## 7.12 Working Hours & Availability ✅ 5/5

| ID | Status | Evidence |
|---|---|---|
| WH-01 | ✅ Done | `MemberSchedule` (workingDays, start/end, timezone); `api/admin/members/[userId]/schedule`. |
| WH-02 | ✅ Done | `MemberHoliday`; `api/admin/members/[userId]/holidays`. |
| WH-03 | ✅ Done | `isMemberAvailableNow()` excludes members on holiday from assignment. |
| WH-04 | ✅ Done | `src/lib/agent-unavailable.ts` applies "Waiting — agent unavailable" label. |
| WH-05 | ✅ Done | `Department.businessHours` fallback calendar (`resolveCalendarForTicket()`). |

## 7.13 Comments & Communication Feed ✅ 5/5

| ID | Status | Evidence |
|---|---|---|
| CM-01 | ✅ Done | Chronological `TicketMessage` feed; `api/tickets/[id]/messages`. |
| CM-02 | ✅ Done | Reply (customer-visible, emailed) vs internal note (`Comment.messageId`, staff-only). |
| CM-03 | ✅ Done | Visual distinction via message direction vs. attached notes. |
| CM-04 | ✅ Done | TipTap rich-text editor + `Attachment` model. |
| CM-05 | ✅ Done | `@mention` parsing → `Mention` + notifications (`src/lib/mentions.ts`). |

## 7.14 Reporting & Analytics ✅ 6/6

| ID | Status | Evidence |
|---|---|---|
| RPT-01 | ✅ Done | `computeVolumeReport()` by type/category. |
| RPT-02 | ✅ Done | `computeResolutionTimeReport()` by priority. |
| RPT-03 | ✅ Done | Selectable start/end date ranges. |
| RPT-04 | ✅ Done | Custom-field reports (`groupByFieldId` + filters). |
| RPT-05 | ✅ Done | CSV / XLSX / PDF export via `ReportExportJob`. |
| RPT-06 | ✅ Done | Cross-department dashboard + periodic exports for Project Admin. |

## 7.15 Board Filtering & Search ✅ 4/4

| ID | Status | Evidence |
|---|---|---|
| FLT-01 | ✅ Done | Assignee filter (`src/lib/board-search.ts`). |
| FLT-02 | ✅ Done | `resolveFormFieldTicketIds()` filters by custom field. |
| FLT-03 | ✅ Done | `resolveSearchTicketIds()` free-text search (title, ref, email, message body). |
| FLT-04 | ✅ Done | Status / sub-status / priority / date-range filters. |

---

## Section 8 — Additional Recommended (Proposed) Requirements

These were *proposed*, not confirmed scope. Assessed opportunistically:

| ID | Area | Status | Note |
|---|---|---|---|
| AR-01 | Notifications + per-user prefs | ✅ Done | `Notification` model + `Profile.notificationPrefs`; `api/profile/notifications`. |
| AR-05 | Attachments (tickets/forms/comments) | ✅ Done | `Attachment` model with size validation. |
| AR-06 | Merge & split tickets | ❌ Not done | No merge/split operations. |
| AR-07 | Macros / canned responses | ❌ Not done | `TicketTemplate` is for ticket structure, not reply snippets. |
| AR-08 | CSAT survey | ❌ Not done | No post-resolution survey. |
| AR-09 | Audit log | ✅ Done | Immutable `AuditEvent` model; `api/admin/audit-events`. |
| AR-10 | Integrations / API | 🟡 Partial | Read-only REST v1 (`api/v1/*`) + GitHub/Resend inbound webhooks; no customer-facing outbound webhooks. |
| AR-11 | Data retention & GDPR | 🟡 Partial | Data export (`api/me/data-export`) + soft-delete; no automated erasure/retention purge. |
| AR-13 | Standard priority/category fields | ✅ Done | `Ticket.priority` + `Ticket.category` enums alongside custom fields. |
| AR-14 | Mobile responsiveness | 🟡 Unclear | Tailwind-based UI implies responsiveness; not explicitly verified. |

*Not assessed:* AR-02 (self-service portal — confirmed out of scope), AR-03 (knowledge base), AR-04 (escalation management — partly covered by BD/SLA), AR-12 (multi-language).

---

## Section 9 — Non-Functional Requirements (spot-checked)

| ID | Status | Note |
|---|---|---|
| NFR-01 | ✅ Done | Tenant isolation enforced by Prisma client extension (`src/lib/prisma-scope.ts`). |
| NFR-02 | ✅ Done | RBAC guards on API routes (`requireAuth`/`requireAdmin`/`assert*`); `RoleAssignment` model. |
| NFR-04 | 🟡 Partial | OTP/MFA path exists (`api/auth/verify-otp`); no SSO/SAML provider config found. |
| NFR-09 | ✅ Done | Admin/config actions recorded in `AuditEvent`. |

*Not deeply verified:* NFR-03 (encryption at rest/transit — infra-level), NFR-05 (performance), NFR-06 (scalability), NFR-07 (uptime target), NFR-08 (UK GDPR), NFR-10 (WCAG 2.1 AA).

---

## Recommendations (priority order)

1. **BD-05 — add an immutable status type behind board columns.** This is the only confirmed-scope requirement that is not done, and the BRD explicitly warns it underpins SLA countdown and cross-department reporting accuracy once departments rename columns freely.
2. **Fix the workload-threshold bug** in `assignment-engine.ts` (or remove the dead `resolveAssignee()` / the `workloadThreshold` column so config doesn't mislead admins).
3. **SD-02 — implement the "manager defaults to parent Department Admin" fallback** so unassigned sub-departments have a responsible owner.
4. **EM-05 — implement OAuth (M365/Google) and/or IMAP** mailbox providers, or narrow the BRD to Resend-only for this phase.
5. **Resolve the open BRD questions (Section 11)** that affect built behaviour — esp. SLA behaviour on reopen (BD-09), who may escalate (BD-08), and default-footer editability (DS-06).
6. **Confirm scope for proposed items** AR-06/07/08 (merge-split, macros, CSAT) and finish AR-10/AR-11 (outbound webhooks, GDPR erasure) if required.
