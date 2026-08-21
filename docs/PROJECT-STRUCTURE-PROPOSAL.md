# Project Structure & Routing Proposal

> Target: a **scalable, fast** architecture for the PEN Support Ticketing System (Next.js 16 App Router, React 19, Prisma 7, Supabase, TanStack Query, Zustand).
>
> Status: proposal / migration guide. Nothing here changes runtime behavior — it is a **file-organization** refactor plus routing conventions.

---

## 1. Where we are today

Measured from the current tree:

| Area | Count | Signal |
|---|---|---|
| `src/lib/*.ts` (flat, top level) | **195 files** | 🔴 junk-drawer — the #1 scaling problem |
| `src/app/api/**/route.ts` | **~230 routes** | 🟡 deep but mostly fine |
| `src/app/**/page.tsx` | **79 pages** | 🟢 organized via route groups |
| `src/components/*` subdirs | **37 dirs** | 🟡 feature-ish but leaks shared UI |
| `src/hooks`, `src/store` | 31 + 7 | 🟢 fine |

### Pain points

1. **`src/lib` is a flat dump.** 195 files mixing pure utils (`format.ts`, `mime.ts`), domain logic (`sla-engine.ts`, `assignment-engine.ts`, `rule-executor.ts`), data loaders (`ticket-detail-data.ts`), infra (`db.ts`, `realtime.ts`), and colocated `*.test.ts`. There is no way to see feature boundaries, and everything can import everything → hidden coupling, slow onboarding, merge conflicts.
2. **Domain logic is split across three trees** — `lib/` (engine), `components/<feature>/` (UI), `app/api/<feature>/` (routes), `hooks/queries/` (client cache). A single feature like "tickets" is smeared across 4 top-level folders.
3. **No enforced boundary** between _shared_ code and _feature_ code. `components/ui` (34 files) is genuinely shared; `components/tickets` (27) is not — but nothing stops a random import.
4. **Barrel-free deep imports** make it hard to refactor a feature without touching dozens of call sites.

The goal below keeps the App Router routing (which is already good) and reorganizes everything else into **feature modules** with a clear shared core.

---

## 2. Guiding principles

- **Feature-first, not type-first.** Group by domain (`tickets`, `sla`, `recruitment`) not by kind (`components`, `utils`). A person working on SLA touches one folder.
- **`app/` stays thin.** Route files (`page.tsx`, `route.ts`, `layout.tsx`) are *entry points only* — they parse params, check auth, and delegate to a feature module. No business logic in route files.
- **One-directional dependency graph:** `app → features → shared → core`. Never backwards. A feature may depend on `shared`/`core`; `shared`/`core` never import a feature; features avoid importing each other (use `shared` or explicit cross-feature contracts).
- **Colocate tests** with the code they test (already the convention — keep it).
- **Fast by construction:** Server Components by default, `server-only`/`client-only` guards, per-feature code-splitting, explicit query-key ownership.

---

## 3. Proposed top-level layout

