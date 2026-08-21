"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AtSign,
  Calendar,
  CalendarDays,
  Clock,
  Folder,
  ListTree,
  Loader2,
  MessageCircle,
  MoveRight,
  Paperclip,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  Text,
  Timer,
  TrendingUp,
  User,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { formatActivityRangeLabel } from "@/lib/format";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SearchableSelect } from "@/components/ui/searchable-select";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActivityAction =
  | "STATUS_CHANGED"
  | "ASSIGNED"
  | "CO_ASSIGNEE_ADDED"
  | "CO_ASSIGNEE_REMOVED"
  | "QA_ASSIGNEE_ADDED"
  | "QA_ASSIGNEE_REMOVED"
  | "COMMENT_ADDED"
  | "ATTACHMENT_ADDED"
  | "MENTION"
  | "DATE_CHANGED"
  | "FORWARDED"
  | "TICKET_DELETED"
  | "TICKET_CREATED"
  | "TITLE_CHANGED"
  | "PRIORITY_CHANGED"
  | "DESCRIPTION_CHANGED"
  | "STORY_POINTS_CHANGED"
  | "ESTIMATED_TIME_CHANGED"
  | "SPRINT_CHANGED"
  | "PROJECT_CHANGED"
  | "LABELS_CHANGED"
  | "MODULE_CHANGED"
  | "SUBTICKET_ADDED"
  | "TIMER_RESET"
  | "QA_TIME_LOGGED";

export type RangePreset = "today" | "yesterday" | "last7" | "last30" | "custom";

export type ActivityItem = {
  id: string;
  action: ActivityAction;
  metadata: Record<string, unknown>;
  createdAt: string;
  time: string;
  actor: { id: string; name: string; avatarUrl: string | null; color: string; role: string };
  ticket: {
    id: string; humanId: string; title: string; status: string; priority: string;
    subDepartmentId: string; subDepartmentName: string;
    projectId: string | null; projectName: string | null; projectColor: string | null;
  };
};

type FilterUser    = { id: string; name: string; avatarUrl: string | null; color: string };
type FilterProject = { id: string; name: string; color: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTION_META: Record<ActivityAction, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  STATUS_CHANGED:         { icon: MoveRight,     color: "#0a76b9", bg: "#0a76b915", label: "Status changed"         },
  ASSIGNED:               { icon: UserCheck,     color: "#7c3aed", bg: "#7c3aed15", label: "Assigned"               },
  CO_ASSIGNEE_ADDED:      { icon: UserPlus,      color: "#7c3aed", bg: "#7c3aed15", label: "Co-assignee added"      },
  CO_ASSIGNEE_REMOVED:    { icon: UserMinus,     color: "#7c3aed", bg: "#7c3aed15", label: "Co-assignee removed"    },
  QA_ASSIGNEE_ADDED:      { icon: UserPlus,      color: "#0d9488", bg: "#0d948815", label: "QA added"               },
  QA_ASSIGNEE_REMOVED:    { icon: UserMinus,     color: "#0d9488", bg: "#0d948815", label: "QA removed"             },
  COMMENT_ADDED:          { icon: MessageCircle, color: "#059669", bg: "#05966915", label: "Comment"                },
  ATTACHMENT_ADDED:       { icon: Paperclip,     color: "#f97316", bg: "#f9731615", label: "Attachment"             },
  MENTION:                { icon: AtSign,        color: "#0a76b9", bg: "#0a76b915", label: "Mention"                },
  DATE_CHANGED:           { icon: Calendar,      color: "#ec4899", bg: "#ec489915", label: "Date changed"           },
  FORWARDED:              { icon: Zap,           color: "#f97316", bg: "#f9731615", label: "Forwarded"              },
  TICKET_DELETED:         { icon: X,             color: "#dc2626", bg: "#dc262615", label: "Deleted"                },
  TICKET_CREATED:         { icon: Plus,          color: "#059669", bg: "#05966915", label: "Ticket created"         },
  TITLE_CHANGED:          { icon: Text,          color: "#64748b", bg: "#64748b15", label: "Title changed"          },
  PRIORITY_CHANGED:       { icon: TrendingUp,    color: "#f97316", bg: "#f9731615", label: "Priority changed"       },
  DESCRIPTION_CHANGED:    { icon: Text,          color: "#64748b", bg: "#64748b15", label: "Description changed"    },
  STORY_POINTS_CHANGED:   { icon: Activity,      color: "#0a76b9", bg: "#0a76b915", label: "Story points changed"   },
  ESTIMATED_TIME_CHANGED: { icon: Timer,         color: "#0a76b9", bg: "#0a76b915", label: "Estimated time changed" },
  SPRINT_CHANGED:         { icon: CalendarDays,  color: "#ec4899", bg: "#ec489915", label: "Sprint changed"         },
  PROJECT_CHANGED:        { icon: Folder,        color: "#7c3aed", bg: "#7c3aed15", label: "Project changed"        },
  LABELS_CHANGED:         { icon: Tag,           color: "#059669", bg: "#05966915", label: "Labels changed"         },
  MODULE_CHANGED:         { icon: Folder,        color: "#0a76b9", bg: "#0a76b915", label: "Module changed"         },
  SUBTICKET_ADDED:        { icon: ListTree,      color: "#059669", bg: "#05966915", label: "Sub-ticket added"       },
  TIMER_RESET:            { icon: Timer,         color: "#dc2626", bg: "#dc262615", label: "Timer reset"            },
  QA_TIME_LOGGED:         { icon: Timer,         color: "#0d9488", bg: "#0d948815", label: "QA time logged"         },
};

