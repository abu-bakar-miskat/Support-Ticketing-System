# PEN-Ticketing-System — Context Handoff

> Generated from a grilling session on 2026-06-24.  
> Purpose: give a fresh Claude Code session enough context to implement features correctly without re-exploring the codebase.

---

## What This System Is

An internal project/ticket management platform for Planet Education Networks (PEN). Built **from scratch** to fill a gap — no prior tool was replaced. It is the company's primary dev workflow tool, also used by non-dev teams (UI/UX designers, tech support).

**Active users:** 20–100 people across multiple departments and teams.

---

## Tech Stack (Quick Reference)

| Layer        | Tech                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| Framework    | Next.js (App Router, Turbopack) — **read `node_modules/next/dist/docs/` before writing Next.js code** |
| Language     | TypeScript 5 (strict)                                                                                 |
| Database     | PostgreSQL via Supabase                                                                               |
| ORM          | Prisma 7 with PgBouncer pooling adapter                                                               |
| Auth         | Supabase Auth + Microsoft Entra ID (PKCE OAuth)                                                       |
| Styling      | Tailwind CSS 4 + shadcn/ui + Base UI                                                                  |
| Server state | TanStack React Query v5                                                                               |
| Client state | Zustand v5                                                                                            |
| Real-time    | Supabase Realtime (auto-reconnect, exponential backoff)                                               |
| Rich text    | Tiptap                                                                                                |
| Email        | Resend                                                                                                |
| Push         | Web Push API                                                                                          |
| Storage      | Supabase Storage                                                                                      |

---

## Org Structure → Data Model Mapping

```
Institution (whitelisted domains)
└── Department
    ├── DepartmentManager (many-to-many)
    ├── DepartmentAccess (cross-dept grants, expiry)
    └── Team
        ├── TeamMembership (role per member)
        ├── TeamStatus (custom ordered statuses, per team)
        ├── TeamTicketCounter (auto-increment ticket numbers)
        └── Ticket (many per team)
```

**Important:** Every ticket belongs to a team. Projects group tickets across teams. Sprints are per-project.

---

## Roles & Permissions

| Role      | Behavior                                                                                    |
| --------- | ------------------------------------------------------------------------------------------- |
| `admin`   | Sees everything. Full admin panel access.                                                   |
| `manager` | Sees only their department(s). Elevated access within scope.                                |
| `lead`    | **No distinct permissions yet — just a label.** Treated same as `staff` in all auth checks. |
| `staff`   | Sees only tickets they're assigned to, created, or are a team member of.                    |

**Authorization is enforced server-side in every route handler** — no Supabase RLS. Key helpers: `requireAuth()`, `requireAdmin()`, `requireAdminOrManager()`, `canAccessTicket()` in `src/lib/auth.ts`.

---

## Known Gaps (As Of 2026-06-24)

1. **Non-dev team statuses not configured.** Teams for UI/UX designers and tech support are still using the default dev statuses (Not Started → In Progress → Pull Request → Live). Custom `TeamStatus` records need to be created for them. Both admins and managers can do this.

2. **`lead` role is a placeholder.** It exists in the enum but has no distinct behavior in auth or UI. Future differentiation is planned but not yet designed.

---

## Key Architectural Decisions

- **No RLS** — all access control is in route handlers, not the database layer.
- **Prisma + PgBouncer** — uses the transaction pooler (port 6543) for all app queries; direct URL (port 5432) only for migrations.
- **React Server Components** — data loading happens server-side via RSC; client uses React Query for mutations and refetches.
- **Supabase Realtime** — ticket changes, comments, mentions are streamed live; subscriptions auto-reconnect.
- **Custom statuses per team** — `TeamStatus` model allows any team to define their own workflow stages. Order is explicit; one status is flagged as "completion".

---

## Important File Paths

| Path                    | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `prisma/schema.prisma`  | Full DB schema (26 models, 6 enums)                        |
| `src/lib/auth.ts`       | All authorization helpers                                  |
| `src/lib/profile.ts`    | Profile loading with dept scope caching                    |
| `src/lib/dept-scope.ts` | Department scoping for managers                            |
| `src/lib/realtime.ts`   | Supabase Realtime with auto-reconnect                      |
| `src/lib/notify.ts`     | Notification creation logic                                |
| `src/lib/mentions.ts`   | @mention parsing                                           |
| `src/app/api/`          | 62 API route handlers grouped by feature                   |
| `src/store/`            | Zustand stores (auth, ticket, drawer, notification, timer) |
| `docs/prd.md`           | Product requirements document                              |
| `docs/requirements.md`  | Additional requirements                                    |

---

## Auth Flow

1. User hits `/login` → clicks "Sign in with Microsoft"
2. Microsoft Entra ID PKCE OAuth → Supabase Auth
3. Session stored in cookies via `@supabase/ssr`
4. Every server route calls `requireAuth()` which loads the `Profile` record
5. Profile includes role, department memberships, team memberships

---

## What's Next

The owner has features in mind but hasn't specified them yet. The next session should:

1. Ask the user what feature they want to implement
2. Use the `/grill-me` skill to clarify requirements before writing code
3. Check existing route handlers in `src/app/api/` before creating new ones — most domain logic already has an endpoint

---

## Suggested Skills For Next Session

- `/grill-me` — before implementing any feature, grill the user on requirements
- `/tdd` — if adding new API routes or business logic
- `/code-review` — after implementing a feature
- `/diagnose` — if debugging a reported bug
