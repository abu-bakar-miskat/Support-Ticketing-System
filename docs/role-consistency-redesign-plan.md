# Role consistency and database redesign plan

Date: 2026-09-06  
Status: Proposed implementation plan; no application or database changes applied.

Updated implementation guidance: the [September 7 project audit](role-consistency-implementation/project-audit.md) and [revised implementation steps](role-consistency-implementation/implementation-steps.md) refine this proposal. Follow their corrections for transaction-safe rebuilds, membership/access provenance, identity recovery, platform audit storage, service credentials, and reactive client hydration. Inactive direct membership does not automatically override an independent inherited Admin grant.

## Recommendation

Fix the role-update workflow immediately, then complete the existing `RoleAssignment` migration so it becomes the only authority for roles. A complete database rebuild is unnecessary. The durable solution is one authoritative set of scoped assignments, transactional updates, and permission checks against the resource being accessed.

A user can legitimately be a Manager in one department and a Sub-manager in another. Do not enforce one role per user globally. Instead, enforce one role per user at each exact scope and show the scope beside the role in the interface.

This follows the product contract in [role-hierarchy.md](role-hierarchy.md). Tenant membership means belonging to a tenant; it must not implicitly grant operational manager powers.

## 1. Confirmed incident and cause

Read-only inspection of the shared database found these records for `mohammed.sifat@penglobalbd.com`:

| Record | Stored value |
| --- | --- |
| User ID | `cab658f7-31d2-40bb-aa8c-651d640196af` |
| `Profile.role` | `sub_manager` |
| Active `TenantMembership.role` | `agent` |
| Active `TeamMembership.role` (Prisma: `SubDepartmentMembership`) | `sub_manager` |
| `DepartmentManager.role` | `manager` |
| Manager assignment ID | `cmtlophpg000104iecjwc6ryz` |
| Manager department ID | `cmtk1qlyn0006ejjxe48p07dk` |
| Sub-department ID | `cmtlc7ztz000gvdjxaxjoqec7` |
| Manager assignment created | September 3, 2026 |

`getProfile()` in `src/lib/profile.ts` assembles assignments from membership tables and replaces the stored profile role with `deriveEffectiveRole(...)`. That function in `src/lib/role-assignment.ts` prioritizes department Manager over Sub-manager. Consequently, login resolves this account to Manager.

The general user PATCH endpoint in `src/app/api/admin/users/[id]/route.ts` changes `Profile.role` and sub-department membership roles, but does not reconcile `DepartmentManager` or tenant roles. It also suppresses sub-department synchronization failures. `applyTenantMembership()` in `src/lib/tenant-membership.ts` creates/upserts memberships without removing obsolete manager assignments.

These are confirmed paths that permit inconsistent records. The inspection did not establish which historical operation produced this particular combination; consult audit history before attributing it to a specific edit or actor.

`RoleAssignment` already exists, but `syncUserRoleAssignments()` rebuilds it from legacy tables during scope resolution. Editing only its rows would therefore be undone on a later read.

## 2. Immediate account correction

Deliver as a narrowly scoped repair, independently of the redesign:

1. Re-read this user's assignments and resolve department/sub-department names and parent relationships. Review the role-change audit history. Confirm which scopes the intended Sub-manager role covers.
2. Prepare a before/after preview identifying the exact manager assignment to revoke. Preserve unrelated assignments and tenant membership. If the Manager assignment is intentional in another department, correct the contextual display instead of deleting legitimate access.
3. For the intended demotion, use one transaction to remove the identified obsolete `DepartmentManager` row, preserve the intended active Sub-manager membership, reconcile affected compatibility values, refresh canonical assignments, and record the audit event. Check that the previewed records have not changed before committing.
4. Check all remaining grants, including tenant Admin/Manager and direct department membership/access. The latter can still grant visibility across a department even when the role badge says Sub-manager; only remove them if they conflict with the intended scope.
5. Invalidate cached authorization/profile state after commit. Verify a fresh session and an already-open session both use the revised permissions.
6. Verify the intended sub-department works and manager-only actions outside it are denied. Do not test by completing real tickets or sending notifications.

Do not repair this by changing the label, changing `Profile.role` alone, or globally making Sub-manager outrank Manager.

## 3. Target database model

### Authoritative role assignments

Keep the `RoleAssignment` concept and strengthen its integrity. Add explicit scope relations so the database can verify that a department/sub-department exists and belongs to the specified tenant. The current polymorphic `scopeId` alone cannot provide those foreign keys.

Proposed logical fields:

| Field | Purpose |
| --- | --- |
| `id`, `userId`, `role`, `scopeType` | Assignment identity and role |
| `tenantId` | Required for every non-platform assignment |
| `departmentId` | Required for department and sub-department assignments |
| `subDepartmentId` | Required only for sub-department assignments |
| `createdAt`, `updatedAt`, `assignedBy` | Attribution and timestamps; historical grantor may remain unknown |

Use foreign keys, including composite parent keys where needed, to enforce tenant/department/sub-department ancestry. Add database checks for the permitted scope shapes:

| Scope | Allowed roles | Required scope fields |
| --- | --- | --- |
| Platform | Existing `admin` encoding for Super Admin | All scope IDs null |
| Tenant | `admin` | Tenant only |
| Department | `admin`, `manager`, `agent` | Tenant and department |
| Sub-department | `sub_manager`, `agent` | Tenant, department, sub-department |

Use partial unique indexes to allow at most one assignment per user at each exact scope, excluding `role` from that uniqueness key. Handle the platform row with its own unique index on `userId`; do not rely on nullable columns to enforce uniqueness. Role replacement updates an assignment; audit history preserves previous values.

Legacy tenant Manager/Sub-manager/Agent records require a reviewed mapping: membership remains tenant membership, Manager becomes explicitly selected department assignments, and Sub-manager requires explicitly selected sub-departments. Missing scope information must be reported for resolution, never expanded automatically to every department.

### Separate roles from membership and operational metadata

| Existing storage | Target responsibility |
| --- | --- |
| `Profile.role` | Temporary compatibility summary, then retire as an editable/authorization field |
| `Profile.isSuperAdmin` | Compatibility projection until platform assignment checks are migrated |
| `TenantMembership` | Tenant participation and active status; role authority moves to assignments |
| `SubDepartmentMembership` | Participation, nickname, availability/assignment preferences; role authority moves to assignments |
| `DepartmentManager` | Temporary compatibility projection; migrate grant metadata and walkthrough state before retirement |
| `DepartmentMember` | Preserve membership semantics; move any access-grant responsibility to the canonical access model |
| `DepartmentAccess` | Preserve expiry and access-level semantics; handle as explicit access grants, not invented manager roles |
| `RoleAssignment` | Only authoritative source for role privileges |

Retain membership rows that carry useful business data. Avoid a second independently editable role value in those rows. Suspended users, inactive tenant memberships, deleted tenants, and inactive sub-department membership must gate access consistently, including inherited grants where applicable. Define explicit tenant-removal behavior so rejoining cannot silently restore previously revoked privileges.

## 4. One transactional role-change service

Introduce a shared service, for example `src/lib/role-management.ts`, used by all role mutation paths.

The request must identify the user, tenant, exact scope, operation, and expected revision. Support distinct operations: grant a role, replace a role at a scope, revoke a grant, and move/demote a user across specified scopes.

A Manager-to-Sub-manager conversion spans two scopes. Its preview must explicitly identify the department Manager grant to revoke and the sub-department grant to create/update. Adding a Sub-manager grant alone does not imply removing every Manager grant the user holds.

Within one transaction:

1. Check actor authority against the target scope and validate parent relationships and active membership.
2. Lock a stable per-user authorization revision row, or use optimistic concurrency with a revision check. Reject stale requests and retry only safe transaction conflicts.
3. Apply the explicitly requested grant changes and synchronize temporary legacy projections in the same transaction.
4. Record before/after scope assignments, actor, reason, and revision in the audit trail.
5. Commit everything together; remove swallowed synchronization errors.

Invalidate authorization caches after commit. If client refresh delivery fails, the next server request must still enforce the new grants. Use a durable event/outbox if delivery guarantees are required.

Route all writers through this service: member settings, department managers, sub-department membership editors, tenant additions, invitations/acceptance, join approvals, imports, seeds, platform administration, removal/deactivation, and any integrations. Inventory actual callers before implementation. Stop direct independent writes to role columns.

## 5. Resolve permissions and display from the same scope

Replace global role gates with checks such as `canManageDepartment(userId, departmentId)` and `canManageSubDepartment(userId, subDepartmentId)`. Resolve the resource's tenant and ancestry on the server; a client-selected tenant is not sufficient proof of access.

Honor inheritance defined in the role hierarchy: tenant Admin within that tenant; department Admin/Manager within their department; Sub-manager within assigned sub-departments. Keep department Admin distinct from Manager. Preserve Super Admin's documented entered-tenant behavior explicitly.

Update `getProfile`, `requireAuth` consumers, `dept-scope`, Prisma scope filtering, assignment routing, notification recipient resolution, and background/API-key consumers to use the same canonical rules. Authorization reads must stop deleting/recreating assignment rows.