const PRIORITY_COLOR: Record<string, string> = {
  Urgent: "#ff4500", Critical: "#dc2626", High: "#f97316", Medium: "#ec4899", Low: "#94a3b8",
};

const ACTION_FILTER_OPTIONS: { value: ActivityAction | ""; label: string }[] = [
  { value: "",                       label: "All actions"           },
  { value: "TICKET_CREATED",         label: "Tickets created"       },
  { value: "STATUS_CHANGED",         label: "Status changes"        },
  { value: "ASSIGNED",               label: "Assignments"           },
  { value: "CO_ASSIGNEE_ADDED",      label: "Co-assignee added"     },
  { value: "CO_ASSIGNEE_REMOVED",    label: "Co-assignee removed"   },
  { value: "COMMENT_ADDED",          label: "Comments"              },
  { value: "ATTACHMENT_ADDED",       label: "Attachments"           },
  { value: "MENTION",                label: "Mentions"              },
  { value: "DATE_CHANGED",           label: "Date changes"          },
  { value: "FORWARDED",              label: "Forwarded"             },
  { value: "TICKET_DELETED",         label: "Deleted"               },
  { value: "TITLE_CHANGED",          label: "Title changes"         },
  { value: "PRIORITY_CHANGED",       label: "Priority changes"      },
  { value: "DESCRIPTION_CHANGED",    label: "Description changes"   },
  { value: "STORY_POINTS_CHANGED",   label: "Story point changes"   },
  { value: "ESTIMATED_TIME_CHANGED", label: "Estimate changes"      },
  { value: "SPRINT_CHANGED",         label: "Sprint changes"        },
  { value: "PROJECT_CHANGED",        label: "Project changes"       },
  { value: "LABELS_CHANGED",         label: "Label changes"         },
  { value: "MODULE_CHANGED",         label: "Module changes"        },
  { value: "SUBTICKET_ADDED",        label: "Sub-tickets added"     },
  { value: "TIMER_RESET",            label: "Timer resets"          },
];

const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today",     label: "Today"        },
  { id: "yesterday", label: "Yesterday"    },
  { id: "last7",     label: "Last 7 days"  },
  { id: "last30",    label: "Last 30 days" },
  { id: "custom",    label: "Custom"       },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

type TimeGroup = "today" | "yesterday" | "this_week" | "older";
const GROUP_LABELS: Record<TimeGroup, string> = {
  today: "Today", yesterday: "Yesterday", this_week: "This week", older: "Older",
};