```
src/
├── app/                      # ROUTING ONLY — thin entry points (see §6)
│   ├── (dashboard)/
│   ├── (public)/             # login, support portal, invites, offline
│   ├── (platform)/           # super-admin console
│   └── api/                  # thin route handlers → call features/*/server
│
├── features/                 # ⭐ the heart — one folder per business domain
│   ├── tickets/
│   ├── tasks/
│   ├── projects/
│   ├── sprints/
│   ├── board/
│   ├── departments/
│   ├── sub-departments/
│   ├── sla/
│   ├── assignment/           # assignment-engine + rules
│   ├── automation-rules/     # rule-executor, rules-engine, rule-validation
│   ├── intake/               # intake forms + submissions
│   ├── mailbox/              # inbound email, connections, providers
│   ├── email/                # outbound email, identity, templates, branding
│   ├── recruitment/          # boards + screening
│   ├── reports/
│   ├── time-tracking/        # timers, entries, rota, availability
│   ├── calendar/             # events, holidays
│   ├── modules/
│   ├── docs/
│   ├── notifications/
│   ├── mentions/
│   ├── activity/             # audit log + activity feed
│   ├── dashboard/            # home widgets, layout
│   ├── settings/             # tenant/department settings surfaces
│   ├── platform/             # super-admin (tenants, templates, admins)
│   └── auth/                 # auth, tenant/dept scoping, RLS
│
├── shared/                   # cross-feature building blocks (no domain logic)
│   ├── ui/                   # ← today's components/ui (design system)
│   ├── components/           # cross-feature composite components
│   ├── hooks/                # generic hooks (use-debounce, use-current-user…)
│   ├── lib/                  # pure utils: format, mime, timezones, utils
│   └── types/                # shared TS types
│
├── core/                     # infrastructure / framework glue
│   ├── db/                   # prisma client (db.ts), scoping, rls-guc, recovery
│   ├── supabase/             # today's lib/supabase
│   ├── realtime/             # realtime.ts, broadcast helpers
│   ├── api/                  # api-error, api-response, request-scope, api-key-auth
│   ├── storage/              # storage.ts, uploads, downloads
│   ├── config/               # tenant-config, feature-flags, feature-keys, env
│   └── query/                # TanStack Query client + global keys registry
│
├── store/                    # global Zustand stores (unchanged)
└── generated/                # prisma client output (unchanged)
```

### Why three shared tiers (`features` / `shared` / `core`)?

- **`core`** = "the platform" (DB, auth infra, realtime, HTTP). Rarely changes. Everything may import it.
- **`shared`** = reusable UI + pure helpers with no business meaning. Design system lives here.
- **`features`** = the business. This is where 90% of work happens and where 90% of the 195 lib files land.

This gives lint-enforceable boundaries (see §8) and makes the dependency direction obvious.

---

## 4. Anatomy of a feature module

Every feature follows the **same predictable shape** so any engineer can navigate an unfamiliar feature instantly:

```
features/tickets/
├── server/                   # SERVER-ONLY (import 'server-only')
│   ├── ticket-detail-data.ts     # data loaders (was lib/ticket-detail-data.ts)
│   ├── ticket-events.ts
│   ├── ticket-cascade.ts
│   ├── ticket-transfer.ts
│   ├── ticket-completion-notify.ts
│   └── mutations.ts              # write paths used by route handlers
├── domain/                   # PURE domain logic — no I/O, unit-testable
│   ├── ticket-datetime.ts
│   ├── ticket-sub-status.ts
│   ├── ticket-column-moves.ts
│   ├── status-label-choice.ts
│   └── ticket-sub-status.test.ts
├── components/               # feature UI (was components/tickets/*)
│   ├── ticket-detail.tsx
│   └── ...
├── hooks/                    # feature client hooks
│   └── use-ticket-detail.ts      # (was hooks/queries/use-ticket-detail.ts)
├── queries/                  # query keys + fetchers owned by this feature
│   └── keys.ts
├── types.ts                  # feature-local types
└── index.ts                  # PUBLIC API barrel — the only cross-feature entry
```

Conventions:

- **`server/`** files start with `import 'server-only'`. They may touch Prisma, Supabase, email. Route handlers and Server Components import from here.
- **`domain/`** is pure (no DB, no fetch). This is where SLA math, assignment scoring, rule evaluation live — the parts most worth unit-testing. Fast tests, no mocks.
- **`index.ts`** re-exports the feature's public surface. Cross-feature imports go through `features/tickets` (the barrel), never `features/tickets/server/mutations`. Internal siblings import directly (no barrel) to avoid bundling everything.
- **Colocated `*.test.ts`** stays next to source (keep current convention).

### Concrete example — mapping today's `lib` into features