The UI should show scope-specific labels, for example `Sub-manager · Support Team`, and a list of assignments on the profile. On pages without a selected scope, show `Multiple roles` with details when appropriate. A tenant-wide role summary may be informational but must never authorize an operation in an unrelated department or tenant.

When editing roles, show the resulting assignments and any retained broader access before saving. Use the same resolved response for the members list and login/profile badge.

## 6. Phased delivery and migration

### Phase A — Stop new inconsistencies

- Implement the targeted repair workflow and transactional role-change service against existing tables.
- Correct role editors to require a scope and display resolved assignments.
- Add focused regression tests for this incident before deploying behavior changes.

### Phase B — Add schema integrity and inventory legacy data

- Produce a read-only reconciliation report comparing profile summaries, legacy assignments, and resolved permissions for every user.
- Flag same-scope duplicate roles, missing scopes, invalid parent relations, inactive memberships with grants, and unsupported tenant role encodings. Multiple roles in different scopes are not automatically errors.
- Add new relation/audit/revision fields and indexes through additive migrations. Keep them compatible with the running application during backfill.
- Backfill idempotently in batches with checkpoints. Preserve effective access initially except for explicitly reviewed corrections. Resolve invalid or ambiguous records before enforcing stricter constraints.

### Phase C — Cut over writers, then readers

- Introduce a coordinated authority switch: while legacy tables are authoritative, write them transactionally and derive assignments consistently; after cutover, assignments are authoritative and legacy tables are projections only.
- Shadow-compare old and new permission decisions for representative tenants and endpoints without granting extra access. Investigate differences before enabling new reads.
- Drain incompatible application instances/background workers, perform a final synchronized reconciliation, disable legacy read-time rebuilding, and activate canonical writes/reads together. An old resolver must never overwrite new canonical grants.
- Enable validated scope checks and uniqueness constraints after data cleanup. Keep rollback-compatible projections during the observation window.

### Phase D — Retire compatibility storage

- Remove every authorization dependency on `Profile.role` and duplicated membership roles.
- Remove read-time synchronization and obsolete writers permanently.
- Retire legacy columns/tables only in a later reviewed migration after checking operational metadata, reporting, integrations, and rollback needs. Preserve audit history.

### Shared database procedure

Follow the repository's `AGENTS.md`: never run `prisma migrate dev` or `prisma migrate reset` against the shared database.

For every schema edit, generate and review a migration using `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`. The output includes unrelated existing drift: remove it and keep only the intended migration. Review handcrafted checks/indexes and foreign-key SQL too.

Apply the reviewed SQL with `prisma db execute --file <migration.sql>`, record it with `prisma migrate resolve --applied <migration-name>`, then run `prisma generate`. Apply required additive database changes before deploying a client that depends on them, and before merge as required by this repository.

Validate migration/backfill behavior in an isolated database first. Plan lock duration and batch sizes for shared production use. Do not use real tickets or completion-email flows as test fixtures.

## 7. Verification and release criteria

| Scenario | Required result |
| --- | --- |
| This incident's Manager-to-Sub-manager replacement | Selected Manager grant disappears; correct Sub-manager grant remains; UI and server agree |
| Manager in department A, Sub-manager in B | Both remain valid; B does not inherit Manager permissions from A |
| Admin in tenant A, Agent in B | No Admin authority in B |
| Two roles written concurrently at the same scope | One valid assignment; stale request rejected or safely retried |
| Failure updating a compatibility row or audit record | Entire role change rolls back |
| Sub-manager with direct parent-department access | Broader visibility is explicitly shown and reviewed, not hidden behind the badge |
| Expired access / inactive membership / suspended tenant | Access denied according to the hierarchy and membership rules |
| Old browser session after demotion | Next protected server request enforces the demotion |
| Invite, join approval, seed, or import | Same service and integrity rules apply |
| Invalid scope role or mismatched tenant ancestry | Rejected by service and database constraints |
| Repeated backfill | No duplicates or privilege expansion |
| Ordinary authorization read | No assignment writes or rebuilds |

Run focused unit and integration tests, typecheck, lint, and required repository checks. Integration tests use isolated fixtures. Release only after all writers are inventoried, shadow mismatches are resolved, the affected account has the intended scoped access, and role-change audit/cache behavior is verified.

## 8. Rollback and completion

Keep a scoped before-image for the account repair and migration checkpoints for backfills. Roll back application readers only to a version compatible with the current database and up-to-date legacy projections. Never re-enable an older rebuild routine if it could recreate revoked grants. Prefer rolling forward corrected authorization logic when reverting would restore excess access.

Completion means roles have one authoritative write path and storage model, scope controls both permissions and labels, demotions take effect immediately on protected requests, and the same inconsistency cannot be recreated through any supported editor or integration.
