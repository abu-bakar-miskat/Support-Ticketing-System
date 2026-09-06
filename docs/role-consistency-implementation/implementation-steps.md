# Role consistency: implementation steps

Date: 2026-09-07  
Status: Steps 1–2 complete; revised after the 2026-09-07 structural and role-path audit.  
Audit findings and file map: [project-audit.md](project-audit.md)  
Repository-wide discovery inventory: [role-callers.md](role-callers.md)  
Design: [Role consistency redesign plan](../role-consistency-redesign-plan.md)  
Authorization contract: [Role hierarchy](../role-hierarchy.md)

## Objective

Make role changes, login labels, and server permissions agree. Complete the existing `RoleAssignment` design as the authoritative role store while preserving legitimate roles in different departments and tenants.

This document is an execution checklist, not a record of completed changes. The account repair and database operations described here have not been performed.

## Delivery order

| Delivery | Steps | Result |
| --- | --- | --- |
| 1. Stabilize existing behavior | 1–4 | Reproducible regression, transactional role changes, targeted repair |
| 2. Prepare canonical storage | 5–6 | Additive schema, validated backfill, compatible running application |
| 3. Migrate application behavior | 7–9 | All writers centralized; scoped permissions and consistent UI ready |
| 4. Activate and verify | 10–11 | Coordinated cutover and verified live behavior |
| 5. Remove compatibility code | 12 | One authority with obsolete storage retired separately |

Deliver each group as a reviewable change. Steps 7–9 can be developed before activation, but must not independently switch production to a partially migrated authorization model.

## Step 1 — Inventory every role reader and writer

The initial structural scan and targeted audit are complete. Use the linked inventory as the baseline; the checkboxes below are the implementation team's classification and closure checks, not a requirement to repeat discovery from scratch. Static inspection cannot guarantee runtime correctness.

- [x] Read applicable `AGENTS.md` instructions. Before changing Next.js code, read the relevant installed guides in `node_modules/next/dist/docs/`.
- [x] Locate all reads/writes of `Profile.role`, `Profile.isSuperAdmin`, `TenantMembership.role`, `DepartmentManager`, `SubDepartmentMembership.role`, and `RoleAssignment` using `rg`.
- [x] Include invitations, join approvals, tenant membership changes, account removal/reactivation, seeds, imports, integrations, background jobs, and API-key consumers.
- [x] Record each caller's file, scope, current role source, mutation behavior, and intended replacement in a companion `role-callers.md` in this folder.
- [x] Identify authorization/profile caches and how existing browser sessions refresh role state.
- [x] Document direct department access, expiry, tenant suspension, and sub-department activity semantics. Preserve business metadata such as nickname, assignment availability, and walkthrough state.

Start with `src/lib/profile.ts`, `src/lib/role-assignment.ts`, `src/lib/tenant-membership.ts`, `src/lib/dept-scope.ts`, `src/lib/prisma-scope.ts`, and `src/app/api/admin/users/[id]/route.ts`.

Done when: every supported role mutation has an identified owner and every authorization consumer has a migration destination.

## Step 2 — Reproduce the defect using isolated fixtures

- [x] Add a fixture with profile/sub-department role `sub_manager` and a department Manager assignment, matching the incident's structure.
- [x] Demonstrate that current login resolution returns `manager` and that a profile-only edit does not remove the manager grant.
- [x] Add regression cases for an explicit Manager-to-Sub-manager conversion and for retaining an unrelated Manager assignment in another department.
- [x] Add tenant-isolation, department Admin-versus-Manager, and old-session-after-demotion cases.
- [x] Use an isolated test database for writes; do not use the shared user's account as a test fixture. The fixture suite is in-memory and performs no database writes.

Done when: tests distinguish a broken demotion from valid multiple scoped roles.

## Step 3 — Centralize transactional role changes using existing tables

Audit additions required in this delivery:

- [ ] Refactor `recordAuditEvent` to accept the transaction client. For platform grants, define an audit representation that does not require a fabricated tenant; the existing `AuditEvent` model requires `tenantId`.
- [ ] Lock before reading legacy grants and keep derivation plus replacement inside the same transaction. Update the read-triggered rebuild to follow this rule too; its current process-local promise map is not a cross-instance lock.
- [ ] Establish a validated explicit request scope before opening the transaction to avoid lazy profile resolution checking out another connection. Test with `DB_POOL_MAX=1` and recovery retries.
- [ ] Validate role/scope pairs in the sub-department membership POST/PATCH routes; remove unchecked role casts. Validate both previous and requested privilege levels.
- [ ] Recheck actor authority at commit under a defined concurrency strategy so concurrent actor demotion cannot authorize a stale administrative change. Use deterministic lock order where multiple identities are locked.

Proposed implementation: `src/lib/role-management.ts` with focused tests beside it.

- [ ] Define explicit operations: grant, replace at the same scope, revoke, and convert between named scopes.
- [ ] Require target user, tenant, scope identifiers, actor, and an expected state/revision. Resolve parent relationships on the server.
- [ ] Validate the actor's authority for every revoked and added assignment, including the before-state role. Prevent managers from replacing Admin grants.
- [ ] Implement a pure before/after preview showing removed grants, added grants, and retained broader access.
- [ ] Apply legacy-table changes, canonical synchronization, and audit recording inside one transaction using the same transaction client.
- [ ] Refactor synchronization helpers to accept that transaction client; do not call a global-client rebuild from inside the transaction.
- [ ] Serialize competing changes using an existing stable user-row lock initially, or an authorization revision introduced with an additive migration. Reject stale previews.
- [ ] Remove swallowed role-sync errors; a synchronization/audit failure must roll back the mutation.
- [ ] Refresh client/profile state after commit. Server requests must enforce the change even if the refresh event fails.
- [ ] Route the general user-role editor through this service first. Replace ambiguous global-role edits with explicit scope operations.

During this delivery, legacy tables remain authoritative. Do not change the global precedence rule to hide the stale grant.

Done when: converting a Manager to Sub-manager removes exactly the requested manager grant atomically and preserves unrelated grants.

## Step 4 — Repair the affected account through the reviewed workflow

- [ ] Re-read `mohammed.sifat@penglobalbd.com`; the September 6 database snapshot may have changed.
- [ ] Resolve the names and parent relationships of the recorded department and sub-department; inspect available audit history.
- [ ] Prepare a concrete preview for the obsolete manager assignment identified in the design plan. If intent remains ambiguous across scopes, resolve that ambiguity before revoking access.
- [ ] Inspect tenant roles and direct department access for remaining broader permissions.
- [ ] Execute only the intended correction through the Step 3 service, checking the preview's expected state and saving the audit before-image.
- [ ] Verify the resulting assignments, fresh-session label, existing-session permissions, and denial of manager-only actions outside the intended scope.

Done when: the account has the intended scoped access, with a recorded change and no unrelated membership loss. Do not complete real tickets or trigger completion emails to verify it.

## Step 5 — Add canonical schema fields without breaking existing instances

- [ ] Preserve mapped physical names: Prisma SubDepartment is SQL `Team`, SubDepartmentMembership is `TeamMembership`, and subDepartmentId often maps to `teamId`. Generate SQL against physical names.
- [ ] Specify role-versus-membership provenance before adding uniqueness. A direct department member who is also Manager must retain the intended baseline membership when Manager is later revoked.
- [ ] Keep limited/expiring `DepartmentAccess`, `ProjectMember`, and `TicketAccessGrant` outside the role uniqueness rule. Canonical roles must not flatten these into unrestricted department Agent grants.
- [ ] Define inactive direct membership separately from inherited access; do not make it an implicit deny override on tenant Admin authority.

