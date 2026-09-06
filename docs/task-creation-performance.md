# Why Task Creation Can Be Slow

Reviewed: 5 September 2026. Scope: the internal **New Task/New Ticket** modal and `POST /api/tickets`, including co-assignee and attachment follow-up requests. Public support intake is a separate workflow.

## Implementation update

The improvements below are now implemented locally. The remaining sections describe the original investigation.

- The modal sends co-assignee and attachment IDs in the create request, and no longer waits on separate follow-up endpoints.
- Co-assignee eligibility is checked in a batch. Ticket, co-assignee records, project memberships, and attachment linking commit together when related records are supplied. Attachment linking requires an owned, temporary, unclaimed upload; a mismatch rejects the transaction.
- The create handler resolves the authenticated database scope once and carries tenant/sub-department restrictions and ticket grants through the save and deferred work. Role synchronization remains fresh at scope resolution; it is not globally cached or moved to a potentially stale login-only path.
- Existing project and sub-department records supply their kind and tenant ID, avoiding two repeated reads.
- Existing Miscellaneous projects take a read-only lookup. Legacy ticket reconciliation is an explicit maintenance helper, not part of normal creation.
- Assignment emails and other existing side effects remain deferred with `after()`. This change does not introduce a durable outbox or alter the shared database schema/pool size.
- Navigation goes directly to `/tasks/:id`. The existing board callback can display the saved ticket; other views retain their query invalidation behavior.
- `Server-Timing` reports `auth`, `scope`, and `create` durations for authenticated creation responses, making the next production measurement easier.

Validation uses mocked database/service tests; live creation latency has not been benchmarked. The local Prisma client was regenerated to match the existing schema without accessing or changing shared database records.

### Follow-up: creation 500 on 6 September

Local logs showed repeated `P2028` errors, including an aborted `RoleAssignment.deleteMany` transaction. The database-client freshness check incorrectly searched runtime metadata for the mapped SQL name `enabledBoardTeamIds`; the generated Prisma field is `enabledBoardSubDepartmentIds`. This classified each new client as stale, repeatedly disconnecting it and aborting in-flight work. The check now uses the Prisma field name. Regression tests exercise the real generated client and repeated application-proxy accesses without connecting to a database.

**Main finding:** creation involves many database operations before the insert, potentially expensive permission resolution, and optional extra HTTP requests before the modal closes. The database pool defaults to one connection per application instance, which amplifies this work under load.

This is source-code analysis, not a measured production diagnosis. No tasks were created, notifications sent, or database changes made. Exact timings and the dominant cause need request traces.

## What the user waits for

```text
Click Create
  -> POST /api/tickets
     -> Authenticate and load profile/memberships
     -> Resolve permissions, department, project, and references
     -> Insert ticket, allocate number, return related data
     -> Return HTTP 201
  -> Wait for one POST per additional assignee, concurrently
  -> Wait for attachment-link POST, if needed
  -> Invalidate caches and close modal
  -> Update parent view OR navigate through /tickets/:id to /tasks/:id
```

The spinner therefore measures more than the ticket insert. Approximate structure:

`visible wait = create request + co-assignee batch + attachment linking`

Page navigation/rendering can add a separate delay after the modal closes. Concurrent assignee requests wait for the slowest response; their database work can still queue.

## Main contributors

### 1. Permission resolution can perform database writes

The Prisma extension calls `resolveTicketScope()` for operations on scoped models. Without an explicit request scope, it resolves the profile, sub-department access, and ticket grants.

For non-super-admin users, sub-department scope resolution reaches `resolveUserScope()`, which calls `syncUserRoleAssignments()`. That synchronization reads membership sources and uses a transaction to delete and recreate the user's derived role assignments before reading them back.

This means access checking can involve multiple reads **and writes**, before the requested project/ticket query runs. The in-flight synchronization map only combines overlapping synchronizations; it removes its entry after completion.

Several helpers use React `cache`, but their actual deduplication in this Route Handler must be measured. The installed React server implementation calls the underlying function directly when no cache dispatcher exists. Do not assume a helper is executed once merely because it is wrapped in `cache`.

**Priority:** count scope resolutions and role-rebuild transactions during one creation. If repeated, establish explicit request-local scope once and reuse it. Move derived-role synchronization to membership-change/login flows only after designing reliable freshness and revocation handling.

Evidence: [Prisma scoping](../src/lib/prisma-scope.ts), [role synchronization](../src/lib/role-assignment.ts), [request context](../src/lib/request-scope.ts).

### 2. Many awaited database checks precede the insert

Profile loading starts six Prisma operations for the profile and membership/access lists. `Promise.all` launches them together; it does not turn them into one SQL query or one network round trip.

The creation route then performs dependent checks for board/sub-department resolution, department setup, assignee existence, project access/membership/type, and tenant ownership. Parent, module, and template selections add more checks.

Some data is fetched repeatedly: the project is read for board resolution, again inside `projectInScope`, and again for its kind. The resolved sub-department is read for its department and later again for its tenant. Permission resolution can add further work beneath these calls.