| Today (`src/lib/…`) | Proposed home |
|---|---|
| `sla-engine.ts`, `sla-calendar.ts`, `sla-timer.ts`, `sla-policy-match.ts` | `features/sla/domain/` + `server/` |
| `assignment-engine.ts`, `assignment.ts`, `role-assignment.ts`, `bulk-reassign.ts` | `features/assignment/` |
| `rule-executor.ts`, `rules-engine.ts`, `rule-validation.ts` | `features/automation-rules/` |
| `inbound-email.ts`, `process-inbound-email.ts`, `mailbox-*.ts`, `mail-providers/` | `features/mailbox/` |
| `email.ts`, `email-config.ts`, `email-templates/`, `resend-*.ts`, `form-branding.ts` | `features/email/` |
| `ticket-*.ts` (~15 files) | `features/tickets/` (split server vs domain) |
| `recruitment*.ts`, `screening/` | `features/recruitment/` |
| `reporting/`, `report-period.ts`, `exports/` | `features/reports/` |
| `rota.ts`, `availability.ts`, `timer-*.ts`, `time-data.ts` | `features/time-tracking/` |
| `auth*.ts`, `tenant-scope.ts`, `dept-scope.ts`, `prisma-scope.ts`, `rls-guc.ts`, `cross-access.ts` | `features/auth/` (or `core/db` for the scoping GUC) |
| `db.ts`, `db-recovery.ts` | `core/db/` |
| `realtime.ts`, `*-broadcast.ts` | `core/realtime/` |
| `api-error.ts`, `api-response.ts`, `request-scope.ts`, `api-key-auth.ts` | `core/api/` |
| `format.ts`, `mime.ts`, `timezones.ts`, `utils.ts`, `london-time.ts` | `shared/lib/` |
| `feature-flags.ts`, `feature-keys.ts`, `tenant-config.ts` | `core/config/` |

This is the bulk of the win: **195 flat files → ~24 feature folders + core + shared**, each averaging 5–15 files, each with an obvious owner.

---

## 5. Components & hooks migration

- `components/ui/` (34 files) → **`shared/ui/`** (design system: buttons, dialogs, inputs). Nothing here imports a feature.
- `components/<feature>/` → **`features/<feature>/components/`**.
- Cross-feature composites (e.g. a global command palette, app shell, nav) → **`shared/components/`**.
- `hooks/queries/use-*.ts` → move each into its owning **`features/<x>/hooks/`**. Generic hooks (`use-debounce`, `use-current-user`, `use-pwa-install`) → **`shared/hooks/`**.
- `hooks/queries/keys.ts` (the global query-key registry) → **`core/query/keys.ts`**, but each feature declares its own key namespace in `features/<x>/queries/keys.ts` and the core file just composes/aggregates. This prevents key collisions as features grow.

---

## 6. Routing structure (App Router)

The App Router tree is already the strongest part of the codebase. Refinements only:

### 6.1 Group routes by audience with route groups

```
app/
├── layout.tsx                       # root: providers, theme, fonts
├── (public)/                        # unauthenticated / customer-facing
│   ├── login/
│   ├── onboarding/
│   ├── offline/
│   ├── departments/                 # public dept listing
│   ├── support/[dept-slug]/[uuid]/  # customer support portal
│   ├── support/verify/[token]/
│   ├── invite/[token]/
│   ├── tenant-invite/[token]/
│   └── screen/[token]/              # candidate screening
│
├── (dashboard)/                     # authenticated staff app
│   ├── layout.tsx                   # app shell (sidebar, nav, providers)
│   ├── (home)/
│   ├── tickets/[id]/
│   ├── tasks/[id]/  · all-tasks/
│   ├── board/ · projects/[id]/ · sprints (under projects)
│   ├── inbox/ · mentions/ · activity/ · timeline/
│   ├── calendar/ · time/ · reports/ · docs/ · modules/
│   ├── departments (department/) · sub-departments/[name]/…
│   ├── recruitment/ · manager/ · mailboxes/ · profile/
│   └── settings/…                   # keep nested settings layout
│
└── (platform)/                      # super-admin console (own layout)
    └── platform/…
```

> Route groups `(…)` don't affect URLs — they let each audience have its **own root layout, auth boundary, and error/loading UI** without leaking providers into other audiences. Today `platform`, `support`, and `dashboard` share too much at the top; splitting them lets the public/support bundle stay tiny (no dashboard providers, no Zustand app stores).

### 6.2 Every route segment ships the fast-path files

Standardize on these where they matter (list/detail pages especially):