Target files: `prisma/schema.prisma` and a new reviewed `prisma/migrations/<timestamp>_role_assignment_scope_integrity/migration.sql`.

- [ ] Add explicit tenant, department, and sub-department relation fields to `RoleAssignment`, initially nullable for existing rows and legacy writers.
- [ ] Add attribution/timestamp fields and an authorization revision if the concurrency design uses one. Preserve unknown historical actors as unknown.
- [ ] Define composite parent keys/foreign keys that prevent a department or sub-department from being assigned under the wrong tenant.
- [ ] Prepare scope-shape and role/scope checks using the design's allowed-role matrix.
- [ ] Prepare partial unique indexes enforcing one assignment per user at each exact scope, excluding role from the uniqueness key. Give the platform scope its own uniqueness rule.
- [ ] Keep compatibility `scopeId` until all readers/writers migrate. Define and test its mapping to the new fields.
- [ ] Stage strict constraint activation separately if existing data or legacy writers cannot satisfy it yet. Do not enforce the final role matrix while the legacy rebuild still emits tenant Agent/Manager/Sub-manager rows.
- [ ] Test both old-compatible and new code against the expanded schema in an isolated database.

Shared database procedure for every schema change:

1. Generate SQL with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` and save it in the migration directory.
2. Review all SQL, including custom indexes/checks. Remove unrelated migration drift and destructive statements outside this change.
3. Apply the reviewed file with `npx prisma db execute --file <migration.sql>`.
4. Record it with `npx prisma migrate resolve --applied <migration-directory-name>`.
5. Run `npx prisma generate` and relevant checks.

Never run `prisma migrate dev` or `prisma migrate reset` against the shared database. Apply required schema changes before merging/deploying dependent code, as required by `AGENTS.md`.

Done when: the additive migration is applied and recorded, and running compatible instances continue working.

## Step 6 — Build reconciliation and repeatable backfill

Proposed deliverables: a read-only report script and a separate backfill script in `scripts/`, plus a migration report in this folder.

- [ ] Compare legacy grants, canonical rows, and effective permissions per user and scope.
- [ ] Flag same-scope duplicates, missing parent objects, mismatched ancestry, inactive memberships with grants, and unsupported tenant-role encodings.
- [ ] Map tenant membership separately from privileges. Map Manager to known department grants and Sub-manager to known sub-department grants; queue missing scopes for resolution.
- [ ] Preserve legitimate assignments in different scopes. Do not automatically resolve every mismatch by selecting the highest role or by deleting lower roles.
- [ ] Backfill in bounded, idempotent batches with checkpoints and before/after counts.
- [ ] Coordinate with the legacy rebuild: either teach it to preserve/populate compatible new fields, or backfill a staging dataset and perform the final transfer during cutover. It must not silently erase backfilled fields.
- [ ] Run a second pass proving no duplicate creation or unintended permission changes.
- [ ] Keep unresolved records in the report and block activation for affected migration scope until resolved.

Done when: the backfill is repeatable, mappings are explicit, and all permission differences are explained.

## Step 7 — Route all writers through the shared service

- [ ] Include `reconcile-profile-on-login.ts` and deployed SQL auth/identity functions. Move all intended identity relations atomically, including tenant/direct membership and role assignments; test restore without resurrecting revoked privileges.
- [ ] Inspect deployed `migrate_profile_auth_id` and profile-creation trigger definitions read-only before writing additive replacement migrations. Do not edit old applied migration files.
- [ ] Update pending tenant-invite payloads to carry actual sub-department scope, with an explicit compatibility strategy for old tokens that carry only department IDs.
- [ ] Audit department/sub-department move and delete paths: update ancestry or revoke dependent assignments atomically and preserve audit history.
- [ ] Classify profile metadata and walkthrough updates as non-role writes; preserve their current business behavior.

- [ ] Migrate every writer from Step 1, including invitations accepted after deployment and automated/background callers.
- [ ] Ensure tenant membership addition does not create an implicit tenant-wide Manager role.
- [ ] Require an actual sub-department for Sub-manager assignment.
- [ ] Define revoke, deactivate, tenant removal, and rejoin behavior so old grants cannot silently return.
- [ ] Add a coordinated authority mode: legacy authority before activation; canonical authority afterward, with legacy values maintained only as compatibility projections.
- [ ] Prevent the two modes from running concurrently across deployed instances during activation.
- [ ] Search again for direct role writes and document any remaining compatibility-only writes.

Done when: all supported mutations use the transaction service and respect one active authority mode.

## Step 8 — Implement canonical scoped authorization

- [ ] Replace membership-only/global shortcuts in `sub-department-manage.ts` and `project-permissions.ts` with resource-aware checks. Preserve the already-correct department Admin subset in `profile.ts`.
- [ ] Remove empty-array fallbacks for failed authorization queries in `profile.ts`; distinguish an unavailable grant source from a successful query with no grants.
- [ ] Validate visibility and edit parity for drafts, assignees/co-assignees, explicit ticket grants, project membership, cross-access, attachments, search, reporting, and exports.
- [ ] Decide and document the API-key model before changing it: delegated keys track creator authority; independent service keys use explicit service grants/revocation. Preserve MCP/V1 contract compatibility and evaluate department-less system keys explicitly.
- [ ] Define queued-job behavior after creator demotion for bulk reassignment, report exports, and scheduled reports. Revalidate delegated authority at execution/download; preserve explicit system-job authority where intended.
- [ ] Keep the RLS connection-role switch separate. Existing GUC helpers do not make owner-connection queries subject to row-level policies.

- [ ] Build a read-only assignment resolver with active-user, tenant-status, membership, expiry, and resource-ancestry gates.
- [ ] Preserve tenant Admin inheritance, department Admin/Manager boundaries, Sub-manager scope, and documented Super Admin entered-tenant behavior.
- [ ] Replace global `profile.role` permission gates with resource-specific checks.
- [ ] Migrate `getProfile`, route authorization, Prisma scoping, assignment routing, notification recipient lookup, jobs, and API-key access.
- [ ] Keep display summaries informational; never use a role from tenant A to authorize tenant B.
- [ ] Shadow-compare old and new decisions without granting access based on the new result. Record sanitized mismatch diagnostics.
- [ ] Cover allow and deny cases, including retained direct parent-department visibility and department Admin privileges.

Done when: representative permission comparisons match intended policy, and canonical authorization reads perform no writes.

## Step 9 — Align role editors and login display

- [ ] Update `UserHydrator` when resolved props change; the current mount-only effect leaves Zustand stale on refresh. Extend the store/hydrator DTO with scope and capability/revision information needed by consumers.
- [ ] Extend session status or a profile endpoint to report authorization revision. Refresh on revision change with realtime as an accelerator and polling as fallback; reserve logout for invalid sessions.
- [ ] Verify changed roles in a mounted dashboard, departments shell, and platform shell, not only after signing out and back in. Test scope switches and cross-tab updates.

Start with the dashboard user profile menu, settings members page, department detail page, sub-department settings, and platform tenant member editor.

- [ ] Show the role for the selected scope and list other assignments separately.
- [ ] Show a clear multiple-role summary when no scope is selected.
- [ ] Use the shared preview to distinguish adding Sub-manager access from replacing a department Manager grant.
- [ ] Show any retained broader access before saving a demotion.
- [ ] Consume the server's resolved assignments consistently in settings, profile, and login state.
- [ ] Refresh authorization state after successful mutation and tenant/scope switching.
- [ ] Verify stale-preview conflicts are visible and do not overwrite another administrator's update.

Done when: editors and logged-in views explain the same assignments and the server enforces them.

## Step 10 — Activate canonical authority in a coordinated release

- [ ] Rehearse activation and rollback with isolated fixtures, including concurrent edits and an old application worker.
- [ ] Confirm all new schema dependencies exist in the shared database and migrations are recorded.
- [ ] Drain incompatible instances/workers and briefly coordinate role writes during final reconciliation.
- [ ] Run the final backfill and resolve outstanding mismatches.
- [ ] Disable legacy read-time rebuilding before it can overwrite canonical writes.
- [ ] Validate/activate final scope checks and uniqueness constraints only after legacy-invalid rows are removed or mapped.
- [ ] Enable canonical writers and readers together, keeping legacy projections current during the rollback window.
- [ ] Refresh cached authorization state and resume role changes.

Done when: no running instance can recreate a revoked role from stale legacy records.

## Step 11 — Verify release behavior

- [ ] Add isolated integration coverage for stale rebuild versus demotion, identity-ID replacement, same-ID restore, invitation replay, and scope deletion/moves.
- [ ] Require a disposable test database explicitly; guard against loading the shared `.env` database for mutation tests. Existing opt-in live recovery tests are not an authorization harness.
- [ ] Add a component/browser check for mounted hydration and role refresh; current Vitest Node configuration alone does not exercise that behavior.
- [ ] Use stubbed notification/email delivery for recipient-routing tests. Never trigger live ticket-completion messages.
- [ ] Close every relevant item in `role-callers.md` with its replacement/test or an explicit no-change reason; retain false-positive exclusions for review.

- [ ] Run focused unit/integration suites, typecheck, lint, and other required repository checks.
- [ ] Verify same-scope replacement, cross-scope conversion, unrelated-role preservation, tenant isolation, and Admin/Manager separation.
- [ ] Verify concurrent edits reject stale state and injected audit/projection failures roll back everything.
- [ ] Verify invalid scope shapes, duplicate assignments, and mismatched ancestry are rejected by database constraints.
- [ ] Verify suspended/inactive/expired access and existing sessions after demotion.
- [ ] Verify invitations, approvals, imports, and jobs use canonical roles.
- [ ] Confirm ordinary authorization reads cause zero assignment rebuilds.
- [ ] Observe authorization errors, mismatch diagnostics, role-change failures, and database latency through a representative operational period. Record the observation period and results.

Done when: all regression scenarios pass and live observations show no unresolved permission mismatch.

## Step 12 — Retire compatibility storage in a separate release

- [ ] Confirm zero authorization dependencies on legacy role columns and `Profile.isSuperAdmin` before retiring their compatibility roles.
- [ ] Move DepartmentManager operational metadata to an appropriate retained model.
- [ ] Preserve membership/activity/availability data and DepartmentAccess expiry/access-level semantics.
- [ ] Remove obsolete read-time rebuild code and direct role writers.
- [ ] Remove deprecated columns/tables only after the rollback window closes and dependent reports/integrations are migrated.
- [ ] Ship and apply a separately reviewed cleanup migration. Update schema documentation and the caller inventory.

Done when: scoped assignments are the only authority for role privileges, and independent duplicate role edits are impossible through supported application paths.

## Rollback rules

- Keep account-repair before-images, migration checkpoints, audit events, and compatible legacy projections.
- Roll back only to an application version that understands the expanded schema and the current authority mode.
- Never reactivate a legacy rebuild that could restore revoked privileges. Prefer a corrective forward release if rollback would expand access.
- Do not restore the shared database wholesale to undo this work; use narrowly scoped, reviewed corrective operations.

## Final acceptance checklist

- [ ] The affected user has the intended role at each scope.
- [ ] Role edits and login labels agree with server permissions.
- [ ] One role per user per exact scope is enforced, while different scoped roles remain supported.
- [ ] Every supported writer uses the audited transaction service.
- [ ] Demotions apply to the next protected server request.
- [ ] Authorization reads do not mutate role records.
- [ ] Migrations, validation results, release observations, and rollback compatibility are documented.
