# Project structure and role implementation audit

Date: 2026-09-07. Scope: repository-wide structural scan and targeted source inspection of role, identity, access, database, and client-state paths. This is a static audit, not a claim that every endpoint was executed or every file reviewed line by line. No shared-database writes, application changes, or live permission tests were performed. The September 6 account snapshot has not been revalidated.

## Conclusion

The original diagnosis remains supported by the source: profile edits and department manager grants are independent, while login derives the highest role from several legacy tables. The implementation plan needed additional work for client hydration, identity recovery, database functions, transaction boundaries, access-grant semantics, and service credentials.

Keep the incremental canonical-assignment approach. Fix the existing mutation and display paths first; do not make a full schema cutover a prerequisite for correcting one account.

## Structure reviewed

| Area | Structure and role relevance |
| --- | --- |
| Application entry | `src/proxy.ts`, login/auth/onboarding/invite routes; identity and tenant landing |
| Authenticated pages | `src/app/(dashboard)`, `src/app/departments`, `src/app/platform`; layouts and server page gates |
| API | 256 `route.ts` files under `src/app/api` at scan time; admin, operational, public intake, service-key, webhook, cron families |
| UI | `src/components`, `src/hooks`, `src/store`; editors, navigation, permission mirrors, realtime, hydration |
| Domain/data layer | `src/lib`; profile, role resolution, scope enforcement, assignments, reporting, integrations |
| Database | `prisma/schema.prisma`, migrations, three seed files; role tables, SQL identity functions, RLS history |
| Operations | `scripts`, `vercel.json`, Prisma configuration; imports, maintenance, eight configured cron routes |
| Verification | 119 `*.test.ts` files under `src` at scan time; Vitest Node environment, mocked suites and opt-in DB recovery integration test |
| Other roots | `docs`, `public`, root SQL/setup/config files; historical contracts and Supabase configuration. Generated client, dependencies, build artifacts, and scratch data are not editable source targets |

The candidate scan is recorded in [role-callers.md](role-callers.md). Text matches include non-authorization uses such as HTML/AI roles; they are discovery candidates, not confirmed defects.

## Findings and required changes

| Priority | Source evidence | Implementation consequence |
| --- | --- | --- |
| P0 | `src/app/api/admin/users/[id]/route.ts` writes profile role and all of the user's sub-department roles, with swallowed sync failures | Scope the replacement; preserve other tenants/departments; move all affected writes and audit into one transaction |
| P0 | `src/lib/tenant-membership.ts` upserts manager assignments without reconciling old ones | Separate membership addition from explicit grant replacement; do not turn a narrower role selection into an incomplete demotion |
| P0 | `src/app/api/admin/sub-departments/[id]/members/route.ts` accepts role strings using `any`/generic records | Validate allowed role/scope pairs and actor authority on before/after roles before database writes |
| P0 | `src/lib/audit-log.ts` uses global Prisma; `AuditEvent.tenantId` is required | Add transaction-client support before promising atomic audit. Define platform audit representation without inventing a tenant |
| P0 | `src/lib/role-assignment.ts` derives legacy rows before starting the replacement transaction; in-flight map only deduplicates within one process | Lock and derive inside the same transaction for interim sync; cover read-triggered rebuilds as well as editors. Old snapshots must not overwrite a committed demotion |
| P1 | `src/components/providers/user-hydrator.tsx` uses an empty dependency array when copying props to Zustand | Make resolved role/scope changes update client state after refresh; test without remounting the hydrator |
| P1 | `src/app/api/session/status/route.ts` returns only `ok`; realtime fallback handles logout | Add a role revision/profile refresh path. An active account's demotion is not an authentication failure |
| P1 | `src/lib/profile.ts` combines assignments across memberships before deriving one global role | Resolve capabilities against the actual resource and active tenant. Current `departmentAdminIds` already filters Admin correctly; do not follow the stale hierarchy note claiming it collapses both |
| P1 | `src/lib/profile.ts` catches relation-load failures as empty arrays | Distinguish no grants from database failure. Fail closed with a recoverable error rather than silently displaying an inferred Agent role |
| P1 | `src/lib/project-permissions.ts` treats any Sub-manager membership as project leadership; `src/lib/sub-department-manage.ts` ends with a membership-only fallback | Replace global/membership-only capability shortcuts with role checks at the target resource. Surrounding route guards may mitigate individual paths; this audit does not assert every caller is exploitable |
| P1 | `src/lib/reconcile-profile-on-login.ts` restores profiles and migrates auth IDs; its FK move list omits canonical assignments and tenant/direct memberships | Define identity restoration policy, transfer all intended relations transactionally, and prevent stale privilege resurrection or cascade loss |
| P1 | SQL migrations define `migrate_profile_auth_id`/auth profile handling separately from TypeScript | Inspect deployed function definitions read-only before implementation; migrate SQL writers too. Historical migration text alone does not establish live function state |
| P1 | `src/lib/api-key-auth.ts` validates key revocation/scope independently of creator roles; department-less keys use system scope | Decide whether keys are delegated user credentials or independent service credentials before changing demotion behavior; do not silently attach cookie-based profile logic to MCP/V1 |
| P1 | `src/lib/db.ts` defaults to one pooled connection; Prisma scope resolution lazily calls `getProfile` and assignment resolution | Resolve authorization context before entering the transaction and use its transaction client throughout. Test against pool size one to catch nested checkout stalls and recursion |