- `loading.tsx` — instant skeleton via Suspense (you already have `components/skeletons`).
- `error.tsx` — segment-level error boundary.
- `page.tsx` — **Server Component**, fetches via `features/<x>/server`, streams.
- Colocated `_components/` for one-off page-only UI (underscore = not a route).

### 6.3 API routes — keep the tree, thin the handlers

The `api/` tree mirrors features well already (`api/tickets`, `api/sla-policies`, `api/recruitment`…). Two rules:

1. **Handlers stay thin:** parse → authorize (`core/api` + `features/auth`) → call `features/<x>/server` → shape response with `core/api/api-response`. No engine logic inline.
2. **Version the public surface:** you already have `api/v1/` for the external API keys. Keep internal app routes unversioned; keep third-party/integration routes under `api/v1`.

Optionally group cron/webhooks explicitly (already done: `api/cron/*`, `api/webhooks/*`) — these should import only `features/<x>/server`, never client code.

---

## 7. Performance strategy (the "fast" half)

1. **Server Components by default.** Only add `'use client'` at interactive leaves (editors, drag-and-drop board, timers). Push client boundaries *down* the tree so more HTML streams from the server.
2. **Split by audience (§6.1).** The customer support portal must not download the dashboard's Zustand stores, TanStack Query client, tiptap editor, or react-dnd. Route groups + per-group providers make each entry bundle minimal.
3. **`server-only` / `client-only` guards** on every `features/*/server` and store file — turns accidental cross-boundary imports into build errors instead of shipped bloat.
4. **Streaming + Suspense** on detail pages: render the shell immediately, stream ticket detail / comments / SLA panels as they resolve. You already have `ticket-detail-cache.ts` and placeholder helpers — wire them to Suspense boundaries.
5. **Own your query keys per feature** (§5) and set sane `staleTime`s so realtime broadcasts (`core/realtime`) invalidate precisely instead of refetching everything.
6. **Prisma:** keep the single client in `core/db` (never instantiate per-request); centralize tenant/RLS scoping there so every query is scoped by construction (perf + safety).
7. **Route-level `dynamic`/`revalidate` hygiene:** mark truly static public pages (offline, dept listing) cacheable; keep dashboard dynamic.

---

## 8. Enforcing the boundaries

Add ESLint import rules so the architecture can't silently rot:

```jsonc
// eslint.config.mjs — no-restricted-imports (illustrative)
"core"     : "must not import from features/** or shared/**",
"shared"   : "must not import from features/**",
"features/A": "must not import features/B/** deep paths — only features/B (barrel)",
"app"      : "must not import lib engines directly — go through features/*/server"
```

Consider a tiny `dependency-cruiser` config in CI to fail PRs that violate `app → features → shared → core`.

---

## 9. Migration plan (incremental, low-risk)

Do **not** big-bang this. Move one feature at a time; each move is a pure file relocation + import-path update (mechanical, safe to verify with `npm run typecheck` + `npm test`).

**Phase 0 — scaffolding (no moves):**
- Create `features/`, `shared/`, `core/` dirs with `index.ts` barrels.
- Add `@/features/*`, `@/shared/*`, `@/core/*` path aliases in `tsconfig.json`.
- Add the ESLint boundary rules (as warnings first).

**Phase 1 — extract `core`:** move `db.ts`, `supabase/`, `realtime.ts`, `api-*.ts`, `storage.ts`, config. Highest reuse, unblocks everything.

**Phase 2 — extract `shared`:** `components/ui` → `shared/ui`; pure utils → `shared/lib`; generic hooks → `shared/hooks`.

**Phase 3 — features, biggest first:** `tickets`, then `email`+`mailbox`, `sla`, `assignment`+`automation-rules`, `recruitment`, `reports`, `projects`/`tasks`/`board`, then the long tail.

**Phase 4 — thin the routes:** for each `app/**/route.ts` and `page.tsx`, strip inline logic and delegate to the new `features/*/server`.

**Phase 5 — turn ESLint boundary rules to errors** and add the CI dependency check.

Each phase is independently shippable and reviewable. Because moves are mechanical, prefer many small PRs (one feature each) over one giant PR.

