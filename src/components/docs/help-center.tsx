"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  Activity,
  ArrowRight,
  BarChart2,
  Bell,
  Bot,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  CircleAlert,
  CircleUser,
  Download,
  FileText,
  FolderKanban,
  Gauge,
  GitBranch,
  House,
  Inbox,
  Info,
  Keyboard,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Lightbulb,
  ListFilter,
  ListTodo,
  Mail,
  MessageSquare,
  Palette,
  PieChart,
  Reply,
  Search,
  Settings2,
  Shield,
  SquareKanban,
  Tag,
  TicketCheck,
  Timer,
  UserPlus,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type HelpGroup = "start" | "tickets" | "delivery" | "managers" | "processes" | "faq";

type HelpSection = {
  id: string;
  title: string;
  icon: LucideIcon;
  group: Exclude<HelpGroup, "faq">;
  managerOnly?: boolean;
  keywords: string;
  summary: string;
  body: React.ReactNode;
};

type FaqItem = {
  id: string;
  q: string;
  keywords: string;
  managerOnly?: boolean;
  a: React.ReactNode;
};

const GROUPS: { id: HelpGroup; label: string; managerOnly?: boolean }[] = [
  { id: "start", label: "Getting started" },
  { id: "tickets", label: "Working with tickets" },
  { id: "delivery", label: "Planning & delivery" },
  { id: "managers", label: "For managers & admins", managerOnly: true },
  { id: "processes", label: "How things work" },
  { id: "faq", label: "FAQ" },
];

// ─── Primitives ─────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: "admin" | "manager" | "sub_manager" | "staff" | "all" }) {
  const styles: Record<string, string> = {
    admin: "bg-pen-blue/15 text-pen-blue",
    manager: "bg-purple-500/15 text-purple-500",
    sub_manager: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    staff: "bg-pen-surface text-pen-subtle",
    all: "bg-pen-blue/10 text-pen-id",
  };
  const labels: Record<string, string> = {
    admin: "Admin",
    manager: "Manager",
    sub_manager: "Sub-manager",
    staff: "Staff",
    all: "All roles",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-wide",
        styles[role],
      )}
    >
      {labels[role]}
    </span>
  );
}

function SectionHeader({ id, icon: Icon, title }: { id: string; icon: LucideIcon; title: string }) {
  return (
    <div className="mb-5 flex items-center gap-3" id={id}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-pen-blue/10">
        <Icon className="size-[18px] text-pen-blue" />
      </div>
      <h2 className="font-sans text-[22px] font-bold tracking-tight text-pen-foreground">{title}</h2>
    </div>
  );
}