**Priority:** consolidate selected fields and reuse verified records/access decisions within the request. Preserve every permission check; reduce repeated data fetching rather than removing authorization.

Evidence: [creation route](../src/app/api/tickets/route.ts), [profile loading](../src/lib/profile.ts), [department/project scope](../src/lib/dept-scope.ts).

### 3. One database connection makes extra work more expensive

`poolMax()` defaults to **1**, unless `DB_POOL_MAX` overrides it. Concurrent operations sharing this pool queue for the connection. This includes profile loading, co-assignee requests, and background work executing in the same instance. Separate instances can also compete for the shared Supabase pooler's capacity.

The recovery code retries qualifying connection-capacity failures up to five attempts. Four backoff sleeps total approximately **4.5–5.7 seconds**, excluding the failed attempts themselves. Connection acquisition can also wait; `connectionTimeoutMillis` is 20 seconds. These are conditional delays, not delays added to every request.

**Priority:** inspect pool wait times and `[db] EMAXCONN`/connection-recovery logs. Reduce query volume first. Change pool size only after checking the shared database connection budget; simply raising it can worsen saturation.

Evidence: [database pool and retries](../src/lib/db.ts).

### 4. Co-assignees keep the modal open after the ticket exists

The modal awaits one `/assignees` request for every additional assignee. Each request repeats authentication and access checks, validates eligibility, checks existing assignments, inserts the assignment, synchronizes project membership, writes activity, and awaits notification persistence when applicable.

Assignment email delivery is launched without awaiting it in this endpoint; it is not a direct response blocker. The awaited database work is the more immediate concern.

**Priority:** accept and validate all assignees in the create API, batch the necessary writes, and return the complete saved state. Defer external delivery through an appropriate reliable mechanism. Preserve clear error reporting: currently `Promise.allSettled` and unchecked HTTP statuses can hide partial assignment failures.

Evidence: [modal submission](../src/components/tickets/new-ticket-modal.tsx), [co-assignee endpoint](../src/app/api/tickets/[id]/assignees/route.ts).

### 5. Attachments add another sequential request

After co-assignees finish, the modal waits for `/attachments/link`. This repeats authentication, ticket access checks, attachment ownership validation, and attachment updates. This stage links existing uploaded files; it is not the initial file upload.

**Priority:** consider linking validated attachment IDs during creation so the server can save the intended task state in one coordinated operation.

Evidence: [attachment endpoint](../src/app/api/tickets/[id]/attachments/link/route.ts).

### 6. Creating without a project runs legacy cleanup

The Miscellaneous-project resolver reads the sub-department, upserts the default project, and searches for legacy duplicate projects. If duplicates exist, it also moves their tickets with `updateMany` before creating the new task.

**Priority:** separate legacy repair from ordinary creation. Resolve the existing canonical project cheaply, creating it only when needed.

Evidence: [Miscellaneous project resolver](../src/lib/misc-project.ts).

## Work already deferred, and secondary suspects

- **Already deferred:** the main create route uses `after()` for SLA timers, automation rules, activity, project-member synchronization, and primary assignment notifications/email. These do not directly delay its HTTP 201. They can still compete with follow-up requests for database resources. Moving them to `after()` again is not a new fix.
- **Refresh/navigation:** cache invalidations are fire-and-forget, so the modal does not await their completion. They can cause later refetch load. Where no `onCreated` callback is supplied, navigation goes to `/tickets/:id`, which redirects to `/tasks/:id`; the detail page performs additional reads.
- **Ticket-number contention:** the numbering trigger updates a shared counter per sub-department and checks the maximum existing number. Concurrent inserts in the same sub-department can wait on that counter. The schema has a matching composite unique index; there is no evidence here of an unindexed full-table scan.
- **Environment:** cold starts, development compilation, connection setup, and application-to-database network distance may add latency. Vercel configuration specifies `cdg1`; database region and deployed settings were not verified.

## How to confirm the cause

Instrument an approved test environment, or observe existing authorized requests without generating real-team notifications:

1. Separate browser timings for `POST /api/tickets`, each `/assignees` request, attachment linking, and final navigation. Record time to HTTP 201 and time to modal close separately.
2. Add server timings for authentication, scope resolution, project/sub-department validation, default-project resolution, and `ticket.create`. Count actual SQL statements and role-rebuild transactions; keep ticket content and credentials out of logs.
3. Compare one-assignee tasks against multiple-assignee tasks, attachments against no attachments, selected projects against Miscellaneous, and warm requests against first requests. Compare roles because super-admin scope bypasses some resolution work.
4. Correlate slow requests with connection retries, pool waits, and database lock waits. Compare median and p95 timings before and after any optimization.

**Recommended order:** measure scope/query amplification first; consolidate repeated reads; batch co-assignees and attachment linking; remove legacy cleanup from creation; then evaluate pool capacity and navigation overhead from measured results.