---

## 10. Before / after at a glance

```
BEFORE                              AFTER
src/lib/  (195 flat files)   ──►    src/features/<24 domains>/{server,domain,components,hooks}
src/components/<37 dirs>     ──►    shared/ui  +  features/<x>/components
src/hooks/queries/           ──►    features/<x>/hooks  +  shared/hooks
src/app/ (logic in routes)   ──►    src/app/ (thin) → delegates to features/*/server
(implicit coupling)          ──►    app → features → shared → core  (lint-enforced)
```

**Outcome:** clear ownership, code-splittable bundles per audience, unit-testable pure domain layer, and a dependency graph that keeps the app fast as it grows.

---

## 11. Department & Sub-Department hierarchy (the core navigation model)

This is the spine of the app, and today it is the **most inconsistent** part of the routing. The same conceptual resource — an org unit with mailbox, SLA, automation rules, and email settings — is addressed three different ways:

| Surface | Current route | Addressed by | Problem |
|---|---|---|---|
| "All departments" picker | `/departments` (root group, own layout) | — | lives outside `(dashboard)` |
| Single department detail | `/department` (singular) | **implicit** `activeDeptId` from profile scope | not in URL → not linkable, not shareable, breaks back/forward |
| Department config | `/settings/departments/[id]/{assignment,mailbox,rules,sla}` | `[id]` | buried in settings, split from detail |
| Sub-department detail + config | `/sub-departments/[name]/{mailbox,email,automation-rules,sla-policies,support-forms}` | `[name]` (URL-encoded) | third param scheme; `name` is unstable (renames break links) |

Three addressing schemes (implicit active-dept, `[id]`, `[name]`) for one hierarchy = confusing to navigate, impossible to enforce, and a magnet for duplicated code (department SLA UI and sub-department SLA UI are near-identical but separate).

### 11.1 Principle: one resource, one addressing scheme, one config surface

