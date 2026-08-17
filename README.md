# PEN Ticketing System

An internal development ticketing and project management platform built for the PEN organisation. Teams create and track tickets through a defined workflow, collaborate via comments and @mentions, attach files, log time, and receive real-time notifications — all behind Microsoft Entra ID SSO so access is restricted to org accounts only.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Roles & Permissions](#roles--permissions)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [GitHub Integration](#github-integration)

---

## Features

| Area | What it does |
|---|---|
| **Tickets** | Create bugs, features, tasks, and chores with type, priority, assignee, story points, and estimated time |
| **Workflow** | Per-team customisable statuses — default: Not Started → In Progress → Pull Request → Live |
| **Subtasks** | Nest tickets under a parent; subtask assignments notify the assignee and surface in their My Tasks |
| **Board** | Kanban view with drag-and-drop status management, grouped by team |
| **My Tasks** | Personal task queue (list + board view) with filters, plus a dedicated Assigned Subtasks section |
| **Projects** | Group tickets by project; colour-coded across the board |
| **Sprints** | Sprint planning with story points, progress tracking, and health indicators |
| **Comments** | Threaded replies, rich-text editor, @mentions with instant notifications |
| **Attachments** | File uploads on tickets and comments via Supabase Storage |
| **Time Tracking** | Per-ticket running timer with weekly chart and summary |
| **Notifications** | Real-time in-app notifications (Supabase Realtime) + email (Resend) for assignments and mentions |
| **Activity Log** | Immutable per-ticket audit trail of every status change, assignment, and comment |
| **Cycle Time** | Automatically captured when a ticket reaches Live |
| **Departments** | Org-level grouping of teams; managers have scoped visibility |
| **Access Control** | Role-based, department-scoped — all authorisation enforced server-side |
| **API Keys** | Generate scoped keys (`read` / `read_write` / `admin`) for external integrations |
| **SLA Rules** | Configurable first-response and resolution targets per priority |
| **Email Routing** | Route inbound emails to teams by subject, sender domain, or body rules |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Database | PostgreSQL via Supabase |
| ORM | Prisma 7 |
| Auth | Supabase Auth + Microsoft Entra ID (OAuth PKCE) |
| Realtime | Supabase Realtime |
| Email | Resend |
| Storage | Supabase Storage |
| Styling | Tailwind CSS 4 |
| UI Components | Base UI, shadcn/ui, Lucide React |
| Server State | TanStack Query v5 |
| Client State | Zustand |
| Rich Text | Tiptap |
| Drag & Drop | react-dnd |
| Testing | Vitest |

---

## Project Structure

```
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── seed.ts                # Seed script
│   └── migrations/            # SQL migrations
├── public/                    # Static assets
├── src/
│   ├── app/
│   │   ├── (dashboard)/       # All protected routes (see below)
│   │   ├── api/               # API route handlers
│   │   ├── auth/callback/     # OAuth / magic-link callback
│   │   ├── login/             # Public login page
│   │   └── onboarding/        # First-login onboarding
│   ├── components/
│   │   ├── ui/                # Base UI primitives
│   │   ├── board/             # Kanban board
│   │   ├── tickets/           # Ticket detail, creation, drawer
│   │   ├── tasks/             # My Tasks page
│   │   ├── comments/          # Comments + mentions
│   │   ├── dashboard/         # Home dashboard
│   │   ├── sprints/           # Sprint management
│   │   ├── projects/          # Project views
│   │   ├── time/              # Time tracking
│   │   ├── inbox/             # Notifications inbox
│   │   ├── manager/           # Manager dashboard
│   │   ├── settings/          # All settings pages
│   │   └── realtime/          # Real-time subscription setup
│   ├── hooks/
│   │   └── queries/           # TanStack Query hooks
│   ├── lib/
│   │   ├── supabase/          # Supabase client (server + admin)
│   │   ├── api/               # Client-side API helpers
│   │   ├── auth.ts            # Auth guards
│   │   ├── db.ts              # Prisma singleton
│   │   ├── board-data.ts      # Board + My Tasks data fetching
│   │   ├── dept-scope.ts      # Department access scoping
│   │   ├── notify.ts          # Notification creation + broadcast
│   │   └── email.ts           # Email sending via Resend
│   ├── store/                 # Zustand stores
│   └── generated/prisma/      # Auto-generated Prisma types
```

### Dashboard Routes

| Route | Description |
|---|---|
| `/` | Home dashboard — stats, assigned tasks, sprint health, activity feed |
| `/tasks` | My Tasks — personal queue with list/board view and subtasks section |
| `/all-tasks` | All tasks across accessible scope |
| `/board` | Kanban board grouped by team |
| `/tickets/[id]` | Ticket detail — comments, attachments, activity log, subtasks |
| `/projects` | Project listing |
| `/projects/[id]` | Project detail with board and members |
| `/sprints` | Sprint planning and management |
| `/inbox` | Notifications inbox |
| `/mentions` | All @mentions directed at you |
| `/time` | Time tracking log and weekly chart |
| `/reports` | Analytics and cycle time reports |
| `/manager` | Manager dashboard (managers only) |
| `/departments` | Department overview (admin only) |
| `/settings/*` | Teams, members, workflows, SLA, routing, email, API keys, and more |

---

## Database Schema

### Enums

| Enum | Values |
|---|---|
| `Role` | `admin`, `manager`, `lead`, `staff` |
| `TicketType` | `Bug`, `Feature`, `Task`, `Chore` |
| `TicketPriority` | `Low`, `Medium`, `High`, `Urgent` |
| `SprintStatus` | `planned`, `active`, `completed` |
| `NotificationType` | `mention`, `assignment`, `comment`, `status_change`, `review_request`, `join_request` |
| `JoinRequestStatus` | `pending`, `approved`, `rejected` |
| `ApiKeyScope` | `read`, `read_write`, `admin` |

### Core Models

```
Department        → has many Teams, Projects, DepartmentManagers, DepartmentAccess grants
Team              → belongs to Department; has many Profiles, Tickets, TeamStatuses, Memberships
Profile           → one per auth.users row; holds global Role; belongs to a Team
Project           → belongs to Department + Team; has many Tickets, Sprints, ProjectMembers
Ticket            → belongs to Project + Team; self-referential parent/subTickets relation
                    has many Comments, Attachments, ActivityLogs, TicketAssignees
Sprint            → belongs to Project; has many Tickets
Comment           → belongs to Ticket; self-referential parent (threaded replies); has Mentions
Attachment        → belongs to Ticket or Comment; file stored in Supabase Storage
ActivityLog       → append-only audit log per Ticket (status changes, assignments, comments)
TimeEntry         → per-profile timer entry linked to a Ticket
Notification      → per-user inbox record; broadcast via Supabase Realtime channel
TeamMembership    → per-user, per-team role assignment
TicketAssignee    → many-to-many co-assignees on a ticket
TeamTicketCounter → per-team sequential ticket number counter (incremented by DB trigger)
SlaRule           → first-response + resolution targets per TicketPriority
RoutingRule       → inbound email routing conditions mapped to a Team
ApiKey            → scoped API keys for external integrations
Workspace         → singleton global config (email, time tracking, approvals)
```

---

## Roles & Permissions

### Global Roles (`Profile.role`)

| Role | Capabilities |
|---|---|
| `admin` | Full system access — manage departments, teams, users, projects, all tickets |
| `manager` | Department-scoped — manage their department, view all department tickets, approve join requests |
| `lead` | Team lead — create tickets, manage sprints for their team |
| `staff` | Standard user — create tickets, comment, track time |

### Per-Team Roles (`TeamMembership.role`)

Users can hold different roles in different teams, independent of their global role.

### Department Scoping

- **DepartmentManager** — explicit manager assignment for a department
- **DepartmentAccess** — temporary cross-department access grant with optional expiry date

All authorisation is enforced server-side in Route Handlers and Server Components. There is no Supabase Row Level Security — the Microsoft Entra tenant restriction is the authentication perimeter.

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project with PostgreSQL, Auth, Realtime, and Storage enabled
- A Microsoft Entra ID (Azure AD) app registration configured for OAuth
- A [Resend](https://resend.com) account for transactional email

### 1. Clone the repository

```bash
git clone https://github.com/your-org/pen-ticketing-system.git
cd pen-ticketing-system
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the values — see [Environment Variables](#environment-variables) for details on each.

### 4. Push the schema to your database

```bash
npx prisma db push
```

Or run migrations if you have a migration history:

```bash
npx prisma migrate deploy
```

### 5. Seed sample data (optional)

```bash
npm run db:seed
```

> At least one user must have signed in before seeding so the script can attach data to a real profile.

### 6. Configure Microsoft Entra OAuth in Supabase

In the Supabase dashboard → **Authentication → Providers → Azure**:

- Set the **Tenant URL** to `https://login.microsoftonline.com/<ENTRA_TENANT_ID>` — use your specific tenant ID, not `common`, to restrict sign-in to org accounts only
- Add the Supabase Auth callback URL to your Azure app registration's **Redirect URIs**

### 7. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Unauthenticated requests are middleware-redirected to `/login`.

---

## Authentication Flow

1. User visits `/login`
2. Clicks **Sign in with Microsoft** → OAuth PKCE flow via Supabase Auth + Entra ID
3. Redirected back to `/auth/callback` → session written to secure httpOnly cookies
4. On first login a Postgres trigger auto-creates a `Profile` row linked to the `auth.users` record
5. User is sent through `/onboarding` to join or request access to a team
6. All subsequent requests read the session from cookies via `@supabase/ssr`

A **magic-link (email OTP)** fallback is available for edge cases where Microsoft OAuth is unavailable.

---

## Environment Variables

```env
# ── Supabase ──────────────────────────────────────────────────────────────────

# Project URL and public anon key (safe to expose in the browser)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# Service role key — server-only, never expose to the browser
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# ── Microsoft Entra ID ────────────────────────────────────────────────────────

# Your organisation's tenant ID — restricts sign-in to org accounts only
ENTRA_TENANT_ID=<your-microsoft-tenant-id>

# ── Database ──────────────────────────────────────────────────────────────────

# Transaction pooler (port 6543) — used by Prisma at runtime
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct connection (port 5432) — required for prisma migrate / db push
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
```

> Both connection strings are required. The transaction pooler handles concurrent serverless connections at runtime; the direct URL is only used during schema migrations.

---

## Available Scripts

```bash
npm run dev       # Start dev server with Turbopack at http://localhost:3000
npm run build     # Production build
npm start         # Run production server
npm run lint      # Run ESLint
npm test          # Run Vitest test suite
npm run db:seed   # Seed the database with sample data
```

---

## GitHub Integration

Tickets link to GitHub PRs/commits automatically when a branch name, PR
title, PR body, or commit message contains a ticket reference like `DEV-42`
(`<team prefix>-<ticket number>`, case-insensitive).

PR lifecycle events advance ticket status (always forward-only; intake
tickets are never auto-completed):

| GitHub event               | Default target                                                        |
| -------------------------- | --------------------------------------------------------------------- |
| PR opened (non-draft)      | "In Progress"                                                          |
| PR marked ready for review | First non-complete status named In Review / Review / Code Review / Pull Request |
| PR merged into main/master/modifications | "Live", else the team's first complete-flagged status |
| PR merged into `dev*`                    | "In Review" (first non-complete review-alias status)  |

Teams can override any of these (or disable an event) in
**Settings → Workflows & statuses → GitHub automation**.

### Environment variables

| Variable                | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret shared with the repo webhook (required)            |
| `GITHUB_REPO`           | `PlanetEducationNetworks/PEN-Ticketing-System` (required)      |
| `GITHUB_TOKEN`          | Fine-grained PAT, read-only Pull requests + Commit statuses (+ Checks if using GitHub Actions) on this repo (optional — enables CI badges and backfill) |

### Repo webhook setup (GitHub → Settings → Webhooks → Add webhook)

- Payload URL: `https://<deployed-origin>/api/webhooks/github`
- Content type: `application/json`
- Secret: the value of `GITHUB_WEBHOOK_SECRET`
- Events: select **Pull requests** and **Pushes**

### Backfill existing open PRs (admin session required)

    curl -X POST https://<deployed-origin>/api/admin/github/backfill

Safe to re-run; it only creates missing links and never changes ticket status.

---

## Claude Connector (MCP)

Connect claude.ai to the ticketing system so tickets can be created and looked up straight from a Claude chat.

1. An admin mints you an API key in **Settings → API keys** (scope `read_write` to create tickets; `read` for lookup only). The key is shown once.
2. In claude.ai (paid plan): **Settings → Connectors → Add custom connector**, URL:

       https://<deployed-origin>/api/mcp/<your-api-key>/mcp

3. Claude gains the tools `create_ticket`, `search_tickets`, `get_ticket`, `list_teams`, `list_projects`. Tickets created this way are attributed to the key's owner; department-scoped keys only see their department.

Revoking the key in the admin UI disconnects the connector immediately. The key rides in the connector URL — treat the URL as a secret.
