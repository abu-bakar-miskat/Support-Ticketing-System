# Role caller discovery inventory

Audit date: 2026-09-07. Companion: [project-audit.md](project-audit.md).

This repository-wide text scan identifies candidate readers/writers for implementation coverage. It is not a list of confirmed bugs or mandatory edits. HTML roles, AI message roles, and descriptive text produce false positives. Tests and generated client files are excluded; SQL migrations were inspected separately in the audit. For each relevant candidate, record its scoped replacement and regression test during implementation; mark non-authorization matches as excluded with a reason.

Search terms: `role`, `RoleAssignment`, `departmentManager`, `departmentMember`, `departmentAccess`, `subDepartmentMembership`, `tenantMembership`, `isSuperAdmin`, `TicketAccessGrant`.

The audit report maps confirmed high-priority paths. Also include indirect consumers with no matching token: API-key authentication, session refresh, service routes, scope wrappers, and identity SQL functions.

## Step 1 closure — confirmed authorization inventory (2026-09-07)

This section supersedes the unchecked candidate list below for delivery planning. The
candidate list remains as a discovery record: a text match is not itself an
authorization dependency. The migration destination is intentionally a later step;
no authority mode changes in this delivery.

### Current authorities and readers

| Source | Current purpose and consumers | Replacement destination |
| --- | --- | --- |
| `Profile.role` | Legacy display/default value and direct global authorization gates throughout route handlers, layouts, `dept-scope`, `sub-department-manage`, and `project-permissions`. `getProfile()` returns a derived effective role rather than this column for normal requests. | Step 8 resource-aware resolver; Step 9 scoped display DTO. Retain only as a compatibility projection until Step 12. |
| `Profile.isSuperAdmin` | Platform authority; read by `requireSuperAdmin`, platform pages/routes, login landing, tenant scope, seeds, and support-template scripts. | Step 3 platform operation/audit representation, then Step 8 platform assignment resolver. Keep compatibility projection through the rollback window. |
| `TenantMembership.role` | Tenant membership and tenant-level role; read by `getProfile`, tenant admin guards, tenant scope, invite flows, and tenant management UI/routes. Suspended/deleted tenants and inactive memberships are filtered by `getProfile`. | Step 3 scoped operations and Step 8 tenant resolver. Membership existence/activity remains separate from privilege. |
| `DepartmentManager` | Department Admin/Manager grant plus operational metadata (`assignedBy`, walkthrough dismissal); read by `getProfile`, `dept-scope`, manager/admin routes, assignment and notification paths. | Step 3 department-scope operation. Preserve operational metadata when compatibility storage is retired in Step 12. |
| `SubDepartmentMembership.role` | Sub-department role, active membership and primary-team display; read by `getProfile`, sub-department routes, department/member pages, project permissions, assignments, and notification targeting. | Step 3 validates role/scope pairs; Step 8 resolves active scoped grants. Keep membership/activity distinct from role projection. |
| `RoleAssignment` | Canonical-shaped mirror, rebuilt from legacy sources by `role-assignment.ts`; currently read for assignment summary only and overwritten by read-triggered synchronization. | Step 3 makes synchronization transactional and scoped; Step 8 activates it as the sole privilege reader after the coordinated cutover. |
| `DepartmentMember`, `DepartmentAccess`, `ProjectMember`, `TicketAccessGrant` | Direct membership and limited/expiring/resource access. `DepartmentAccess` can expire and can grant full access; project and ticket grants are narrower than role grants. | Step 5/8 keep these as separate access facts. They must never be flattened into an unrestricted Department Agent assignment. |

### Supported mutation owners