function getTimeGroup(createdAt: string): TimeGroup {
  const now = new Date();
  const date = new Date(createdAt);
  const nowDay  = new Date(now.getFullYear(),  now.getMonth(),  now.getDate());
  const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.floor((nowDay.getTime() - itemDay.getTime()) / 86400000);
  if (dayDiff === 0) return "today";
  if (dayDiff === 1) return "yesterday";
  if (dayDiff < 7)   return "this_week";
  return "older";
}

function describeAction(action: ActivityAction, meta: Record<string, unknown>): string {
  switch (action) {
    case "STATUS_CHANGED":
      if (meta.source === "github")
        return `moved to "${meta.to ?? "?"}" · PR merged to ${meta.base ?? "main"}`;
      return meta.from && meta.to ? `moved from "${meta.from}" to "${meta.to}"` : `changed status to "${meta.to ?? "?"}"`;
    case "ASSIGNED":               return meta.toName ? `assigned to ${String(meta.toName)}` : "unassigned";
    case "CO_ASSIGNEE_ADDED":      return meta.userName ? `added ${String(meta.userName)} as co-assignee` : "added a co-assignee";
    case "CO_ASSIGNEE_REMOVED":    return meta.userName ? `removed ${String(meta.userName)} as co-assignee` : "removed a co-assignee";
    case "QA_ASSIGNEE_ADDED":      return meta.userName ? `assigned ${String(meta.userName)} to QA` : "added a QA assignee";
    case "QA_ASSIGNEE_REMOVED":    return meta.userName ? `removed ${String(meta.userName)} from QA` : "removed a QA assignee";
    case "COMMENT_ADDED":          return "added a comment";
    case "ATTACHMENT_ADDED":       return meta.fileName ? `attached "${meta.fileName}"` : "attached a file";
    case "MENTION":                return meta.mentionedName ? `mentioned ${String(meta.mentionedName)}` : "mentioned someone";
    case "DATE_CHANGED":           return meta.to ? `set due date to ${String(meta.to)}` : "changed the due date";
    case "FORWARDED":              return meta.toSubDepartmentName ? `forwarded to ${String(meta.toSubDepartmentName)}` : "forwarded";
    case "TICKET_DELETED":         return "deleted the ticket";
    case "TICKET_CREATED":         return meta.humanId ? `created ticket ${meta.humanId}` : "created the ticket";
    case "TITLE_CHANGED":          return meta.to ? `renamed to "${meta.to}"` : "changed the title";
    case "PRIORITY_CHANGED":       return meta.from && meta.to ? `changed priority from ${meta.from} to ${meta.to}` : `changed priority to ${meta.to ?? "?"}`;
    case "DESCRIPTION_CHANGED":    return meta.hadDescription ? "updated the description" : "added a description";
    case "STORY_POINTS_CHANGED":   return meta.to != null ? `set story points to ${meta.to}` : "cleared story points";
    case "ESTIMATED_TIME_CHANGED": return meta.to != null ? `set estimate to ${meta.to}h` : "cleared estimate";
    case "SPRINT_CHANGED":         return meta.toName ? `moved to sprint "${meta.toName}"` : "removed from sprint";
    case "PROJECT_CHANGED":        return meta.toName ? `moved to project "${meta.toName}"` : "removed from project";
    case "LABELS_CHANGED":         return "changed labels";
    case "MODULE_CHANGED":         return meta.toName ? `moved to module "${meta.toName}"` : "removed from module";
    case "SUBTICKET_ADDED":        return meta.humanId ? `added sub-ticket ${meta.humanId}` : "added a sub-ticket";
    case "TIMER_RESET":            return "manually reset their development timer";
    case "QA_TIME_LOGGED": {
      const secs = typeof meta.durationSecs === "number" ? meta.durationSecs : 0;
      if (secs <= 0) return "logged QA time";
      if (secs < 60) return `logged ${secs}s of QA time`;
      const mins = Math.round(secs / 60);
      return mins >= 60
        ? `logged ${Math.floor(mins / 60)}h ${mins % 60}m of QA time`
        : `logged ${mins}m of QA time`;
    }
    default:                       return "updated the ticket";
  }
}

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({ item }: { item: ActivityItem }) {
  const meta = ACTION_META[item.action];
  const Icon = meta.icon;
  const desc = describeAction(item.action, item.metadata);
  const priorityColor = PRIORITY_COLOR[item.ticket.priority] ?? "#94a3b8";
  const isDeleted = item.action === "TICKET_DELETED";
  const isAutomation = item.metadata.source === "github";
  const actorName = isAutomation ? "PR merge" : item.actor.name;
  const actorAvatarUrl = isAutomation ? null : item.actor.avatarUrl;

  return (
    <div className="group flex items-start gap-3.5 py-3">
      <div className="relative mt-0.5 shrink-0">
        <UserAvatar name={actorName} avatarUrl={actorAvatarUrl} size={30} />
        <span
          className="absolute -bottom-1 -right-1 flex size-[14px] items-center justify-center rounded-full border-[1.5px] border-pen-card"
          style={{ backgroundColor: meta.color }}
        >
          <Icon className="size-[7px] text-white" strokeWidth={2.5} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="shrink-0 font-sans text-[12.5px] font-semibold text-pen-foreground">{actorName}</span>
          <span className="shrink-0 font-sans text-[12px] text-pen-muted">{desc}</span>
          <span className="ml-auto shrink-0 font-sans text-[11px] text-pen-subtle">{item.time}</span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {isDeleted ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-red-500">
              {item.ticket.humanId}
            </span>
          ) : (
            <Link
              href={`/tickets/${item.ticket.id}`}
              className="inline-flex items-center gap-1 rounded-md bg-pen-surface px-2 py-0.5 font-mono text-[10.5px] font-semibold text-pen-id transition-colors hover:bg-pen-blue-tint"
            >
              {item.ticket.humanId}
            </Link>
          )}

          {isDeleted ? (
            <span className="min-w-0 max-w-[280px] truncate font-sans text-[12px] text-pen-muted/60 line-through">{item.ticket.title}</span>
          ) : (
            <Link
              href={`/tickets/${item.ticket.id}`}
              className="min-w-0 max-w-[280px] truncate font-sans text-[12px] font-medium text-pen-foreground hover:text-pen-id hover:underline"
            >
              {item.ticket.title}
            </Link>
          )}

          <span className="text-pen-subtle/40">·</span>
          <span className="shrink-0 font-sans text-[10.5px] font-semibold" style={{ color: priorityColor }}>
            {item.ticket.priority}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-pen-surface px-1.5 py-px font-sans text-[10.5px] text-pen-muted">
            <span className="size-[4px] rounded-full bg-current opacity-50" />
            {item.ticket.status}
          </span>
          {item.ticket.projectName && (
            <>
              <span className="text-pen-subtle/40">·</span>
              <span className="inline-flex shrink-0 items-center gap-1 font-sans text-[10.5px] text-pen-muted">
                <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: item.ticket.projectColor ?? "#94a3b8" }} />
                {item.ticket.projectName}
              </span>
            </>
          )}
          <span className="inline-flex shrink-0 items-center font-sans text-[10.5px] text-pen-subtle">
            · {item.ticket.subDepartmentName}
          </span>
        </div>

        {item.action === "COMMENT_ADDED" && item.metadata.body ? (
          <p className="mt-1 line-clamp-2 font-sans text-[11.5px] italic text-pen-subtle">
            <span className="not-italic text-pen-subtle/40">"</span>
            {String(item.metadata.body)}
            <span className="not-italic text-pen-subtle/40">"</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({
  totalMembers, totalTickets, countByAction, showMemberStats = true,
}: {
  totalMembers: number;
  totalTickets: number;
  countByAction: Record<string, number>;
  showMemberStats?: boolean;
}) {
  const topStats = (["STATUS_CHANGED", "COMMENT_ADDED", "ASSIGNED", "ATTACHMENT_ADDED"] as ActivityAction[]).map(
    (a) => ({ action: a, count: countByAction[a] ?? 0, meta: ACTION_META[a] }),
  );

  return (
    <div className={cn(
      "grid gap-px overflow-hidden rounded-xl border border-pen-card-border bg-pen-card-border",
      showMemberStats ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-5",
    )}>
      {showMemberStats ? (
        <div className="flex flex-col gap-0.5 bg-pen-card px-4 py-3">
          <p className="font-sans text-[10.5px] font-medium uppercase tracking-wide text-pen-subtle">Members</p>
          <p className="font-sans text-[22px] font-bold tabular-nums text-pen-foreground">{totalMembers}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5 bg-pen-card px-4 py-3">
        <p className="font-sans text-[10.5px] font-medium uppercase tracking-wide text-pen-subtle">Tasks</p>
        <p className="font-sans text-[22px] font-bold tabular-nums text-pen-foreground">{totalTickets}</p>
      </div>
      {topStats.map(({ action, count, meta }) => {
        const Icon = meta.icon;
        return (
          <div key={action} className="flex flex-col gap-0.5 bg-pen-card px-4 py-3">
            <p className="flex items-center gap-1 font-sans text-[10.5px] font-medium uppercase tracking-wide text-pen-subtle">
              <Icon className="size-3 shrink-0" style={{ color: meta.color }} />
              {meta.label}
            </p>
            <p className="font-sans text-[22px] font-bold tabular-nums" style={{ color: count > 0 ? meta.color : undefined }}>
              {count}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ActivityPage({
  initialItems,
  initialHasMore,
  initialCursor,
  users,
  projects,
  currentPreset,
  currentFrom,
  currentTo,
  currentCustomFrom,
  currentCustomTo,
  currentActorId,
  currentProjectId,
  currentAction,
  totalMembers,
  totalTickets,
  totalEvents,
  countByAction,
  canFilterByMember = true,
  ownActivityOnly = false,
}: {
  initialItems: ActivityItem[];
  initialHasMore: boolean;
  initialCursor: string | null;
  users: FilterUser[];
  projects: FilterProject[];
  currentPreset: RangePreset;
  currentFrom: string;
  currentTo: string;
  currentCustomFrom: string;
  currentCustomTo: string;
  currentActorId: string;
  currentProjectId: string;
  currentAction: string;
  totalMembers: number;
  totalTickets: number;
  totalEvents: number;
  countByAction: Record<string, number>;
  canFilterByMember?: boolean;
  ownActivityOnly?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Custom date input local state (not in URL until Apply is clicked)
  const [customFrom, setCustomFrom] = useState(currentCustomFrom || currentFrom.slice(0, 10));
  const [customTo,   setCustomTo]   = useState(currentCustomTo   || currentTo.slice(0, 10));

  // Client-side search (doesn't hit server)
  const [search, setSearch] = useState("");

  // Load more (client-side pagination appended to server results)
  const [extraItems, setExtraItems] = useState<ActivityItem[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  // Reset load-more state when server re-renders with new filters
  const prevCursor = useRef(initialCursor);
  if (prevCursor.current !== initialCursor) {
    prevCursor.current = initialCursor;
    setExtraItems([]);
    setHasMore(initialHasMore);
    setCursor(initialCursor);
  }

  // Single navigation helper — always builds a clean URL from all current state
  function navigate(overrides: Record<string, string>) {
    const merged = {
      preset:    currentPreset,
      actorId:   currentActorId,
      projectId: currentProjectId,
      action:    currentAction,
      ...overrides,
    };
    const p = new URLSearchParams();
    // Only add non-empty values
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v); });
    // For custom preset, preserve the URL-stored dates (props, not input state)
    // so changing actor/project/action doesn't silently reset the date range
    if (merged.preset === "custom") {
      const f = overrides.from ?? currentCustomFrom;
      const t = overrides.to   ?? currentCustomTo;
      if (f) p.set("from", f);
      if (t) p.set("to",   t);
    }
    startTransition(() => router.replace(`/activity?${p.toString()}`));
  }

  function onPresetChange(p: RangePreset) {
    if (p === "custom") {
      // Switch to custom — use current displayed range as initial dates for the inputs
      const from = currentCustomFrom || currentFrom.slice(0, 10);
      const to   = currentCustomTo   || currentTo.slice(0, 10);
      navigate({ preset: "custom", from, to });
    } else {
      navigate({ preset: p });
    }
  }

  function applyCustomRange() {
    if (!customFrom || !customTo || customFrom > customTo) return;
    navigate({ preset: "custom", from: customFrom, to: customTo });
  }

  function onActorChange(v: string)   { navigate({ actorId:   v }); }
  function onProjectChange(v: string) { navigate({ projectId: v }); }
  function onActionChange(v: string)  { navigate({ action:    v }); }

  function clearFilters() {
    setSearch("");
    navigate({ actorId: "", projectId: "", action: "" });
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const p = new URLSearchParams();
      if (currentFrom)    p.set("from",      currentFrom);
      if (currentTo)      p.set("to",        currentTo);
      if (currentActorId) p.set("actorId",   currentActorId);
      if (currentProjectId) p.set("projectId", currentProjectId);
      if (currentAction)  p.set("action",    currentAction);
      p.set("cursor", cursor);
      const res = await fetch(`/api/activity?${p.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setExtraItems((prev) => [...prev, ...data.items]);
      setHasMore(!!data.nextCursor);
      setCursor(data.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }

  const allItems = [...initialItems, ...extraItems];
  const hasActiveFilter = !!(
    (canFilterByMember && currentActorId) ||
    currentProjectId ||
    currentAction ||
    search
  );

  const filtered = search.trim()
    ? allItems.filter((i) =>
        i.ticket.title.toLowerCase().includes(search.toLowerCase()) ||
        i.ticket.humanId.toLowerCase().includes(search.toLowerCase()) ||
        i.actor.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.ticket.projectName ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : allItems;

  const GROUP_ORDER: TimeGroup[] = ["today", "yesterday", "this_week", "older"];
  const grouped = new Map<TimeGroup, ActivityItem[]>();
  for (const item of filtered) {
    const g = getTimeGroup(item.createdAt);
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(item);
  }
  const groups = GROUP_ORDER.map((k) => ({ key: k, items: grouped.get(k) ?? [] })).filter((g) => g.items.length > 0);

  const userOptions    = [{ value: "", label: "All members"  }, ...users.map((u)    => ({ value: u.id, label: u.name }))];
  const projectOptions = [{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: p.name }))];

  return (
    <div className="h-full overflow-y-auto px-5 py-6 sm:px-8 lg:px-12">
      <PageHeader
        className="mb-5"
        title="Activity"
        icon={Activity}
        iconClassName="text-pen-blue"
        description={
          ownActivityOnly
            ? "Your recorded activity on tickets in this department"
            : "Every recorded movement across tickets, members, and projects in this department"
        }
      />

      {/* Time range bar */}
      <div className={cn("mb-4 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3 transition-opacity", isPending && "opacity-60")}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0 text-pen-subtle" />
            <span className="font-sans text-[11.5px] font-medium text-pen-muted">Range</span>
          </div>

          {/* Preset pills */}
          <div className="flex gap-0.5 rounded-lg border border-pen-card-border bg-pen-surface p-0.5">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={isPending}
                onClick={() => onPresetChange(p.id)}
                className={cn(
                  "rounded-md px-3 py-1 font-sans text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed",
                  currentPreset === p.id
                    ? "bg-pen-blue text-white shadow-sm dark:text-gray-900"
                    : "text-pen-muted hover:text-pen-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          {currentPreset === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-id"
              />
              <span className="font-sans text-[11.5px] text-pen-subtle">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-id"
              />
              <button
                type="button"
                onClick={applyCustomRange}
                disabled={!customFrom || !customTo || isPending}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-pen-blue px-3 font-sans text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 dark:text-gray-900"
              >
                Apply
              </button>
            </div>
          )}

          {/* Range label + loading indicator */}
          <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-pen-surface px-3 py-1.5">
            {isPending
              ? <Loader2 className="size-3 animate-spin text-pen-subtle" />
              : <Clock className="size-3 shrink-0 text-pen-subtle" />
            }
            <span className="font-sans text-[11.5px] text-pen-muted">
              {formatActivityRangeLabel(new Date(currentFrom), new Date(currentTo))}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      {(totalMembers > 0 || totalTickets > 0) && !isPending && (
        <div className="mb-5">
          <StatsBar
            totalMembers={totalMembers}
            totalTickets={totalTickets}
            countByAction={countByAction}
            showMemberStats={canFilterByMember}
          />
        </div>
      )}

      {/* Other filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="size-3.5 shrink-0 text-pen-subtle" />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets, members…"
            className="h-8 w-48 rounded-lg border border-pen-card-border bg-pen-card pl-8 pr-3 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
          />
        </div>

        {canFilterByMember ? (
          <SearchableSelect
            aria-label="Filter by member"
            value={currentActorId}
            onChange={onActorChange}
            options={userOptions}
            icon={User}
            disabled={isPending}
            searchPlaceholder="Search members…"
            size="sm"
            highlightWhenSet
            className="max-w-[220px] w-auto"
          />
        ) : null}
        <SearchableSelect
          aria-label="Filter by project"
          value={currentProjectId}
          onChange={onProjectChange}
          options={projectOptions}
          icon={Folder}
          disabled={isPending}
          searchPlaceholder="Search projects…"
          size="sm"
          highlightWhenSet
          className="max-w-[220px] w-auto"
        />
        <SearchableSelect
          aria-label="Filter by action"
          value={currentAction}
          onChange={onActionChange}
          options={ACTION_FILTER_OPTIONS}
          icon={Zap}
          disabled={isPending}
          searchPlaceholder="Search actions…"
          size="sm"
          highlightWhenSet
          className="max-w-[220px] w-auto"
        />

        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearFilters}
            disabled={isPending}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-pen-card-border bg-pen-card px-3 font-sans text-[12px] text-pen-muted transition-colors hover:text-pen-foreground disabled:opacity-50"
          >
            <X className="size-3" /> Clear
          </button>
        )}

        <span className="ml-auto font-sans text-[11.5px] text-pen-subtle">
          {isPending ? "Loading…" : `${totalEvents} event${totalEvents !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Feed — loading overlay while navigating */}
      <div className={cn("relative transition-opacity duration-150", isPending && "pointer-events-none opacity-40")}>
        {isPending && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-16">
            <div className="flex items-center gap-2 rounded-xl border border-pen-card-border bg-pen-card px-4 py-2.5 shadow-md">
              <Loader2 className="size-4 animate-spin text-pen-id" />
              <span className="font-sans text-[12.5px] font-medium text-pen-foreground">Loading activity…</span>
            </div>
          </div>
        )}

        {filtered.length === 0 && !isPending ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl border border-pen-card-border bg-pen-card">
              <Activity className="size-5 text-pen-subtle" strokeWidth={1.2} />
            </div>
            <div>
              <p className="font-sans text-[13px] font-semibold text-pen-foreground">No activity found</p>
              <p className="mt-0.5 font-sans text-[12px] text-pen-muted">
                {hasActiveFilter ? "Try clearing your filters." : "No activity recorded in this time range."}
              </p>
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1.5 rounded-lg border border-pen-card-border bg-pen-card px-3 py-1.5 font-sans text-[12px] text-pen-muted transition-colors hover:text-pen-foreground"
              >
                <X className="size-3" /> Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map(({ key, items: groupItems }) => (
              <div key={key} className="flex flex-col">
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.8px] text-pen-subtle">
                    {GROUP_LABELS[key]}
                  </span>
                  <span className="font-sans text-[11px] text-pen-subtle/60">({groupItems.length})</span>
                  <div className="h-px flex-1 bg-pen-card-border/50" />
                </div>
                <div className="divide-y divide-pen-card-border/60 overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
                  {groupItems.map((item) => (
                    <div key={item.id} className="px-4 transition-colors hover:bg-pen-surface/40">
                      <ActivityRow item={item} />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {hasMore && (
              <div className="flex justify-center pb-4">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore || isPending}
                  className="flex items-center gap-2 rounded-xl border border-pen-card-border bg-pen-card px-5 py-2.5 font-sans text-[12.5px] font-medium text-pen-muted transition-colors hover:border-pen-id/30 hover:text-pen-foreground disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 className="size-3.5 animate-spin" /> : <Clock className="size-3.5" />}
                  {loadingMore ? "Loading…" : "Load more activity"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