## Access that must remain separate from roles

`DepartmentAccess` contains `fullAccess` and expiry; `ProjectMember` grants project relationships; `TicketAccessGrant` and ticket participation are explicit ticket access paths. `auth.ts`, `cross-access.ts`, `dept-scope.ts`, and `prisma-scope.ts` combine these with roles. A department Agent assignment cannot safely stand in for every limited/expiring access grant.

One role per exact scope applies to role assignments, not all reasons for access. Preserve direct membership separately when resolving a duplicate department Agent/Manager row: dropping membership merely because Manager currently dominates would change what happens after Manager revocation. Backfill must retain access provenance or leave membership/access tables as separate canonical sources for their own semantics.

Account, tenant, and direct sub-department deactivation are not interchangeable. An inactive direct sub-department membership should suppress that direct grant; it must not automatically veto an independently valid inherited tenant Admin grant unless the product explicitly defines deny overrides.

Keep list filtering and detail/edit checks consistent, including drafts, project participants, co-assignees, per-ticket grants, full/limited cross-access, reports, exports, attachments, and search. A passing role badge test does not prove correct data access.

## Concrete work areas

| Group | Files/families | Required treatment |
| --- | --- | --- |
| Profile/role service | `src/lib/profile.ts`, `role-assignment.ts`, `auth.ts`, `tenant-membership.ts`, `audit-log.ts` | Transaction service, canonical resolver, scoped capability response |
| Membership writers | `src/app/api/admin/users/[id]/route.ts`; `admin/departments/[id]/{managers,direct-members,access,members}`; `admin/sub-departments/[id]/members`; `admin/tenants/[id]/members`; `admin/super-admins` | Migrate mutation handlers, including nested user-ID routes; preserve non-role metadata handlers |
| Join/invite writers | `src/lib/invites/accept-department-invite.ts`, `accept-tenant-invite.ts`; API `join-requests/[id]`, `departments/[id]/join-requests/[requestId]`, `sub-departments/[id]/join-requests/[requestId]`; admin invite routes | Validate pending invitations at acceptance; role scope must survive serialized invitation payloads |
| Lifecycle | `reconcile-profile-on-login.ts`, `tenant-lifecycle.ts`; admin department/sub-department deletion; auth SQL functions; seed files | Restore/revoke/move behavior, cascades, platform grants, historical identity links |
| Data boundaries | `dept-scope.ts`, `prisma-scope.ts`, `request-scope.ts`, `tenant-scope.ts`, `cross-access.ts`, `ticket-date-permissions.ts`, `project-permissions.ts`, `sub-department-manage.ts` | Unified capabilities plus separately preserved visibility grants |
| UI state | `store/use-auth-store.ts`, `components/providers/user-hydrator.tsx`, `hooks/use-permissions.ts`; dashboard/departments/platform layouts and settings editors | Scope IDs/capabilities in DTO, reactive hydration, consistent member and profile labels |
| Realtime/session | `components/realtime/notifications-realtime.tsx`, `lib/realtime.ts`, `lib/realtime-broadcast.ts`, `api/session/status/route.ts` | Revision refresh with fallback; distinguish role update from force logout |
| Service paths | `api-key-auth.ts`, `lib/mcp`, `api/mcp`, `api/v1`, public support/intake, webhook and cron handlers | Explicit service authority; no accidental loss of legitimate system scope or user-scope bypass |
| Operational consumers | `assignment-engine.ts`, `ticket-completion-notify.ts`, `notify-customer-reply.ts`, `notify-quarantined-reply.ts`, `notification-scope.ts`, `lib/reporting`, `bulk-reassign.ts` | Correct recipients and job authorization after grant changes; fake email transports in tests |

Ordinary profile avatar/preferences updates are not role mutations despite matching a broad model-write search. `department-setup.ts` updates walkthrough metadata. Do not funnel unrelated edits through the role service just because the table matches.

## Verification limits and recommended tests

This documentation audit did not run the application test suite or validate live DB function definitions. No browser authentication was performed. Deployment guarantees depend on the implementation and isolated integration checks.

Extend existing `role-assignment.test.ts`, `auth*.test.ts`, `dept-scope*.test.ts`, `prisma-scope.test.ts`, `project-permissions.test.ts`, `ticket-date-permissions.test.ts`, manager route tests, and session status tests. Add new transaction/identity/concurrency integration tests with an explicit disposable database URL and a guard rejecting the shared database. Do not repurpose the opt-in live connection-recovery test as an authorization fixture harness.

For client hydration, the current Vitest config uses Node. Add the minimal appropriate component/browser harness or perform a documented browser regression; a Node-only pure function test cannot establish that a mounted hydrator updates correctly.

`rls-guc.ts` documents that the app uses an owner connection bypassing RLS. Do not assume adding SQL constraints makes row-level authorization automatic, and do not combine a switch to `app_rls_user` with this role fix. Verify deployed connection/policy state separately when planning that cutover.