| Owner | Current mutation | Scope / current defect | Replacement or no-change owner |
| --- | --- | --- | --- |
| `src/app/api/admin/users/[id]/route.ts` PATCH | Updates `Profile.role`; updates **all** `SubDepartmentMembership.role` rows and swallows failures; moves direct/sub-department membership. | Cross-tenant/global overwrite can leave `DepartmentManager` intact, producing the incident. | Step 3 `role-management` replace/convert operation; profile metadata and membership moves remain explicit non-role operations. |
| `src/app/api/admin/users/[id]/route.ts` DELETE | Deletes memberships, manager/access/project rows and soft-deletes profile. | Account removal must revoke assignments without touching unrelated account data. | Step 7 shared revoke/deactivate workflow. |
| `src/app/api/admin/departments/[id]/managers/route.ts` and `[userId]/route.ts` | Grants/changes and revokes `DepartmentManager`; grant also creates `DepartmentMember`. | Department scope is explicit, but role, membership and audit are separate operations. | Step 3 grant/replace/revoke operation; retain direct membership provenance. |
| `src/app/api/admin/sub-departments/[id]/members/route.ts` | Creates/updates/deletes `SubDepartmentMembership`, updates legacy profile primary team. | POST/PATCH accepts unchecked role values and does not validate before-state authority. | Step 3 validated sub-department operation; Step 7 routes it through the service. |
| `src/lib/tenant-membership.ts`; `src/app/api/admin/tenants/[id]/members/route.ts`; `src/lib/invites/accept-tenant-invite.ts` | Upserts/removes tenant membership, derives manager/direct membership by department IDs. | A tenant role is conflated with department grants; obsolete manager grants are not reconciled. | Step 3 scoped conversion operation, then Step 7 tenant invite/member workflow. |
| `src/lib/invites/accept-department-invite.ts` and department/join-request routes | Adds/revives tenant, direct-department and sub-department memberships. | Invite is an authorization writer and must preserve actual sub-department scope. | Step 7 shared service with old-token compatibility handling. |
| `src/app/api/admin/super-admins/route.ts` | Directly toggles `Profile.isSuperAdmin`. | Platform grant has no compatible audit representation today. | Step 3 platform operation with an explicit platform audit representation. |
| `src/lib/reconcile-profile-on-login.ts` | Restores profiles, migrates auth IDs, creates default tenant membership. | Identity replacement currently omits role assignments; restore must not revive revoked grants. | Step 7 atomic identity/reconciliation workflow after deployed-function inspection. |
| `src/lib/role-assignment.ts` | Deletes and recreates every assignment from legacy data. | Read-triggered rebuild derives before its transaction and is only process-local serialized. | Step 3 lock/derive/replace in one transaction, then disable before Step 10 activation. |
| `prisma/seed*.ts`, support-template/import scripts | Create demo/bootstrap users, membership, manager and sub-department roles. | Operational/bootstrap writers. | Step 7 inventory closure; use the service where it is executable application behavior, or document fixture-only compatibility use. |
| `src/lib/department-setup.ts` | Updates only `DepartmentManager.walkthroughDismissedAt`. | Business metadata, not a privilege mutation. | No role-service routing; preserve metadata during Step 12 retirement. |
| Department access/project/ticket routes and `ticket-transfer.ts` | Manage direct department, project, and ticket access. | Access facts are not role grants; expiry and `fullAccess` must survive. | No role-service routing; Step 8 resolver consumes them as resource access. |

### Session, cache, and semantic notes

- Protected server requests call `getProfile()` through the auth helpers, so a committed demotion can be enforced on the next protected request; this is not a server-side profile cache.
- `UserHydrator` copies server props into Zustand with an empty dependency array. `router.refresh()` therefore leaves mounted client role labels and permission mirrors stale until Step 9 fixes the hydrator and adds authorization revision data.
- `NotificationsRealtime` polls `/api/session/status` about every 55 seconds and handles forced logout. The status route reports only authentication validity, so it cannot refresh an active user's changed role. Realtime force-logout is used for restriction, suspension, and removal.
- Direct `DepartmentMember` membership is independent of `DepartmentManager`; revoking a manager grant must preserve a separately established direct membership. `DepartmentAccess` is separately limited by `expiresAt` and `fullAccess`; inactive sub-department membership does not by itself override tenant Admin authority. `DepartmentManager.walkthroughDismissedAt`, profile nickname/location/timezone/preferences, and assignment availability remain business metadata.
- Background/service consumers include API-key authentication, inbound-email/notification routing, report and bulk-reassignment jobs, MCP tools, tenant scope wrappers, and deployed profile-auth identity functions. Step 7 owns mutation migration; Step 8 owns their resource-aware authorization decision and documents delegated versus independent service-key/job authority.