function InfoBox({ type = "info", children }: { type?: "info" | "tip" | "warning"; children: React.ReactNode }) {
  const styles = {
    info: { wrapper: "bg-pen-blue/5 border-pen-blue/20", icon: <Info className="mt-0.5 size-4 shrink-0 text-pen-blue" /> },
    tip: { wrapper: "bg-emerald-500/5 border-emerald-500/20", icon: <Lightbulb className="mt-0.5 size-4 shrink-0 text-emerald-500" /> },
    warning: { wrapper: "bg-amber-500/5 border-amber-500/20", icon: <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" /> },
  };
  const s = styles[type];
  return (
    <div className={cn("my-4 flex gap-3 rounded-xl border p-4", s.wrapper)}>
      {s.icon}
      <div className="font-sans text-[13.5px] leading-relaxed text-pen-foreground">{children}</div>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex gap-4">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-pen-blue font-sans text-[13px] font-bold text-white">
        {number}
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-1 font-sans text-[14px] font-semibold text-pen-foreground">{title}</p>
        {children && <p className="font-sans text-[13.5px] leading-relaxed text-pen-subtle">{children}</p>}
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  roles,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  roles?: Array<"admin" | "manager" | "sub_manager" | "staff" | "all">;
}) {
  return (
    <div className="rounded-xl border border-pen-card-border bg-pen-surface p-4 transition-colors hover:border-pen-blue/30">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-pen-blue/10">
          <Icon className="size-4 text-pen-blue" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="font-sans text-[13.5px] font-semibold text-pen-foreground">{title}</p>
            {roles?.map((r) => <RoleBadge key={r} role={r} />)}
          </div>
          <p className="font-sans text-[13px] leading-relaxed text-pen-subtle">{description}</p>
        </div>
      </div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 font-sans text-[13.5px] leading-relaxed text-pen-subtle">{children}</p>;
}

function Subhead({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 mt-4 font-sans text-[13.5px] font-semibold text-pen-foreground">{children}</p>;
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mb-3 space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 font-sans text-[13.5px] leading-relaxed text-pen-subtle">
          <ArrowRight className="mt-1 size-3.5 shrink-0 text-pen-blue" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-pen-card-border bg-pen-surface px-1.5 py-0.5 font-mono text-[11.5px] text-pen-foreground">
      {children}
    </kbd>
  );
}

// ─── Section content ──────────────────────────────────────────────────────────
const SECTIONS: HelpSection[] = [
  // ── Getting started ─────────────────────────────────────────────────────────
  {
    id: "overview",
    title: "Welcome & overview",
    icon: LifeBuoy,
    group: "start",
    keywords: "welcome intro start basics help center overview platform",
    summary: "What the platform does and how this Help Center is organised.",
    body: (
      <>
        <P>
          This is your team&apos;s ticketing &amp; delivery platform: it runs support intake, ticket
          tracking, project/sprint/module planning, time logging, recruitment, and reporting — all
          scoped by <strong>department</strong>.
        </P>
        <Subhead>How this Help Center is organised</Subhead>
        <Bullets
          items={[
            <><strong>Getting started</strong>, <strong>Working with tickets</strong>, <strong>Planning &amp; delivery</strong> — everyday use for everyone.</>,
            <><strong>For managers &amp; admins</strong> — setup &amp; oversight (visible only to managers/admins).</>,
            <><strong>How things work</strong> — the processes behind intake, ticket flow, and joining teams.</>,
            <><strong>FAQ</strong> — quick answers.</>,
          ]}
        />
        <InfoBox type="tip">Use the search box (top-left) to jump to any topic or FAQ.</InfoBox>
      </>
    ),
  },
  {
    id: "onboarding",
    title: "Onboarding & joining",
    icon: UserPlus,
    group: "start",
    keywords: "onboarding first time join request department team invite accept access",
    summary: "How new users get into a department — invites and join requests.",
    body: (
      <>
        <P>There are two ways to get access to a department/team:</P>
        <Bullets
          items={[
            <><strong>Invite</strong> — a manager/admin emails you an invite link; opening it and accepting adds you to the team with a set role.</>,
            <><strong>Join request</strong> — from onboarding you can browse departments and request to join; a manager approves or rejects it (you&apos;re notified in your Inbox).</>,
          ]}
        />
        <P>Until you belong to a team (or are added directly to a department), you&apos;ll land on the onboarding screen to find and request access.</P>
      </>
    ),
  },
  {
    id: "navigation",
    title: "Navigating the app",
    icon: Building2,
    group: "start",
    keywords: "navigation sidebar department switcher active department views workspace scope",
    summary: "Departments, the active-department switcher, and the sidebar layout.",
    body: (
      <>
        <P>
          Almost everything is scoped to the <strong>active department</strong> you pick in the sidebar
          — boards, tasks, calendar, and reports all re-scope when you switch. Use the department
          switcher at the top of the sidebar (My Departments) to change it.
        </P>
        <Subhead>Sidebar layout</Subhead>
        <Bullets
          items={[
            <><strong>Workspace</strong> — Home, Tasks, Projects, Notifications, My Time, Activity, and (for managers) Members, Team Reports, Recruitment.</>,
            <><strong>Views</strong> — Board, Timeline, Modules, Reports, Calendar, My Profile, Settings, Help Center (department-scoped).</>,
            <><strong>Pinned projects</strong> — quick links you manage yourself.</>,
          ]}
        />
        <InfoBox type="info">Cross-access guests see a reduced set (Board, Modules, Reports) for departments they were granted into.</InfoBox>
      </>
    ),
  },
  {
    id: "dashboard",
    title: "Home dashboard",
    icon: House,
    group: "start",
    keywords: "home dashboard landing greeting clock stats manager overdue unassigned review queue",
    summary: "Your landing page — different for staff and managers.",
    body: (
      <>
        <P><strong>Staff</strong> land on a personal Home with a greeting, clock, quick stats, and their assigned work.</P>
        <P>
          <strong>Managers</strong> get a Manager dashboard highlighting things that need attention:
          overdue tickets, unassigned tickets, the review queue, team workloads, member activity,
          pending join requests, and project health.
        </P>
      </>
    ),
  },
  {
    id: "profile-settings",
    title: "Profile & appearance",
    icon: CircleUser,
    group: "start",
    keywords: "profile appearance theme dark light font size timezone working hours github username signature avatar",
    summary: "Your personal settings: profile, theme, timezone, working hours, signatures.",
    body: (
      <>
        <Subhead>Profile (Settings → Profile, or My Profile)</Subhead>
        <Bullets
          items={[
            "Avatar, name (email and role are read-only).",
            "Timezone — used for availability & scheduling.",
            "Location and GitHub username (auto-links your commits/PRs).",
            "Working days and work start/end times — feed into auto-assignment availability.",
            "Email signatures — keep several, mark one active; appended to emails you send from tickets.",
          ]}
        />
        <Subhead>Appearance (Settings → Appearance)</Subhead>
        <Bullets items={["Theme — several light and dark themes.", "Font size — pick your preferred UI scale."]} />
      </>
    ),
  },
  {
    id: "notifications",
    title: "Notifications & Inbox",
    icon: Bell,
    group: "start",
    keywords: "notifications inbox bell mentions assignment comment status review join request email preferences",
    summary: "In-app Inbox, @-mentions, and which events email you.",
    body: (
      <>
        <P>
          The <strong>Inbox</strong> (bell in the top bar) collects in-app notifications: mentions,
          assignments, QA assignments, comments, status changes, review requests, support-form alerts,
          and join-request outcomes.
        </P>
        <Subhead>Preferences (Settings → Notifications)</Subhead>
        <Bullets
          items={[
            <><strong>In-app</strong>: mentions, assignments, comments on my tickets, status changes, new support tickets.</>,
            <><strong>Email</strong>: on assignment, on mention, when a ticket I created is completed, on comments, and on new support tickets needing my department&apos;s attention.</>,
          ]}
        />
        <P>Mention a teammate by typing <strong>@name</strong> in a comment or description.</P>
      </>
    ),
  },
  {
    id: "search",
    title: "Search (⌘K)",
    icon: Search,
    group: "start",
    keywords: "search command palette cmd ctrl k find tickets projects",
    summary: "Find tickets and projects fast from anywhere.",
    body: (
      <P>
        Press <Kbd>⌘K</Kbd> / <Kbd>Ctrl K</Kbd> anywhere to open the command palette and search tickets
        and projects live (type 2+ characters), then jump straight to a result.
      </P>
    ),
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    icon: Keyboard,
    group: "start",
    keywords: "keyboard shortcuts hotkeys keys cmd ctrl create task",
    summary: "Speed up common actions.",
    body: (
      <div className="rounded-xl border border-pen-card-border bg-pen-surface p-4">
        <div className="flex items-center justify-between border-b border-pen-card-border py-2.5">
          <span className="text-[13.5px] text-pen-foreground">Open search / command palette</span>
          <span className="flex gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        </div>
        <div className="flex items-center justify-between border-b border-pen-card-border py-2.5">
          <span className="text-[13.5px] text-pen-foreground">Create a new ticket</span>
          <span className="flex gap-1"><Kbd>X</Kbd><Kbd>Space</Kbd></span>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <span className="text-[13.5px] text-pen-foreground">Close open dialog / drawer</span>
          <span><Kbd>Esc</Kbd></span>
        </div>
      </div>
    ),
  },

  // ── Working with tickets ─────────────────────────────────────────────────────
  {
    id: "tickets",
    title: "Tickets",
    icon: TicketCheck,
    group: "tickets",
    keywords: "ticket task bug feature chore priority status assignee co-assignee qa label comment attachment estimate template subticket",
    summary: "The core unit of work and everything on a ticket.",
    body: (
      <>
        <P>A ticket captures one piece of work. Opening it shows details, activity history, comments, and attachments in a side drawer.</P>
        <Bullets
          items={[
            <><strong>Type &amp; priority</strong> — Bug / Feature / Task / Chore, and Low → Urgent.</>,
            <><strong>Assignee, co-assignees &amp; QA assignee</strong> — the owner, optional helpers, and a separate reviewer.</>,
            <><strong>Status</strong> — moves through the team&apos;s workflow columns.</>,
            <><strong>Labels</strong> — categorise; some statuses restrict which labels are allowed.</>,
            <><strong>Estimates &amp; time</strong> — planned effort vs. logged Development/QA time.</>,
            <><strong>Project, module &amp; sprint</strong> — where the ticket sits in planning.</>,
            <><strong>Comments &amp; @-mentions, attachments, sub-tickets</strong>.</>,
            <><strong>Templates</strong> — start from a preset field set (see Settings → Ticket templates).</>,
          ]}
        />
        <InfoBox type="tip">Press <Kbd>X</Kbd> then <Kbd>Space</Kbd> to create a ticket from anywhere.</InfoBox>
      </>
    ),
  },
  {
    id: "my-tasks",
    title: "Tasks (My Tasks)",
    icon: ListTodo,
    group: "tickets",
    keywords: "my tasks assigned to me personal queue work",
    summary: "Everything assigned to you, across projects and departments.",
    body: <P>Tasks is your personal queue — every open ticket assigned or co-assigned to you across all your projects and departments, so you always know what&apos;s on your plate. A sidebar badge shows the count.</P>,
  },
  {
    id: "all-tasks",
    title: "All Tasks",
    icon: ListFilter,
    group: "tickets",
    managerOnly: true,
    keywords: "all tasks list filter sort team department every ticket manager",
    summary: "A filterable list of every ticket in the department (manager/admin).",
    body: <P>All Tasks is a filterable, sortable list of every ticket in the active department — filter by team, assignee, status, priority, label, or project. Available to managers/admins.</P>,
  },
  {
    id: "board",
    title: "Kanban board",
    icon: SquareKanban,
    group: "tickets",
    keywords: "board kanban columns drag drop status workflow filter",
    summary: "Drag tickets across your team's workflow columns.",
    body: <P>The board shows tickets as cards in columns mapped to your team&apos;s statuses. Drag a card to change its status. Use the filter bar to narrow by assignee, priority, label, and more.</P>,
  },
  {
    id: "time",
    title: "Time tracking (My Time)",
    icon: Timer,
    group: "tickets",
    keywords: "time tracking timer log hours development qa entries estimate approvals",
    summary: "Log Development and QA time against tickets.",
    body: (
      <>
        <P>Track effort per ticket with the timer or by logging entries manually. Time is split into <strong>Development</strong> and <strong>QA</strong> so reports can separate them, and estimates let you compare planned vs. actual.</P>
        <InfoBox type="info">Admins can require time-entry approvals above a threshold (Settings → Approvals).</InfoBox>
      </>
    ),
  },
  {
    id: "customer-replies",
    title: "Customer replies",
    icon: Reply,
    group: "tickets",
    keywords: "customer reply email conversation support respond requester thread",
    summary: "Two-way email thread with the person who raised a support ticket.",
    body: (
      <>
        <P>Support tickets keep a two-way email thread with the requester. Reply from the ticket and it&apos;s emailed to them; their responses come back into the ticket&apos;s conversation, keeping the exchange in one place.</P>
        <InfoBox type="info">Replies are enabled per intake form (&quot;allow customer replies&quot;).</InfoBox>
      </>
    ),
  },
  {
    id: "activity",
    title: "Activity feed",
    icon: Activity,
    group: "tickets",
    keywords: "activity feed log history changes filter actor project date audit",
    summary: "A filterable, department-wide log of changes.",
    body: <P>Activity is a chronological, filterable log of what happened across the department — status changes, assignments, comments, and more — filterable by action, actor, project, and date range.</P>,
  },

  // ── Planning & delivery ──────────────────────────────────────────────────────
  {
    id: "projects",
    title: "Projects (tabs & structure)",
    icon: FolderKanban,
    group: "delivery",
    keywords: "projects grouping members standard support pinned domain tabs overview all tasks sprints board assets modules stages",
    summary: "The project detail page, its tabs, and where modules/sprints/stages live.",
    body: (
      <>
        <P>Projects group related work and the people delivering it. Tickets belong to a project; projects belong to a department/team. Support submissions land in a department&apos;s support project automatically. Pin projects to the sidebar for quick access.</P>
        <Subhead>Inside a project — the tabs</Subhead>
        <Bullets
          items={[
            <><strong>Overview</strong> — stats, activity, and contributors.</>,
            <><strong>All tasks</strong> — a table of every ticket in the project.</>,
            <><strong>Sprints</strong> — plan and run time-boxed iterations (see below).</>,
            <><strong>Board</strong> — one board tab per team, showing tickets in the team&apos;s stages (columns).</>,
            <><strong>Assets</strong> — files and documents for the project.</>,
          ]}
        />
        <InfoBox type="info">
          Three things people look for &quot;inside a project&quot;: <strong>Sprints</strong> live on the project&apos;s Sprints tab;
          <strong> Modules</strong> are created from the Modules view and attached to the project; <strong>Stages</strong> (board columns)
          are the team&apos;s workflow statuses set in Settings → Workflows. See the Modules, Sprints, and &quot;Custom stages&quot; sections.
        </InfoBox>
      </>
    ),
  },
  {
    id: "modules",
    title: "Modules (creating them)",
    icon: Boxes,
    group: "delivery",
    keywords: "modules epics grouping rollup progress create new module dialog enable assign tickets",
    summary: "Break a project into modules (epics) with roll-up progress.",
    body: (
      <>
        <P>Modules break a project into larger buckets (like epics); each rolls up the progress of its tickets.</P>
        <Subhead>Create a module</Subhead>
        <Step number={1} title="Open the Modules view">Go to <strong>Modules</strong> in the sidebar (Views).</Step>
        <Step number={2} title="Click “New module”">Fill in the <strong>Project</strong> it belongs to, a <strong>name</strong> (e.g. Payments, Onboarding), and an optional description.</Step>
        <Step number={3} title="Module system turns on">If the project didn&apos;t use modules yet, creating one enables the module system for that project automatically.</Step>
        <Step number={4} title="Add tickets to it">Open tickets (or the board/list) and set their <strong>Module</strong> field — tickets aren&apos;t added during module creation.</Step>
        <InfoBox type="info">The Modules view is available where the module system is enabled for your access.</InfoBox>
      </>
    ),
  },
  {
    id: "stages",
    title: "Custom stages (board columns)",
    icon: Workflow,
    group: "delivery",
    keywords: "stages statuses columns workflow board custom create rename reorder complete team",
    summary: "Where a project board's columns come from and how to customise them.",
    body: (
      <>
        <P>
          A project board&apos;s columns are the <strong>stages</strong> (workflow statuses) of the <em>team</em> that owns the board —
          so they&apos;re defined <strong>per team</strong>, and every project using that team shares them.
        </P>
        <Subhead>Customise stages (Settings → Workflows) <RoleBadge role="manager" /></Subhead>
        <Step number={1} title="Pick the team">In Settings → Workflows, choose the team whose stages you want to edit.</Step>
        <Step number={2} title="Add / edit a stage">Click <strong>Add status</strong>, set a <strong>label</strong> and <strong>color</strong>. Click a stage to rename or recolor it.</Step>
        <Step number={3} title="Reorder">Drag stages into the order they should appear as board columns.</Step>
        <Step number={4} title="Mark completion stages">Flag end stages as <strong>complete</strong> — these count tickets as done and feed the assignment rota&apos;s open-ticket counts.</Step>
        <P>You can also restrict which labels are allowed on each stage. Staff/leads see the resulting columns on the board but can&apos;t edit the stage list.</P>
      </>
    ),
  },
  {
    id: "sprints",
    title: "Sprints (creating them)",
    icon: Zap,
    group: "delivery",
    keywords: "sprints iterations planning active completed cadence create new sprint tab dates points tickets start complete",
    summary: "Create and run time-boxed iterations from a project's Sprints tab.",
    body: (
      <>
        <P>Sprints are time-boxed iterations that live on a project&apos;s <strong>Sprints</strong> tab.</P>
        <Subhead>Create a sprint</Subhead>
        <Step number={1} title="Open the project → Sprints tab">Then click <strong>New sprint</strong>.</Step>
        <Step number={2} title="Fill in the details">Name (e.g. &quot;Sprint 12&quot;), an optional goal, <strong>start</strong> and <strong>end</strong> dates, and an optional <strong>points target</strong>.</Step>
        <Step number={3} title="Add tickets">In the same dialog, search the project&apos;s tickets by title/ID and tick the ones to include.</Step>
        <Step number={4} title="Run it">A sprint moves <strong>Planned → Active → Completed</strong> from its row menu (Start sprint / Complete sprint). Completing a sprint leaves its tickets in place — they&apos;re just unlinked from the sprint.</Step>
        <P>Active sprints show days left, tickets done/total, points, and an on-track indicator.</P>
      </>
    ),
  },
  {
    id: "timeline",
    title: "Timeline",
    icon: CalendarDays,
    group: "delivery",
    keywords: "timeline gantt schedule dates overlaps",
    summary: "A time-based view of scheduled work.",
    body: <P>Timeline lays tickets out by their dates so you can see what&apos;s scheduled when and spot overlaps across the team.</P>,
  },
  {
    id: "reports",
    title: "Reports",
    icon: BarChart2,
    group: "delivery",
    keywords: "reports charts metrics throughput time overview date range",
    summary: "Charts and metrics on throughput, time and progress.",
    body: <P>Reports summarise delivery — throughput, time logged, and progress — filterable by date range, project, and person. Managers get deeper cross-team reporting (see Team reports).</P>,
  },

  // ── For managers & admins ─────────────────────────────────────────────────────
  {
    id: "manager-dashboard",
    title: "Manager dashboard",
    icon: LayoutDashboard,
    group: "managers",
    managerOnly: true,
    keywords: "manager dashboard overdue unassigned review queue workload join requests project health",
    summary: "Your oversight home: what needs attention right now.",
    body: (
      <>
        <P>Managers get a dedicated dashboard surfacing anything that needs action:</P>
        <Bullets
          items={[
            "Overdue and unassigned tickets.",
            "The review queue (tickets awaiting QA/review).",
            "Team workloads and member activity.",
            "Pending join requests to approve/reject.",
            "Project health at a glance.",
          ]}
        />
      </>
    ),
  },
  {
    id: "members",
    title: "Members & access",
    icon: Users,
    group: "managers",
    managerOnly: true,
    keywords: "members invite role schedule holidays do not assign active inactive cross access grant revoke remove",
    summary: "Add people, set roles/schedules, and manage department access.",
    body: (
      <>
        <P>Manage the people in your department (Settings → Members, and the Members page):</P>
        <Bullets
          items={[
            "Invite by email; set roles (managers can assign Lead/Staff, admins any role).",
            "Per-member schedule: working days, work hours, timezone, and per-team “do not assign”.",
            "Mark members active/inactive.",
            "Grant cross-department access (temporary with expiry, or permanent) and revoke it.",
            "Approve/reject join requests; remove members.",
          ]}
        />
        <InfoBox type="tip">Schedules and off-days set here feed straight into auto-assignment availability.</InfoBox>
      </>
    ),
  },
  {
    id: "teams-workflows",
    title: "Teams, workflows & statuses",
    icon: Workflow,
    group: "managers",
    managerOnly: true,
    keywords: "teams prefix color workload threshold rota statuses workflow complete order labels github pr mapping join requests",
    summary: "Teams, their statuses/workflow, and GitHub PR→status mapping.",
    body: (
      <>
        <Subhead>Sub departments (Settings → Sub departments &amp; roles)</Subhead>
        <Bullets
          items={[
            "Name, unique prefix (used in ticket IDs like WEB-123), and color.",
            "Workload threshold — the open-ticket cap the assignment rota respects.",
            "Members and leads; pending join requests.",
          ]}
        />
        <Subhead>Workflows &amp; statuses (Settings → Workflows)</Subhead>
        <Bullets
          items={[
            "Create/reorder statuses per team; set colors.",
            "Mark statuses as “complete” (end states) — these drive open-ticket counts.",
            "Restrict which labels are allowed on each status.",
            "GitHub automation: map PR events (opened / ready for review / merged) to statuses.",
          ]}
        />
      </>
    ),
  },
  {
    id: "departments-admin",
    title: "Departments",
    icon: Building2,
    group: "managers",
    managerOnly: true,
    keywords: "departments create managers members cross access hub project access org admin",
    summary: "Create and configure departments, managers, and access.",
    body: (
      <>
        <P>Departments are the top-level unit (Settings → Departments). Admins see all; managers see their own.</P>
        <Bullets
          items={[
            "Create/rename departments; assign or remove department managers.",
            "Add direct (native) members; grant/revoke cross-access to other departments (with optional expiry).",
            "Scope project access (whole workspace or specific projects).",
            "Hub departments provide cross-department oversight.",
          ]}
        />
      </>
    ),
  },
  {
    id: "config",
    title: "Projects, labels & templates",
    icon: Settings2,
    group: "managers",
    managerOnly: true,
    keywords: "settings projects labels tags ticket templates fields create edit configuration",
    summary: "Workspace configuration: projects, labels, and ticket templates.",
    body: (
      <>
        <Bullets
          items={[
            <><Tag className="inline size-3.5 text-pen-blue" /> <strong>Projects</strong> (Settings → Projects) — create projects, assign members/colors; admins can delete.</>,
            <><Tag className="inline size-3.5 text-pen-blue" /> <strong>Tags &amp; Labels</strong> (Settings → Tags) — create labels with colors; see usage counts.</>,
            <><FileText className="inline size-3.5 text-pen-blue" /> <strong>Ticket templates</strong> (Settings → Templates) — preset field sets to speed up ticket creation.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "intake",
    title: "Support forms (intake)",
    icon: Mail,
    group: "managers",
    managerOnly: true,
    keywords: "intake support form builder fields branding submissions classic chat display mode issues verification double opt-in share link",
    summary: "Build the public forms that turn requests into tickets.",
    body: (
      <>
        <P>Build public support forms (Settings → Support forms). A submission becomes a ticket in the department&apos;s support project.</P>
        <Bullets
          items={[
            "Custom fields + default field mapping (name, email, title, category/issue, priority, description, attachments).",
            "Classic form or conversational chat display mode.",
            "Per-form branding (accent color, logo, header/footer text) and a shareable public link.",
            "View & respond to submissions per form.",
            "“Allow customer replies” turns on the two-way email thread.",
          ]}
        />
        <Subhead>Email verification (double opt-in)</Subhead>
        <Bullets
          items={[
            <>External submitters must <strong>confirm their email</strong> via a link before the ticket is created.</>,
            <><strong>Org (SSO) emails</strong> skip verification and create the ticket immediately.</>,
            "Bad domains are rejected up front; if the confirmation email can’t be sent, no ticket is created.",
          ]}
        />
      </>
    ),
  },
  {
    id: "assignment",
    title: "Ticket assignment & ROTA",
    icon: Workflow,
    group: "managers",
    managerOnly: true,
    keywords: "assignment rota round robin auto assign workload availability holiday threshold issue manager excluded",
    summary: "How support tickets are auto-assigned (smart round-robin).",
    body: (
      <>
        <P>With <strong>auto-assign</strong> on, new support tickets use an availability- and workload-aware round-robin:</P>
        <Bullets
          items={[
            <><strong>Issue-based</strong> — if the chosen issue has assignees, one goes direct; multiple round-robin among themselves.</>,
            <><strong>Team ROTA</strong> (default) — rotates active team members, <em>excluding the department manager</em>.</>,
            <><strong>Availability-aware</strong> — skips anyone inactive, do-not-assign, on a holiday/off-day, or outside working hours.</>,
            <><strong>Workload-aware</strong> — picks the next person under the team&apos;s open-ticket threshold; if all are over, the least-loaded gets it.</>,
          ]}
        />
        <InfoBox type="tip">Off-days &amp; working hours affect the rota. Department-wide holidays are display-only and don&apos;t change assignment.</InfoBox>
      </>
    ),
  },
  {
    id: "calendar",
    title: "Team availability & Calendar",
    icon: CalendarRange,
    group: "managers",
    managerOnly: true,
    keywords: "calendar availability holidays off days events birthday working hours schedule import json top bar",
    summary: "Holidays, per-person off-days, events, and working hours.",
    body: (
      <>
        <P>The department Calendar is where managers manage availability:</P>
        <Bullets
          items={[
            <><strong>Department holidays</strong> — org-wide closures across the month (display-only). Add manually or <strong>import from JSON</strong>.</>,
            <><strong>Mark someone off</strong> — record a person&apos;s off-days (with reason); these <em>do</em> exclude them from auto-assignment.</>,
            <><strong>Events</strong> — birthdays, anniversaries, meetings, and other dated notes.</>,
            <><strong>Working hours</strong> — set each member&apos;s working days and start/end via &quot;Manage&quot;.</>,
          ]}
        />
        <InfoBox type="info">Upcoming holidays &amp; events (this/next week) also show in the top bar beside the clock.</InfoBox>
      </>
    ),
  },
  {
    id: "team-reports",
    title: "Team reports (People)",
    icon: PieChart,
    group: "managers",
    managerOnly: true,
    keywords: "team reports people manager per member open overdue in review shipped qa load time activity cross dept",
    summary: "Per-member and per-team performance for managers.",
    body: (
      <>
        <P>Team Reports (Members → Team Reports) breaks performance down per person:</P>
        <Bullets
          items={[
            "Open, overdue, in-review, and shipped tickets.",
            "QA load and cross-department assignments.",
            "Time tracked and recent activity.",
          ]}
        />
      </>
    ),
  },
  {
    id: "recruitment",
    title: "Recruitment",
    icon: BriefcaseBusiness,
    group: "managers",
    managerOnly: true,
    keywords: "recruitment hiring candidates pipeline boards fields stats history kanban",
    summary: "A candidate pipeline (boards, fields, stats) for hiring.",
    body: (
      <>
        <P>Recruitment is a Notion-style hiring pipeline for managers/admins:</P>
        <Bullets
          items={[
            "Boards with customizable columns/fields for your hiring stages.",
            "Candidates move through the pipeline; track their fields and history.",
            "Stats and history views for the pipeline.",
          ]}
        />
      </>
    ),
  },
  {
    id: "email-settings",
    title: "Email identity, templates & branding",
    icon: Mail,
    group: "managers",
    managerOnly: true,
    keywords: "email settings from name reply-to templates confirmation resolution assignment mention branding logo color notifications",
    summary: "Sender identity, per-department templates, and email branding.",
    body: (
      <>
        <P>Configure outgoing email (Settings → Email):</P>
        <Bullets
          items={[
            "Identity — from name, from address, and reply-to (with custom SMTP).",
            "Notification toggles — assignment, mention, support confirmation, resolution, customer reply, ticket completed (with per-department overrides).",
            "Templates — edit subject/body (with placeholders) and preview each type, per department.",
            "Branding — brand & header colors, logo, and footer text applied to emails.",
          ]}
        />
      </>
    ),
  },
  {
    id: "integrations",
    title: "Integrations & API keys",
    icon: KeyRound,
    group: "managers",
    managerOnly: true,
    keywords: "integrations api keys github pull request claude ai connector mcp scope read write admin notion import",
    summary: "GitHub PR linking, API keys, and the Claude AI connector.",
    body: (
      <>
        <Subhead>API keys &amp; Claude connector (Settings → API keys)</Subhead>
        <Bullets
          items={[
            "Generate keys with a scope (read / read_write / admin) and a department (or org-wide).",
            "The key is shown once — copy it then; you can revoke keys and see last-used.",
            <>Connect <strong>claude.ai</strong> via the MCP endpoint built from a key, so Claude can look up/create/edit tickets within the key&apos;s scope.</>,
          ]}
        />
        <Subhead>GitHub</Subhead>
        <P>Link pull requests to tickets so PR state (opened / ready / merged) drives the ticket&apos;s status per your team&apos;s PR→status mapping.</P>
      </>
    ),
  },
  {
    id: "notion-import",
    title: "Import from Notion",
    icon: Download,
    group: "managers",
    managerOnly: true,
    keywords: "import notion oauth database map fields projects tickets migrate",
    summary: "Bring projects/tickets in from a Notion database.",
    body: (
      <>
        <Step number={1} title="Connect">Authorize your Notion account (Settings → Import).</Step>
        <Step number={2} title="Configure">Pick a Notion database and map fields (name, description, status, assignee, dates, labels) and a target team.</Step>
        <Step number={3} title="Import">Run it; you&apos;ll see how many projects/tickets were created or skipped, plus any errors.</Step>
      </>
    ),
  },
  {
    id: "admin-advanced",
    title: "SLA, approvals & routing",
    icon: Gauge,
    group: "managers",
    managerOnly: true,
    keywords: "sla service level response resolution approvals time tracking routing rules admin phase 2",
    summary: "Admin-only policies (some are Phase-2 previews).",
    body: (
      <>
        <Bullets
          items={[
            <><strong>SLA policies</strong> (Settings → SLA) — first-response &amp; resolution targets per priority. Admin-only; preview.</>,
            <><strong>Time-tracking approvals</strong> (Settings → Approvals) — require sign-off above an hours threshold. Admin-only.</>,
            <><strong>Routing rules</strong> (Settings → Routing) — auto-route incoming requests by sender/subject/body to a team/priority. Admin-only; preview.</>,
          ]}
        />
        <InfoBox type="info">SLA and Routing are configuration previews (Phase 2) — the screens show the intended setup.</InfoBox>
      </>
    ),
  },
  {
    id: "roles",
    title: "Roles & permissions",
    icon: Shield,
    group: "managers",
    managerOnly: true,
    keywords: "roles permissions admin manager lead staff access matrix capabilities",
    summary: "What each role can see and do.",
    body: (
      <div className="grid gap-3 sm:grid-cols-2">
        <FeatureCard icon={Shield} title="Admin" description="Full access across all departments and every settings section, including SLA, approvals, routing." roles={["admin"]} />
        <FeatureCard icon={Users} title="Manager" description="Oversees assigned departments — members, sub departments, intake, calendar, recruitment, email, and reports." roles={["manager"]} />
        <FeatureCard icon={CircleUser} title="Sub-manager" description="Elevated within their own sub department; can manage its members/workflow and edit any ticket on it." roles={["sub_manager"]} />
        <FeatureCard icon={ListTodo} title="Staff" description="Works tickets they're assigned/created within their sub departments; personal settings only." roles={["staff"]} />
      </div>
    ),
  },

  // ── How things work ────────────────────────────────────────────────────────
  {
    id: "raise-ticket",
    title: "Raising a support ticket",
    icon: MessageSquare,
    group: "processes",
    keywords: "raise submit support request public form verify email confirm assign flow end to end",
    summary: "End-to-end: what happens when someone submits a support form.",
    body: (
      <>
        <Step number={1} title="Submit the form">The requester fills in the public form (classic or chat).</Step>
        <Step number={2} title="Email is validated">Format and domain (DNS/MX) are checked; undeliverable addresses are rejected immediately.</Step>
        <Step number={3} title="Verify (external emails)">A confirmation link is emailed; the ticket is created only after they click it. Org (SSO) emails skip this.</Step>
        <Step number={4} title="Ticket created & assigned">It lands in the department&apos;s support project and auto-assigns via the ROTA (if enabled); managers are alerted.</Step>
        <Step number={5} title="Two-way conversation">If replies are enabled, requester and assignee correspond by email, tracked on the ticket.</Step>
      </>
    ),
  },
  {
    id: "lifecycle",
    title: "Ticket lifecycle & statuses",
    icon: Activity,
    group: "processes",
    keywords: "lifecycle status workflow columns complete done progress states",
    summary: "How a ticket moves from new to done.",
    body: <P>A ticket starts in its team&apos;s first status and moves through the workflow columns as work progresses. Statuses marked &quot;complete&quot; count it as done — which also drives the open-ticket counts the assignment rota uses.</P>,
  },
  {
    id: "join-flow",
    title: "Joining a team (requests)",
    icon: UserPlus,
    group: "processes",
    keywords: "join request approve reject team department onboarding invite accept",
    summary: "How join requests and invites are approved.",
    body: (
      <>
        <Step number={1} title="Request or get invited">From onboarding you request to join a department/team, or a manager emails you an invite link.</Step>
        <Step number={2} title="Manager reviews">Managers see pending join requests on their dashboard and Inbox, and approve or reject.</Step>
        <Step number={3} title="Access granted">Once approved (or the invite is accepted), you appear as a team member with your assigned role.</Step>
      </>
    ),
  },
  {
    id: "conversation",
    title: "Customer conversation flow",
    icon: Mail,
    group: "processes",
    keywords: "conversation email thread reply requester inbound outbound support routing",
    summary: "How inbound and outbound support emails are threaded.",
    body: <P>Outbound replies from a ticket are emailed to the requester with a reply address that routes their response back onto the same ticket — keeping the full thread together for whoever picks it up.</P>,
  },
];

// ─── FAQ ────────────────────────────────────────────────────────────────────
const FAQS: FaqItem[] = [
  {
    id: "faq-assign",
    q: "How are support tickets assigned?",
    keywords: "assign rota round robin auto workload availability",
    managerOnly: true,
    a: <P>If the intake form has auto-assign on, a smart round-robin rotates through the team&apos;s active members, skipping anyone unavailable (off-day, outside working hours, do-not-assign) and preferring people under the team&apos;s workload threshold. See <strong>Ticket assignment &amp; ROTA</strong>.</P>,
  },
  {
    id: "faq-verify",
    q: "Why didn't my support submission create a ticket immediately?",
    keywords: "verify email confirm link double opt-in pending not created",
    a: <P>External requests require email confirmation first — click the link in the confirmation email and the ticket is created. Addresses that can sign in via SSO skip this step.</P>,
  },
  {
    id: "faq-join",
    q: "How do I join a department or team?",
    keywords: "join request onboarding invite access department team",
    a: <P>From the onboarding screen, browse departments and send a join request for a manager to approve — or accept an emailed invite. See <strong>Onboarding &amp; joining</strong>.</P>,
  },
  {
    id: "faq-switch-dept",
    q: "How do I change which department I'm looking at?",
    keywords: "department switch active scope change context sidebar",
    a: <P>Use the department switcher at the top of the sidebar. Boards, tasks, calendar, and reports all re-scope to the department you pick.</P>,
  },
  {
    id: "faq-off-day",
    q: "How do I mark someone as unavailable?",
    keywords: "off day leave unavailable holiday absence mark calendar",
    managerOnly: true,
    a: <P>In the Calendar view use &quot;Mark someone off&quot; to record off-days, or edit their working hours via &quot;Manage&quot;. Off-days exclude them from auto-assignment; department-wide holidays are display-only.</P>,
  },
  {
    id: "faq-theme",
    q: "How do I change the theme or text size?",
    keywords: "theme dark light font size appearance",
    a: <P>Settings → Appearance — pick a light/dark theme and your preferred font size. Set your timezone and working hours in Settings → Profile.</P>,
  },
  {
    id: "faq-claude",
    q: "How do I connect Claude (claude.ai) to the workspace?",
    keywords: "claude ai connector mcp api key integration",
    managerOnly: true,
    a: <P>Settings → API keys — generate a key with the scope you want, then follow the connector guide to add the MCP endpoint in claude.ai. The key&apos;s scope controls what Claude can do (read, read/write, admin).</P>,
  },
  {
    id: "faq-github",
    q: "How does GitHub move my tickets?",
    keywords: "github pr pull request status mapping automation",
    managerOnly: true,
    a: <P>Link a PR to a ticket; the ticket&apos;s status then follows your team&apos;s PR→status mapping (opened / ready for review / merged), configured in Settings → Workflows.</P>,
  },
  {
    id: "faq-sprint",
    q: "How do I create a sprint, module, or stage?",
    keywords: "create sprint module stage column status project board how",
    a: <P><strong>Sprints</strong>: project → Sprints tab → New sprint. <strong>Modules</strong>: Modules view → New module (pick the project). <strong>Stages</strong> (board columns): they&apos;re the team&apos;s workflow statuses in Settings → Workflows. See the Modules, Sprints, and Custom stages sections.</P>,
  },
  {
    id: "faq-columns",
    q: "Why can't I change the board columns?",
    keywords: "board columns stages statuses edit team workflow permission",
    a: <P>Board columns are the owning team&apos;s stages, edited in Settings → Workflows by managers/leads/admins. Staff see the columns but can&apos;t change the stage list.</P>,
  },
  {
    id: "faq-notifications",
    q: "Why am I (not) getting notification emails?",
    keywords: "notifications email preferences mute toggle inbox",
    a: <P>Settings → Notifications lets you toggle each in-app and email notification type independently (assignment, mention, comment, etc.).</P>,
  },
  {
    id: "faq-mention",
    q: "How do I pull a teammate into a ticket?",
    keywords: "mention @ notify teammate tag",
    a: <P>Type @ then their name in a comment or description. They get an Inbox notification (and an email if enabled) linking to the ticket.</P>,
  },
];

// ─── Component ─────────────────────────────────────────────────────────────
export function HelpCenter() {
  const user = useCurrentUser();
  const isManager = user?.role === "admin" || user?.role === "manager";

  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(() => SECTIONS.filter((s) => isManager || !s.managerOnly), [isManager]);
  const faqs = useMemo(() => FAQS.filter((f) => isManager || !f.managerOnly), [isManager]);

  const q = query.trim().toLowerCase();
  const matchedSections = useMemo(
    () => (q ? sections.filter((s) => `${s.title} ${s.keywords} ${s.summary}`.toLowerCase().includes(q)) : sections),
    [q, sections],
  );
  const matchedFaqs = useMemo(
    () => (q ? faqs.filter((f) => `${f.q} ${f.keywords}`.toLowerCase().includes(q)) : faqs),
    [q, faqs],
  );

  const visibleGroups = useMemo(() => GROUPS.filter((g) => (g.managerOnly ? isManager : true)), [isManager]);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    const container = scrollRef.current;
    if (!el || !container) return;
    container.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
    setActiveSection(id);
  }

  useEffect(() => {
    if (q) return;
    const container = scrollRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveSection(visible[0].target.id);
      },
      { root: container, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [q, sections]);

  return (
    <div className="flex h-full overflow-hidden bg-pen-bg">
      {/* Left rail */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-pen-card-border bg-pen-card lg:flex">
        <div className="border-b border-pen-card-border p-3">
          <div className="flex items-center gap-2 rounded-lg border border-pen-card-border bg-pen-surface px-2.5">
            <Search className="size-3.5 shrink-0 text-pen-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help…"
              className="w-full bg-transparent py-2 text-[12.5px] outline-none placeholder:text-pen-subtle"
            />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          {q ? (
            <div className="flex flex-col gap-1">
              <p className="px-2 pb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
                {matchedSections.length + matchedFaqs.length} result(s)
              </p>
              {matchedSections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className="rounded-md px-2 py-1.5 text-left text-[13px] text-pen-foreground hover:bg-pen-surface"
                >
                  <span className="flex items-center gap-2">
                    <s.icon className="size-3.5 shrink-0 text-pen-blue" />
                    {s.title}
                  </span>
                  <span className="ml-5 block truncate text-[11.5px] text-pen-subtle">{s.summary}</span>
                </button>
              ))}
              {matchedFaqs.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { scrollTo("faq"); setOpenFaq(f.id); }}
                  className="rounded-md px-2 py-1.5 text-left text-[13px] text-pen-foreground hover:bg-pen-surface"
                >
                  <span className="flex items-center gap-2">
                    <CircleAlert className="size-3.5 shrink-0 text-pen-blue" />
                    FAQ: {f.q}
                  </span>
                </button>
              ))}
              {matchedSections.length + matchedFaqs.length === 0 && (
                <p className="px-2 py-4 text-[12.5px] text-pen-subtle">No matches. Try another term.</p>
              )}
            </div>
          ) : (
            visibleGroups.map((g) => (
              <div key={g.id} className="mb-4">
                <p className="px-2 pb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">{g.label}</p>
                {g.id === "faq" ? (
                  <button
                    onClick={() => scrollTo("faq")}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-pen-surface",
                      activeSection === "faq" ? "bg-pen-surface font-medium text-pen-foreground" : "text-pen-subtle",
                    )}
                  >
                    <CircleAlert className="size-3.5 shrink-0" />
                    Frequently asked questions
                  </button>
                ) : (
                  sections
                    .filter((s) => s.group === g.id)
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => scrollTo(s.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-pen-surface",
                          activeSection === s.id ? "bg-pen-surface font-medium text-pen-foreground" : "text-pen-subtle",
                        )}
                      >
                        <s.icon className="size-3.5 shrink-0" />
                        {s.title}
                      </button>
                    ))
                )}
              </div>
            ))
          )}
        </nav>
      </aside>

      {/* Content */}
      <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
        <div className="w-full px-5 py-8 sm:px-8 lg:px-10">
          <div className="mb-6">
            <div className="mb-1 flex items-center gap-2">
              <LifeBuoy className="size-5 text-pen-blue" />
              <h1 className="font-sans text-[26px] font-bold tracking-tight text-pen-foreground">Help Center</h1>
            </div>
            <p className="font-sans text-[13.5px] text-pen-subtle">
              Guides, processes and FAQs for the platform.
              {isManager && <> Manager-only topics are included for your role.</>}
            </p>
            {/* Mobile search + jump */}
            <div className="mt-4 flex flex-col gap-2 lg:hidden">
              <div className="flex items-center gap-2 rounded-lg border border-pen-card-border bg-pen-surface px-2.5">
                <Search className="size-3.5 shrink-0 text-pen-subtle" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search help…"
                  className="w-full bg-transparent py-2 text-[12.5px] outline-none placeholder:text-pen-subtle"
                />
              </div>
              <div className="relative">
                <select
                  value={activeSection}
                  onChange={(e) => scrollTo(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-pen-card-border bg-pen-surface px-2.5 py-2 text-[12.5px] text-pen-foreground outline-none"
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                  <option value="faq">Frequently asked questions</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
              </div>
            </div>
          </div>

          {/* Sections grouped with dividers */}
          {(q ? [null] : visibleGroups.filter((g) => g.id !== "faq")).map((g) =>
            q ? (
              <div key="search">
                {matchedSections.map((s) => (
                  <section key={s.id} className="mb-10 scroll-mt-4">
                    <SectionHeader id={s.id} icon={s.icon} title={s.title} />
                    {s.body}
                  </section>
                ))}
              </div>
            ) : (
              <div key={g!.id} className="mb-2">
                <p className="mb-4 mt-2 border-b border-pen-card-border pb-2 font-sans text-[12px] font-semibold uppercase tracking-wider text-pen-subtle">
                  {g!.label}
                </p>
                {sections
                  .filter((s) => s.group === g!.id)
                  .map((s) => (
                    <section key={s.id} className="mb-10 scroll-mt-4">
                      <SectionHeader id={s.id} icon={s.icon} title={s.title} />
                      {s.body}
                    </section>
                  ))}
              </div>
            ),
          )}

          {/* FAQ */}
          {(!q || matchedFaqs.length > 0) && (
            <section className="mb-10 scroll-mt-4">
              <SectionHeader id="faq" icon={CircleAlert} title="Frequently asked questions" />
              <div className="overflow-hidden rounded-xl border border-pen-card-border">
                {(q ? matchedFaqs : faqs).map((f) => {
                  const open = openFaq === f.id;
                  return (
                    <div key={f.id} className="border-b border-pen-card-border last:border-0">
                      <button
                        onClick={() => setOpenFaq(open ? null : f.id)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-pen-surface"
                      >
                        <span className="font-sans text-[13.5px] font-medium text-pen-foreground">{f.q}</span>
                        <ChevronDown className={cn("size-4 shrink-0 text-pen-subtle transition-transform", open && "rotate-180")} />
                      </button>
                      {open && <div className="px-4 pb-3">{f.a}</div>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {q && matchedSections.length === 0 && matchedFaqs.length === 0 && (
            <p className="py-10 text-center text-[13px] text-pen-subtle">No results for “{query}”.</p>
          )}
        </div>
      </div>
    </div>
  );
}