Treat **department** and **sub-department** as the *same kind of thing* at two depths of a tree, addressed consistently by **stable id + human slug** (`[id]` for correctness, slug for readability — never rely on a mutable `name` as the key, and never rely on an implicit "active" id that isn't in the URL).

```
app/(dashboard)/departments/
├── page.tsx                          # "ALL DEPARTMENTS" — the picker/listing
│                                     #   (moved into dashboard from root)
├── [deptId]/
│   ├── layout.tsx                    # dept shell: header + tabbed nav + auth
│   ├── page.tsx                      # department OVERVIEW (was /department)
│   ├── mailbox/page.tsx              # ── shared config surface ──┐
│   ├── email/page.tsx                #                            │ SAME tabs
│   ├── sla/page.tsx                  #                            │ as sub-dept
│   ├── automation-rules/page.tsx     #                            │
│   ├── assignment/page.tsx           #                            │
│   ├── support-forms/page.tsx        # ───────────────────────────┘
│   ├── members/page.tsx
│   └── sub-departments/
│       ├── page.tsx                  # list sub-depts of THIS dept
│       └── [subId]/
│           ├── layout.tsx            # sub-dept shell (inherits dept context)
│           ├── page.tsx              # sub-dept OVERVIEW (was /sub-departments/[name])
│           ├── mailbox/page.tsx      # ── same tab set, reused components ──
│           ├── email/page.tsx
│           ├── sla/page.tsx
│           ├── automation-rules/page.tsx
│           ├── assignment/page.tsx
│           └── support-forms/page.tsx
```

URLs become self-describing and shareable:

```
/departments                                  → all departments
/departments/eng                              → department overview
/departments/eng/sla                          → department SLA
/departments/eng/sub-departments              → its sub-departments
/departments/eng/sub-departments/backend      → sub-dept overview
/departments/eng/sub-departments/backend/sla  → sub-dept SLA
```

(`eng`/`backend` shown as slugs for readability; resolve slug→id in the layout, or use `[deptId]` directly — the point is the identifier is **in the URL and stable**, not an implicit active-dept.)

### 11.2 Why nest sub-departments *under* the department

- **Context is free.** The `[deptId]/layout.tsx` loads the department once; the nested `[subId]/layout.tsx` inherits it — no re-fetching the parent, no "which department does this sub-dept belong to?" guesswork. Breadcrumbs (`Eng ▸ Backend ▸ SLA`) fall out of the URL.
- **Auth cascades naturally.** The dept layout does the manager/admin check once; sub-dept segments sit inside that boundary.
- **It mirrors the data model** (`department.subDepartments`) and the existing scoping helpers (`getProfileDeptScope`, `resolveSubDepartmentByName`).

### 11.3 Config is settings, not a separate `/settings/departments` island

Today department config lives in `/settings/departments/[id]/*` while sub-department config lives under `/sub-departments/[name]/*`. Collapse both into the tabbed surface above so **there is exactly one place to configure an org unit**. `/settings` keeps only *tenant-wide* settings (branding, members, api-keys, feature flags); anything scoped to a specific dept/sub-dept moves under `/departments/[deptId]/…`.

### 11.4 Feature module: `features/org-units/` (shared by both levels)

Because department and sub-department share ~90% of their behavior, back them with **one feature module**, not two. This kills the current UI/logic duplication.

```
features/org-units/
├── server/
│   ├── department-detail-data.ts        # loaders for dept overview
│   ├── sub-department-detail-data.ts
│   ├── resolve-scope.ts                 # was dept-scope.ts / sub-department-access.ts
│   ├── department-setup.ts
│   └── sub-department-manage.ts
├── domain/
│   ├── department-types.ts
│   └── department-icons.ts
├── components/
│   ├── org-unit-shell.tsx               # the tabbed layout used by BOTH levels
│   ├── org-unit-nav.ts                  # was sub-department-nav.ts, generalized
│   ├── department-detail-page.tsx
│   ├── sub-department-mailbox.tsx
│   └── config-tabs/                     # mailbox/email/sla/rules panels reused
│       ├── mailbox-panel.tsx            #   at both dept and sub-dept level
│       ├── sla-panel.tsx
│       ├── automation-rules-panel.tsx
│       └── ...
├── hooks/
├── queries/keys.ts
├── types.ts                             # OrgUnit = Department | SubDepartment view
└── index.ts
```

The config panels take an `OrgUnitRef = { level: 'department' | 'sub-department'; id: string }` prop so the same `<SlaPanel/>` renders for a department or a sub-department — the API route it calls differs, the UI does not. (This is why the mapping table in §4 folds `sla`, `assignment`, `automation-rules`, `mailbox`, `email` into their own feature modules — `org-units` *composes* those features' panels rather than re-implementing them.)

### 11.5 API routes follow the same nesting

```
api/departments/[id]/…                        # already exists — keep
api/departments/[id]/sub-departments/…        # nest sub-dept endpoints here
api/departments/[id]/sla-policies/…           # ✓ already nested this way
api/departments/[id]/rules/…                  # ✓
```

Today `api/sub-departments/[id]/*` is a sibling of `api/departments/[id]/*`. Prefer nesting sub-department endpoints under their parent (`api/departments/[id]/sub-departments/[subId]/*`) so the URL encodes the ownership and the handler can authorize the whole chain in one scope check via `features/org-units/server/resolve-scope`.

### 11.6 Migration notes specific to this hierarchy

1. **Introduce `[deptId]` in the URL first** (add the new route tree, redirect `/department` → `/departments/[activeDeptId]`). This is the highest-value fix: it makes department pages linkable and fixes back/forward.
2. **Generalize `sub-department-nav.ts` → `org-unit-nav.ts`** taking a base path + level, so one nav definition drives both levels' sidebars.
3. **Move slug resolution into the layout** (`resolveSubDepartmentByName` → `resolve-scope`) and switch the key from mutable `name` to stable `id` (keep the slug for display/URL prettiness only).
4. **Fold `/settings/departments/[id]/*` into `/departments/[deptId]/*`** and leave a redirect for existing bookmarks.
5. Deduplicate the SLA / mailbox / rules panels into `features/org-units/components/config-tabs` as you migrate each — expect a net *deletion* of code here.