### Step 1 result

Every supported role mutation has an identified current owner and migration destination. Authorization readers are grouped by their legacy source above; broad candidate matches remain below for implementation-time closure and false-positive review. The next delivery must add isolated fixtures before changing any writer.

## Candidates

- [ ] `prisma/schema.prisma`
- [ ] `prisma/seed-multitenancy.ts`
- [ ] `prisma/seed-users.ts`
- [ ] `prisma/seed.ts`
- [ ] `scripts/activate-support-template.ts`
- [ ] `scripts/create-support-template.ts`
- [ ] `scripts/generate-project-plan-pdf.ts`
- [ ] `scripts/import-recruitment-xlsx.ts`
- [ ] `scripts/recruitment-seed.json`
- [ ] `scripts/setup-storage.ts`
- [ ] `scripts/verify-rls-hardening.ts`
- [ ] `src/app/(dashboard)/(home)/page.tsx`
- [ ] `src/app/(dashboard)/activity/page.tsx`
- [ ] `src/app/(dashboard)/board/page.tsx`
- [ ] `src/app/(dashboard)/department/activity/page.tsx`
- [ ] `src/app/(dashboard)/department/page.tsx`
- [ ] `src/app/(dashboard)/inbox/page.tsx`
- [ ] `src/app/(dashboard)/mailboxes/page.tsx`
- [ ] `src/app/(dashboard)/manager/page.tsx`
- [ ] `src/app/(dashboard)/modules/page.tsx`
- [ ] `src/app/(dashboard)/profile/page.tsx`
- [ ] `src/app/(dashboard)/projects/[id]/page.tsx`
- [ ] `src/app/(dashboard)/projects/page.tsx`
- [ ] `src/app/(dashboard)/recruitment/page.tsx`
- [ ] `src/app/(dashboard)/recruitment/screening/[id]/page.tsx`
- [ ] `src/app/(dashboard)/recruitment/screening/invite-form.tsx`
- [ ] `src/app/(dashboard)/recruitment/screening/page.tsx`
- [ ] `src/app/(dashboard)/recruitment/screening/questions/page.tsx`
- [ ] `src/app/(dashboard)/reports/page.tsx`
- [ ] `src/app/(dashboard)/settings/api-keys/page.tsx`
- [ ] `src/app/(dashboard)/settings/approvals/page.tsx`
- [ ] `src/app/(dashboard)/settings/assignment/page.tsx`
- [ ] `src/app/(dashboard)/settings/branding/page.tsx`
- [ ] `src/app/(dashboard)/settings/configuration/page.tsx`
- [ ] `src/app/(dashboard)/settings/departments/page.tsx`
- [ ] `src/app/(dashboard)/settings/email/page.tsx`
- [ ] `src/app/(dashboard)/settings/import/page.tsx`
- [ ] `src/app/(dashboard)/settings/institutions/page.tsx`
- [ ] `src/app/(dashboard)/settings/intake-forms/[id]/page.tsx`
- [ ] `src/app/(dashboard)/settings/intake-forms/[id]/submissions/[intakeId]/page.tsx`
- [ ] `src/app/(dashboard)/settings/intake-forms/[id]/submissions/page.tsx`
- [ ] `src/app/(dashboard)/settings/intake-forms/page.tsx`
- [ ] `src/app/(dashboard)/settings/layout.tsx`
- [ ] `src/app/(dashboard)/settings/members/page.tsx`
- [ ] `src/app/(dashboard)/settings/page.tsx`
- [ ] `src/app/(dashboard)/settings/projects/page.tsx`
- [ ] `src/app/(dashboard)/settings/routing/page.tsx`
- [ ] `src/app/(dashboard)/settings/rules/page.tsx`
- [ ] `src/app/(dashboard)/settings/sla/page.tsx`
- [ ] `src/app/(dashboard)/settings/sub-departments/page.tsx`
- [ ] `src/app/(dashboard)/settings/tags/page.tsx`
- [ ] `src/app/(dashboard)/settings/templates-catalogue/page.tsx`
- [ ] `src/app/(dashboard)/settings/templates/page.tsx`
- [ ] `src/app/(dashboard)/settings/workflows/page.tsx`
- [ ] `src/app/(dashboard)/sub-departments/[name]/assignment/page.tsx`
- [ ] `src/app/(dashboard)/sub-departments/[name]/automation-rules/page.tsx`
- [ ] `src/app/(dashboard)/sub-departments/[name]/email/page.tsx`
- [ ] `src/app/(dashboard)/sub-departments/[name]/layout.tsx`
- [ ] `src/app/(dashboard)/sub-departments/[name]/mailbox/page.tsx`
- [ ] `src/app/(dashboard)/sub-departments/[name]/page.tsx`
- [ ] `src/app/(dashboard)/sub-departments/[name]/sla-policies/page.tsx`
- [ ] `src/app/(dashboard)/sub-departments/[name]/support-forms/page.tsx`
- [ ] `src/app/(dashboard)/sub-departments/page.tsx`
- [ ] `src/app/(dashboard)/tasks/[id]/page.tsx`
- [ ] `src/app/(dashboard)/tasks/page.tsx`
- [ ] `src/app/(dashboard)/timeline/page.tsx`
- [ ] `src/app/api/_debug-ticket-detail/route.ts`
- [ ] `src/app/api/active-dept/route.ts`
- [ ] `src/app/api/active-sub-department/route.ts`
- [ ] `src/app/api/activity/route.ts`
- [ ] `src/app/api/admin/audit-events/route.ts`
- [ ] `src/app/api/admin/branding-logo/route.ts`
- [ ] `src/app/api/admin/departments/[id]/access/[userId]/route.ts`
- [ ] `src/app/api/admin/departments/[id]/access/route.ts`
- [ ] `src/app/api/admin/departments/[id]/candidates/route.ts`
- [ ] `src/app/api/admin/departments/[id]/direct-members/[userId]/route.ts`
- [ ] `src/app/api/admin/departments/[id]/direct-members/route.ts`
- [ ] `src/app/api/admin/departments/[id]/invites/[inviteId]/route.ts`
- [ ] `src/app/api/admin/departments/[id]/invites/route.ts`
- [ ] `src/app/api/admin/departments/[id]/mailbox-mail/route.ts`
- [ ] `src/app/api/admin/departments/[id]/managers/[userId]/route.ts`
- [ ] `src/app/api/admin/departments/[id]/managers/route.ts`
- [ ] `src/app/api/admin/departments/[id]/members/route.ts`
- [ ] `src/app/api/admin/departments/[id]/projects/route.ts`
- [ ] `src/app/api/admin/departments/[id]/setup/route.ts`
- [ ] `src/app/api/admin/departments/route.ts`
- [ ] `src/app/api/admin/email-identity/route.ts`
- [ ] `src/app/api/admin/email-notifications/route.ts`
- [ ] `src/app/api/admin/mailbox-connections/[id]/check/route.ts`
- [ ] `src/app/api/admin/mailbox-connections/[id]/route.ts`
- [ ] `src/app/api/admin/projects/route.ts`
- [ ] `src/app/api/admin/sub-departments/[id]/mailbox-connections/route.ts`
- [ ] `src/app/api/admin/sub-departments/[id]/mailbox-mail/route.ts`
- [ ] `src/app/api/admin/sub-departments/[id]/members/route.ts`
- [ ] `src/app/api/admin/sub-departments/[id]/route.ts`
- [ ] `src/app/api/admin/sub-departments/route.ts`
- [ ] `src/app/api/admin/super-admins/route.ts`
- [ ] `src/app/api/admin/tenant-branding/route.ts`
- [ ] `src/app/api/admin/tenants/[id]/invites/route.ts`
- [ ] `src/app/api/admin/tenants/[id]/members/route.ts`
- [ ] `src/app/api/admin/tenants/route.ts`
- [ ] `src/app/api/admin/tickets/bulk-assign/route.ts`
- [ ] `src/app/api/admin/tickets/bulk-reassign/[jobId]/route.ts`
- [ ] `src/app/api/admin/tickets/bulk-reassign/route.ts`
- [ ] `src/app/api/admin/tickets/smart-assign/route.ts`
- [ ] `src/app/api/admin/users/[id]/route.ts`
- [ ] `src/app/api/admin/users/route.ts`
- [ ] `src/app/api/departments/[id]/calendar/route.ts`
- [ ] `src/app/api/departments/[id]/join-requests/[requestId]/route.ts`
- [ ] `src/app/api/departments/[id]/join-requests/route.ts`
- [ ] `src/app/api/departments/[id]/mailbox-mail/route.ts`
- [ ] `src/app/api/departments/[id]/people/route.ts`
- [ ] `src/app/api/invites/[token]/accept/route.ts`
- [ ] `src/app/api/join-requests/[id]/route.ts`
- [ ] `src/app/api/labels/[id]/route.ts`
- [ ] `src/app/api/labels/route.ts`
- [ ] `src/app/api/me/data-export/route.ts`
- [ ] `src/app/api/mentions/route.ts`
- [ ] `src/app/api/notifications/[id]/route.ts`
- [ ] `src/app/api/notifications/recent/route.ts`
- [ ] `src/app/api/projects/[id]/members/route.ts`
- [ ] `src/app/api/projects/route.ts`
- [ ] `src/app/api/reports/overview/route.ts`
- [ ] `src/app/api/reports/sub-department-time/route.ts`
- [ ] `src/app/api/screening/email-preview/route.ts`
- [ ] `src/app/api/screening/session/[id]/reject-email/route.ts`
- [ ] `src/app/api/screening/session/route.ts`
- [ ] `src/app/api/search/route.ts`
- [ ] `src/app/api/sprints/[id]/route.ts`
- [ ] `src/app/api/sprints/import/route.ts`
- [ ] `src/app/api/sub-departments/[id]/join-requests/[requestId]/route.ts`
- [ ] `src/app/api/sub-departments/[id]/join-requests/route.ts`
- [ ] `src/app/api/sub-departments/[id]/members/route.ts`
- [ ] `src/app/api/support/[uuid]/assist/route.ts`
- [ ] `src/app/api/templates/[id]/route.ts`
- [ ] `src/app/api/templates/route.ts`
- [ ] `src/app/api/tenant-invites/[token]/accept/route.ts`
- [ ] `src/app/api/tickets/[id]/messages/[messageId]/accept/route.ts`
- [ ] `src/app/api/tickets/[id]/messages/[messageId]/reject/route.ts`
- [ ] `src/app/api/tickets/[id]/route.ts`
- [ ] `src/app/api/tickets/route.ts`
- [ ] `src/app/departments/branding/page.tsx`
- [ ] `src/app/departments/mailboxes/page.tsx`
- [ ] `src/app/departments/page.tsx`
- [ ] `src/app/login/actions.ts`
- [ ] `src/app/login/page.tsx`
- [ ] `src/app/onboarding/layout.tsx`
- [ ] `src/app/platform/[id]/page.tsx`
- [ ] `src/app/platform/activity/page.tsx`
- [ ] `src/app/platform/administrators/page.tsx`
- [ ] `src/app/platform/layout.tsx`
- [ ] `src/app/platform/page.tsx`
- [ ] `src/app/platform/profile/page.tsx`
- [ ] `src/app/platform/settings/page.tsx`
- [ ] `src/app/platform/templates/page.tsx`
- [ ] `src/app/platform/tenant-types/page.tsx`
- [ ] `src/app/screen/[token]/page.tsx`
- [ ] `src/app/screen/[token]/screening-flow.tsx`
- [ ] `src/app/tenant-invite/[token]/page.tsx`
- [ ] `src/components/activity/activity-page.tsx`
- [ ] `src/components/auth/sts-logo.tsx`
- [ ] `src/components/board/board-filter-bar.tsx`
- [ ] `src/components/board/board-page.tsx`
- [ ] `src/components/dashboard/dashboard-context.tsx`
- [ ] `src/components/dashboard/dashboard-layout.tsx`
- [ ] `src/components/dashboard/dashboard-shell-layout.tsx`
- [ ] `src/components/dashboard/sidebar.tsx`
- [ ] `src/components/dashboard/user-profile-menu.tsx`
- [ ] `src/components/department/department-detail-page.tsx`
- [ ] `src/components/departments/department-walkthrough.tsx`
- [ ] `src/components/departments/departments-client.tsx`
- [ ] `src/components/departments/departments-layout.tsx`
- [ ] `src/components/departments/departments-shell-layout.tsx`
- [ ] `src/components/departments/departments-sidebar.tsx`
- [ ] `src/components/docs/help-center.tsx`
- [ ] `src/components/inbox/inbox-page.tsx`
- [ ] `src/components/inbox/join-request-item.tsx`
- [ ] `src/components/invites/invite-by-email-modal.tsx`
- [ ] `src/components/modules/modules-page.tsx`
- [ ] `src/components/platform/create-tenant-modal.tsx`
- [ ] `src/components/platform/invite-member-dialog.tsx`
- [ ] `src/components/platform/platform-administrators.tsx`
- [ ] `src/components/platform/platform-profile-page.tsx`
- [ ] `src/components/platform/tenant-manage-client.tsx`
- [ ] `src/components/profile/profile-stats-page.tsx`
- [ ] `src/components/projects/project-members-modal.tsx`
- [ ] `src/components/projects/project-modal.tsx`
- [ ] `src/components/projects/project-profile-page.tsx`
- [ ] `src/components/projects/projects-list-page.tsx`
- [ ] `src/components/providers/user-hydrator.tsx`
- [ ] `src/components/settings/assignment-settings-page.tsx`
- [ ] `src/components/settings/member-config-panel.tsx`
- [ ] `src/components/settings/settings-appearance-page.tsx`
- [ ] `src/components/settings/settings-departments-page.tsx`
- [ ] `src/components/settings/settings-intake-forms-page.tsx`
- [ ] `src/components/settings/settings-layout.tsx`
- [ ] `src/components/settings/settings-members-page.tsx`
- [ ] `src/components/settings/settings-nav.ts`
- [ ] `src/components/settings/settings-profile-page.tsx`
- [ ] `src/components/settings/settings-routing-rules-page.tsx`
- [ ] `src/components/settings/settings-sla-page.tsx`
- [ ] `src/components/settings/settings-sub-departments-page.tsx`
- [ ] `src/components/sub-departments/sub-department-about.tsx`
- [ ] `src/components/support/intake-chat.tsx`
- [ ] `src/components/tasks/all-tasks-page.tsx`
- [ ] `src/components/tasks/tasks-page.tsx`
- [ ] `src/components/tickets/bulk-assign-modal.tsx`
- [ ] `src/components/tickets/customer-reply.tsx`
- [ ] `src/components/tickets/new-ticket-modal.tsx`
- [ ] `src/components/tickets/ticket-access-denied.tsx`
- [ ] `src/components/tickets/ticket-detail-page.tsx`
- [ ] `src/components/ui/date-range-dropdown.tsx`
- [ ] `src/components/ui/editor-context-menu.tsx`
- [ ] `src/components/ui/editor-selection-menu.tsx`
- [ ] `src/components/ui/input-otp.tsx`
- [ ] `src/components/ui/insert-table-popover.tsx`
- [ ] `src/components/ui/table.tsx`
- [ ] `src/components/ui/text-color-popover.tsx`
- [ ] `src/components/ui/user-avatar.tsx`
- [ ] `src/hooks/use-permissions.ts`
- [ ] `src/lib/activity-access.ts`
- [ ] `src/lib/activity-feed-data.ts`
- [ ] `src/lib/activity-scope.ts`
- [ ] `src/lib/agreements.ts`
- [ ] `src/lib/api/admin.ts`
- [ ] `src/lib/api/mentions.ts`
- [ ] `src/lib/api/projects.ts`
- [ ] `src/lib/api/reports.ts`
- [ ] `src/lib/api/sub-departments.ts`
- [ ] `src/lib/api/tasks.ts`
- [ ] `src/lib/assignment-engine.ts`
- [ ] `src/lib/auth.ts`
- [ ] `src/lib/auth/complete-login.ts`
- [ ] `src/lib/auth/post-login-redirect.ts`
- [ ] `src/lib/auth/send-login-code.ts`
- [ ] `src/lib/dashboard-layout-data.ts`
- [ ] `src/lib/db.ts`
- [ ] `src/lib/department-setup.ts`
- [ ] `src/lib/dept-scope.ts`
- [ ] `src/lib/email-templates/_shared.ts`
- [ ] `src/lib/email-templates/defaults.ts`
- [ ] `src/lib/email-templates/invite.ts`
- [ ] `src/lib/email-templates/screening-invite.ts`
- [ ] `src/lib/email.ts`
- [ ] `src/lib/exports/reports-export-doc.ts`
- [ ] `src/lib/intake-conversion.ts`
- [ ] `src/lib/invites/accept-department-invite.ts`
- [ ] `src/lib/invites/accept-tenant-invite.ts`
- [ ] `src/lib/mailbox-connection.ts`
- [ ] `src/lib/mailbox-ticket-creation.ts`
- [ ] `src/lib/mcp/recruitment-tools.ts`
- [ ] `src/lib/mentionable-users.ts`
- [ ] `src/lib/notification-scope.ts`
- [ ] `src/lib/notify-customer-reply.ts`
- [ ] `src/lib/notify-quarantined-reply.ts`
- [ ] `src/lib/prisma-scope.ts`
- [ ] `src/lib/process-inbound-email.ts`
- [ ] `src/lib/profile-stats.ts`
- [ ] `src/lib/profile.ts`
- [ ] `src/lib/project-assets.ts`
- [ ] `src/lib/project-department-people.ts`
- [ ] `src/lib/project-details-data.ts`
- [ ] `src/lib/project-permissions.ts`
- [ ] `src/lib/projects-list-data.ts`
- [ ] `src/lib/realtime.ts`
- [ ] `src/lib/reconcile-profile-on-login.ts`
- [ ] `src/lib/recruitment-cv.ts`
- [ ] `src/lib/reporting/report-scope.ts`
- [ ] `src/lib/request-scope.ts`
- [ ] `src/lib/rls-guc.ts`
- [ ] `src/lib/role-assignment.ts`
- [ ] `src/lib/rota.ts`
- [ ] `src/lib/screening/questions.ts`
- [ ] `src/lib/screening/reject-email.ts`
- [ ] `src/lib/screening/scoring.ts`
- [ ] `src/lib/sla-engine.ts`
- [ ] `src/lib/sub-department-access.ts`
- [ ] `src/lib/sub-department-manage.ts`
- [ ] `src/lib/support-project.ts`
- [ ] `src/lib/task-list-query.ts`
- [ ] `src/lib/tasks-data.ts`
- [ ] `src/lib/template-catalogue.ts`
- [ ] `src/lib/tenant-lifecycle.ts`
- [ ] `src/lib/tenant-membership.ts`
- [ ] `src/lib/tenant-scope.ts`
- [ ] `src/lib/ticket-completion-notify.ts`
- [ ] `src/lib/ticket-date-permissions.ts`
- [ ] `src/lib/ticket-datetime.ts`
- [ ] `src/lib/ticket-detail-data.ts`
- [ ] `src/lib/ticket-detail-placeholder.ts`
- [ ] `src/lib/ticket-transfer.ts`
- [ ] `src/store/use-auth-store.ts`
