# PRD — PEN Platform Phase 1: Internal Dev Ticketing System

## Problem Statement

Developers at PEN need a centralised place to create, track, and progress internal development tickets through a defined workflow. Without this, work is scattered across informal channels, there is no visibility into who is working on what, and there is no audit trail of ticket activity or cycle time data to inform future planning.

## Solution

A web-based internal ticketing system at pen.app, accessible only to PEN tenant users via Microsoft SSO. Developers land on a personal task queue, can create and pick up tickets, progress them through a fixed status workflow, collaborate via comments and attachments, and receive notifications on assignments and mentions. Every ticket event is logged automatically, and cycle time is captured when a ticket reaches Live.

---

## User Stories

1. As a developer, I want to sign in with my Microsoft account, so that I don't need a separate password for the platform.
2. As a developer, I want access restricted to the PEN Microsoft tenant, so that external accounts cannot access internal tickets.
3. As a developer, I want to land on a My Tasks view after signing in, so that I can immediately see what I am assigned to work on.
4. As a developer, I want My Tasks to show only active tickets (excluding Live), so that completed work doesn't clutter my queue.
5. As a developer, I want to create a new ticket with a title, type, priority, assignee, and project, so that work is clearly defined before it begins.
6. As a developer, I want ticket types of Bug, Feature, Task, and Chore, so that work can be categorised at a glance.
7. As a developer, I want ticket priorities of Low, Medium, High, and Urgent, so that the team can triage effectively.
8. As a developer, I want tickets to be assigned to a project, so that work is organised by initiative.
9. As a developer, I want each ticket to have a human-readable ID scoped to my team (e.g. DEV-42), so that tickets are easy to reference in conversation.
10. As a developer, I want to open an assigned ticket from my queue, so that I can pick up work without having to search for it.
11. As a developer, I want to move a ticket from Backlog to In Progress, so that teammates know I have started working on it.
12. As a developer, I want to move a ticket from In Progress to Pull Request, so that teammates know my code is ready for review.
13. As a developer, I want to move a ticket from Pull Request to Live, so that the ticket is marked complete when the work ships.
14. As a developer, I want the ticket status to only move forward through the defined workflow (Backlog → In Progress → Pull Request → Live), so that accidental regressions are prevented.
15. As a developer, I want to add comments to a ticket, so that I can communicate progress and decisions directly on the ticket.
16. As a developer, I want to edit my own comments, so that I can correct mistakes without creating noise.
17. As a developer, I want to soft-delete my own comments, so that the activity trail remains intact even when a comment is removed.
18. As a developer, I want to @mention teammates in comments, so that I can draw their attention to specific discussions.
19. As a developer, I want to receive an email when I am @mentioned in a comment, so that I don't miss important conversations.
20. As a developer, I want to receive an email when a ticket is assigned to me, so that I am immediately aware of new work.
21. As a developer, I want to upload file attachments to a ticket, so that I can share screenshots, specs, and supporting documents.
22. As a developer, I want to upload file attachments to a comment, so that I can provide visual context inline with a discussion.
23. As a developer, I want to see a full activity timeline on every ticket, so that I can understand the history of decisions and status changes.
24. As a developer, I want to see realtime updates on tickets without refreshing, so that I always have the latest state when collaborating with teammates.
25. As a developer, I want to see realtime comment additions on a ticket I have open, so that conversations feel live.
26. As a developer, I want cycle time to be automatically recorded when a ticket reaches Live, so that I don't have to track it manually.
27. As a developer, I want to filter My Tasks by project, so that I can focus on one initiative at a time.
28. As a developer, I want to filter My Tasks by team, so that I can view work scoped to my team.
29. As a developer, I want to filter My Tasks by department, so that leadership can see work across a whole department.
30. As an admin, I want to create and manage projects, so that new initiatives can be set up without engineering intervention.
31. As an admin, I want to create and manage teams with a fixed prefix, so that ticket IDs are meaningful to the organisation.
32. As an admin, I want to assign users to a team, so that ticket scoping and filtering work correctly.
33. As an admin, I want to assign users a role (admin or developer), so that the right people have management access.

---

## Implementation Decisions

### Tech Stack
- **Framework:** Next.js 16, App Router
- **Styling:** Tailwind CSS + shadcn/ui
- **ORM:** Prisma (all data reads and writes)
- **Auth + Realtime:** Supabase JS client (`@supabase/ssr`)
- **File Storage:** Supabase Storage
- **Email:** Resend (fire-and-forget, no retry queue in Phase 1)

### Authentication
- Microsoft SSO via Supabase Auth, Entra ID provider
- Tenant restricted to PEN tenant ID only (not `common` or `organizations`)
- OAuth callback handled at `/auth/callback` route handler using `@supabase/ssr`
- On first login, a Postgres trigger on `auth.users` INSERT auto-creates a `Profile` row in the public schema
- Unauthenticated requests middleware-redirected to the sign-in page

### Security Model
- No Row Level Security (RLS) — the SSO boundary is the security perimeter
- All data access is performed server-side via Prisma in Route Handlers or Server Components
- Realtime broadcasts globally to all authenticated users

### Data Model

