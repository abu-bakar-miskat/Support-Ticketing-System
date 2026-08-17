# PEN Ticketing System — UI/UX Redesign (Figma)

**Date:** 2026-07-02
**Deliverable:** A Figma file ("PEN Ticketing — UI Redesign") on Dumitru's Figma account containing a mini design system and high-fidelity mockups of the core screens. This is a design artifact, not a code change.

## Goals

Redesign the core screens as a **refined evolution** of the existing PEN identity — same brand, matured execution — fixing four systemic problems found in the current UI:

1. **Ticket detail overload** — 13+ sections crammed into one component used as both a full page and an 880px drawer.
2. **Density & readability** — 9.5–11.5px labels, tight tracking, hidden scrollbars.
3. **Inconsistent patterns** — three different filter bars (Board / My Tasks / All Tasks), conflicting status colors (e.g., In Progress is `#0a76b9` on the board but amber in the new-ticket modal fallback), two avatar implementations.
4. **Modal/drawer nesting** — flows stacking 3+ overlay layers.

## Scope

**In:** App shell (sidebar, topbar), Home dashboard, Kanban board, Task list (My Tasks / All Tasks), Ticket detail (full page + drawer), New ticket flow, mini design system.
**Out:** Sprints, Timeline, Reports, Inbox, Settings, Login, Onboarding, mobile layouts, dark-theme mockups (system is token-based so dark derives later), and any code implementation.

## Foundations

### Typography
- Family: DM Sans (UI), IBM Plex Mono (ticket IDs, numbers). Unchanged.
- Scale: 20px/semibold page titles · 14px/semibold section headers · 14px body · 13px secondary · **12px metadata floor** (nothing smaller).
- Line-heights loosened slightly relative to current so dense rows breathe.

### Color
- Brand anchor: PEN blue `#06476f`.
- **Glass only on the shell** (sidebar, topbar). Content surfaces are solid cards with subtle 1px borders — text always sits on solid ground.
- **One canonical status palette, used everywhere:** To Do slate · In Progress blue `#0a76b9` · Pull Request purple `#7c3aed` · Live green `#16a34a` · Blocked red. The amber fallback variant is removed.
- Priority keeps current icons/colors: Critical red + Flame, High orange + ChevronUp, Medium yellow + Minus, Low slate + ChevronDown.

### Density principles
- High density lives in **rows** (list rows, board cards); **chrome** gets air (16–20px section padding).
- Visible thin scrollbars on all scrollable regions.
- **Max 2 overlay layers** — a drawer may open one dialog; never a third layer.

### Core components (Design System page)
Buttons (3 sizes) · status pill · priority pill · label tag · **property row** (label + inline-editable value — the atom of the ticket detail) · **unified filter bar** (search + filter chips + sort + view/density toggle; identical anatomy on Board, My Tasks, All Tasks) · avatar (one style, one fallback logic) · stat card · board card · table row · tabs · drawer/modal frames.

## Screens

### App shell
Sidebar keeps its structure (dept switcher, primary nav, pinned projects, views, user block) restyled on the new type scale with clearer active states and legible section labels. Topbar anatomy unchanged (breadcrumbs, ⌘K search, timer, theme, notifications), re-spaced.

### Home dashboard
Greeting row with dual London/local clock. **4 stat cards** (Total, Completed, Open — merging Todo + In Progress with a split number — Assigned Projects). "Assigned to you" uses the unified table-row component. Right column: Sprint health + Recent activity as solid cards.

### Kanban board
Unified filter bar on top. Columns get a subtle background and visible scroll affordance. Board card redesigned on the 12px floor: row 1 = ID + priority pill; title (2-line max); label tags; one meta row (avatars, due chip, comment count, timer). Sub-ticket expander stays as a cleaner footer strip.

### Task list (My Tasks / All Tasks)
One shared table anatomy: Priority · ID · Title (with sub-task tree) · Status · Assignee · Project · Time · Due. Inline pickers preserved. Row height 40px default with a 32px compact density toggle in the filter bar.

### Ticket detail — Approach A: tabs + meta rail
- **Header:** breadcrumb, ID row with actions (copy link, open full page, delete), parent chip, inline-editable title.
- **Properties:** full page = right rail of property rows; drawer = horizontal **property strip** under the title. Properties: status, priority, assignees, project, dates, story points, time tracking — all inline-editable via popovers.
- **Tabs:** **Overview** (description or template/intake fields) · **Sub-tasks** (progress bar + rows + inline add) · **Comments** (thread + rich input with @mentions; count badge on tab) · **Activity** (audit feed).
- The commented-out date-metrics block in the current code is not carried forward.

### New ticket
Same detail layout in a modal frame: title, pre-filled property strip (from board column / project context), description editor, collapsed "More options" (labels, template, sprint, estimate). Single layer; replaces the current deeply-nested modal flow.

## Figma file structure

- **Page 1 — 🎨 Design System:** type scale, color tokens (brand, surfaces, status, priority), labeled core components.
- **Page 2 — 🖥 Core Screens:** 1440px desktop frames — Home, Board, My Tasks, Ticket detail (page), Ticket drawer over board (property-strip variant), New ticket modal over board. Default light theme, realistic PEN-flavored content (canonical status names, PREFIX-123 IDs, plausible titles).
- **Page 3 — 📱 Shell states:** sidebar expanded vs collapsed; notification sidebar open.
- Short annotation notes beside frames where a decision needs explaining (e.g., "max 2 overlay layers", "12px type floor").

## Success criteria

- Every text style in the mockups ≥ 12px.
- Status colors identical across board, lists, detail, and new-ticket frames.
- The drawer mockup fits its 880px width without a squeezed second column.
- Board/My Tasks/All Tasks share one visibly identical filter bar component.
- No mocked flow implies more than 2 stacked overlays.