**Org Structure**
- `Department` — id, name
- `Team` — id, name, prefix (short fixed uppercase string, unique), departmentId
- `Profile` — id (matches `auth.users` UUID), email, name, avatarUrl, role (admin | developer), teamId

**Projects**
- `Project` — id, name, slug

**Tickets**
- `Ticket` — id, ticketNumber (per-team sequential integer), title, type (Bug | Feature | Task | Chore), priority (Low | Medium | High | Urgent), status (Backlog | InProgress | PullRequest | Live), assigneeId (Profile), creatorId (Profile), projectId, teamId, cycleTime (nullable integer, seconds), createdAt, updatedAt, deletedAt (nullable, soft delete)
- Human-readable ID rendered as `{team.prefix}-{ticketNumber}` in the UI

**Per-team ticket numbering**
- `TeamTicketCounter` — teamId (unique), lastNumber (integer)
- A Postgres trigger on `Ticket` INSERT increments the counter and stamps `ticketNumber` — prevents race conditions from application-level MAX queries

**Comments**
- `Comment` — id, body, ticketId, authorId (Profile), editedAt (nullable), deletedAt (nullable), createdAt

**Attachments**
- `Attachment` — id, ticketId, commentId (nullable), uploaderProfileId, storageUrl, fileName, fileSize, createdAt
- Files stored in Supabase Storage; Prisma record stores the path/URL

**Mentions**
- `Mention` — id, commentId, mentionedUserId (Profile), notifiedAt (nullable)
- Parsed from comment body on save; persisted to prevent re-notification on edit

**Activity Log**
- `ActivityLog` — id, ticketId, actorId (Profile), action (STATUS_CHANGED | ASSIGNED | COMMENT_ADDED | ATTACHMENT_ADDED | MENTION), metadata (JSON), createdAt
- Written by a Postgres trigger for status changes; written by application code for all other events

**Cycle Time**
- Captured by a Postgres trigger on `Ticket` UPDATE when `status` transitions to `Live`
- Calculated as: `Live timestamp − first InProgress timestamp` (derived from `activity_log`)
- Written to `Ticket.cycleTime` in seconds

### API Surface
- Route Handlers handle all mutations: ticket CRUD, comment CRUD, attachment upload, status transitions
- Realtime subscriptions established client-side via Supabase JS client on the `tickets` and `comments` tables (global channel, no filtering)
- Resend email fired server-side after the Prisma mutation, not awaited (fire-and-forget)

### Notifications
- **On assign:** email sent to the new assignee
- **On @mention:** email sent to each mentioned user; `Mention.notifiedAt` stamped to prevent duplicates on comment edit
- No in-app notification centre in Phase 1

### My Tasks View
- Displays tickets where `assigneeId = currentUser.id` AND `status != Live`
- Filterable by project, team, and department

---

## Testing Decisions

### What makes a good test
Tests should assert external behaviour — what goes in, what comes out, what side effects are observable — not implementation details like which Prisma method was called. Prefer testing at the highest seam that exercises the real logic.

### Seams

**1. API Route Handlers**
- Test each route handler by sending HTTP requests and asserting response shape and status codes
- Prisma client mocked at the module boundary — tests verify the handler's contract, not the DB
- Cover: ticket creation, status transitions (including invalid transitions), comment create/edit/soft-delete, attachment record creation, mention parsing

**2. Postgres Triggers (Integration)**
- Run against a real Supabase DB (local via `supabase start`)
- Insert a ticket → assert `TeamTicketCounter` incremented and `ticketNumber` stamped
- Transition ticket to Live → assert `ActivityLog` row written and `cycleTime` populated
- Insert to `auth.users` → assert `Profile` row created

**3. Realtime Subscriptions**
- Test subscription setup and channel teardown logic in isolation
- Mock the Supabase JS client; assert the correct channel name and event handlers are registered

**4. Auth Middleware**
- Assert unauthenticated requests are redirected to sign-in
- Assert that a valid session from a different Microsoft tenant is rejected

---

## Out of Scope

- Phase 2 features of any kind
- In-app notification centre or notification preferences
- Email retry queue or delivery failure handling
- Ticket search or full-text search
- Ticket due dates or scheduling
- Sub-tickets or ticket dependencies
- Multiple assignees per ticket
- Custom ticket statuses or workflow configuration
- Reporting, dashboards, or cycle time analytics UI
- Mobile application
- Public-facing or external user access
- Role-based permission enforcement beyond display metadata (roles are metadata only in Phase 1)

---

## Further Notes

- `cycle_time` is in seconds at the DB level; the UI may display it in human-readable form (e.g. "2d 4h")
- Soft delete is used for both tickets and comments to preserve `activity_log` referential integrity
- The `Mention` model's `notifiedAt` field is the deduplication guard — always check it before firing a Resend call on comment edit
- Supabase Realtime requires the `tickets` and `comments` tables to be added to the Realtime publication in the Supabase dashboard (or via a raw SQL migration), as Prisma migrations do not handle this
- The `@supabase/ssr` package must be used (not `@supabase/supabase-js` directly) to correctly handle cookie-based sessions in the Next.js App Router
