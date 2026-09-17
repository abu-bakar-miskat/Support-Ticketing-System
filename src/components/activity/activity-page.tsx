"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  CalendarDays,
  Clock,
  Folder,
  Loader2,
  Search,
  SlidersHorizontal,
  User,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { formatActivityRangeLabel } from "@/lib/format";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  ACTION_META,
  ACTION_FILTER_OPTIONS,
  FALLBACK_ACTION_META,
  PRIORITY_COLOR,
  describeTicketAction,
  type ActivityAction,
} from "@/components/audit/ticket-action-meta";

// ── Types ─────────────────────────────────────────────────────────────────────

export type { ActivityAction };

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

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({ item }: { item: ActivityItem }) {
  const meta = ACTION_META[item.action] ?? FALLBACK_ACTION_META;
  const Icon = meta.icon;
  const desc = describeTicketAction(item.action, item.metadata);
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
          className="absolute -bottom-1 -right-1 flex size-[14px] items-center justify-center rounded-full border-[1.5px] border-sts-card"
          style={{ backgroundColor: meta.color }}
        >
          <Icon className="size-[7px] text-white" strokeWidth={2.5} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="shrink-0 font-sans text-[12.5px] font-semibold text-sts-foreground">{actorName}</span>
          <span className="shrink-0 font-sans text-[12px] text-sts-muted">{desc}</span>
          <span className="ml-auto shrink-0 font-sans text-[11px] text-sts-subtle">{item.time}</span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {isDeleted ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-red-500">
              {item.ticket.humanId}
            </span>
          ) : (
            <Link
              href={`/tickets/${item.ticket.id}`}
              className="inline-flex items-center gap-1 rounded-full bg-sts-surface px-2 py-0.5 font-mono text-[10.5px] font-semibold text-sts-id transition-colors hover:bg-sts-blue-tint"
            >
              {item.ticket.humanId}
            </Link>
          )}

          {isDeleted ? (
            <span className="min-w-0 max-w-[280px] truncate font-sans text-[12px] text-sts-muted/60 line-through">{item.ticket.title}</span>
          ) : (
            <Link
              href={`/tickets/${item.ticket.id}`}
              className="min-w-0 max-w-[280px] truncate font-sans text-[12px] font-medium text-sts-foreground hover:text-sts-id hover:underline"
            >
              {item.ticket.title}
            </Link>
          )}

          <span className="text-sts-subtle/40">·</span>
          <span className="shrink-0 font-sans text-[10.5px] font-semibold" style={{ color: priorityColor }}>
            {item.ticket.priority}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-sts-surface px-1.5 py-px font-sans text-[10.5px] text-sts-muted">
            <span className="size-[4px] rounded-full bg-current opacity-50" />
            {item.ticket.status}
          </span>
          {item.ticket.projectName && (
            <>
              <span className="text-sts-subtle/40">·</span>
              <span className="inline-flex shrink-0 items-center gap-1 font-sans text-[10.5px] text-sts-muted">
                <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: item.ticket.projectColor ?? "#94a3b8" }} />
                {item.ticket.projectName}
              </span>
            </>
          )}
          <span className="inline-flex shrink-0 items-center font-sans text-[10.5px] text-sts-subtle">
            · {item.ticket.subDepartmentName}
          </span>
        </div>

        {item.action === "COMMENT_ADDED" && item.metadata.body ? (
          <p className="mt-1 line-clamp-2 font-sans text-[11.5px] italic text-sts-subtle">
            <span className="not-italic text-sts-subtle/40">"</span>
            {String(item.metadata.body)}
            <span className="not-italic text-sts-subtle/40">"</span>
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
      "grid gap-px overflow-hidden rounded-xl border border-sts-card-border bg-sts-card-border",
      showMemberStats ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-5",
    )}>
      {showMemberStats ? (
        <div className="flex flex-col gap-0.5 bg-sts-card px-4 py-3">
          <p className="font-sans text-[10.5px] font-medium uppercase tracking-wide text-sts-subtle">Members</p>
          <p className="font-sans text-[22px] font-bold tabular-nums text-sts-foreground">{totalMembers}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5 bg-sts-card px-4 py-3">
        <p className="font-sans text-[10.5px] font-medium uppercase tracking-wide text-sts-subtle">Tasks</p>
        <p className="font-sans text-[22px] font-bold tabular-nums text-sts-foreground">{totalTickets}</p>
      </div>
      {topStats.map(({ action, count, meta }) => {
        const Icon = meta.icon;
        return (
          <div key={action} className="flex flex-col gap-0.5 bg-sts-card px-4 py-3">
            <p className="flex items-center gap-1 font-sans text-[10.5px] font-medium uppercase tracking-wide text-sts-subtle">
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
  basePath = "/activity",
  scope = "",
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
  /** Route this feed navigates to on filter changes. Defaults to /activity. */
  basePath?: string;
  /** Activity scope for Load-more (passed through to /api/activity). "" = active dept. */
  scope?: string;
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
    startTransition(() => router.replace(`${basePath}?${p.toString()}`));
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
      if (scope)          p.set("scope",     scope);
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
        iconClassName="text-sts-blue"
        description={
          ownActivityOnly
            ? "Your recorded activity on tickets in this department"
            : "Every recorded movement across tickets, members, and projects in this department"
        }
      />

      {/* Time range bar */}
      <div className={cn("mb-4 rounded-xl border border-sts-card-border bg-sts-card px-4 py-3 transition-opacity", isPending && "opacity-60")}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0 text-sts-subtle" />
            <span className="font-sans text-[11.5px] font-medium text-sts-muted">Range</span>
          </div>

          {/* Preset pills */}
          <div className="flex gap-0.5 rounded-full border border-sts-card-border bg-sts-surface p-0.5">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={isPending}
                onClick={() => onPresetChange(p.id)}
                className={cn(
                  "rounded-full px-3 py-1 font-sans text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed",
                  currentPreset === p.id
                    ? "bg-sts-blue text-white shadow-sm dark:text-gray-900"
                    : "text-sts-muted hover:text-sts-foreground",
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
                className="h-8 rounded-lg border border-sts-card-border bg-sts-surface px-2.5 font-sans text-[12px] text-sts-foreground outline-none focus:border-sts-id"
              />
              <span className="font-sans text-[11.5px] text-sts-subtle">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 rounded-lg border border-sts-card-border bg-sts-surface px-2.5 font-sans text-[12px] text-sts-foreground outline-none focus:border-sts-id"
              />
              <button
                type="button"
                onClick={applyCustomRange}
                disabled={!customFrom || !customTo || isPending}
                className="flex h-8 items-center gap-1.5 rounded-full bg-sts-blue px-3 font-sans text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 dark:text-gray-900"
              >
                Apply
              </button>
            </div>
          )}

          {/* Range label + loading indicator */}
          <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-sts-surface px-3 py-1.5">
            {isPending
              ? <Loader2 className="size-3 animate-spin text-sts-subtle" />
              : <Clock className="size-3 shrink-0 text-sts-subtle" />
            }
            <span className="font-sans text-[11.5px] text-sts-muted">
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
        <SlidersHorizontal className="size-3.5 shrink-0 text-sts-subtle" />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sts-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets, members…"
            className="h-8 w-48 rounded-lg border border-sts-card-border bg-sts-card pl-8 pr-3 font-sans text-[12px] text-sts-foreground outline-none placeholder:text-sts-subtle focus:border-sts-id"
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
            className="flex h-8 items-center gap-1.5 rounded-full border border-sts-card-border bg-sts-card px-3 font-sans text-[12px] text-sts-muted transition-colors hover:text-sts-foreground disabled:opacity-50"
          >
            <X className="size-3" /> Clear
          </button>
        )}

        <span className="ml-auto font-sans text-[11.5px] text-sts-subtle">
          {isPending ? "Loading…" : `${totalEvents} event${totalEvents !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Feed — loading overlay while navigating */}
      <div className={cn("relative transition-opacity duration-150", isPending && "pointer-events-none opacity-40")}>
        {isPending && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-16">
            <div className="flex items-center gap-2 rounded-xl border border-sts-card-border bg-sts-card px-4 py-2.5 shadow-md">
              <Loader2 className="size-4 animate-spin text-sts-id" />
              <span className="font-sans text-[12.5px] font-medium text-sts-foreground">Loading activity…</span>
            </div>
          </div>
        )}

        {filtered.length === 0 && !isPending ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl border border-sts-card-border bg-sts-card">
              <Activity className="size-5 text-sts-subtle" strokeWidth={1.2} />
            </div>
            <div>
              <p className="font-sans text-[13px] font-semibold text-sts-foreground">No activity found</p>
              <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
                {hasActiveFilter ? "Try clearing your filters." : "No activity recorded in this time range."}
              </p>
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1.5 rounded-full border border-sts-card-border bg-sts-card px-3 py-1.5 font-sans text-[12px] text-sts-muted transition-colors hover:text-sts-foreground"
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
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.8px] text-sts-subtle">
                    {GROUP_LABELS[key]}
                  </span>
                  <span className="font-sans text-[11px] text-sts-subtle/60">({groupItems.length})</span>
                  <div className="h-px flex-1 bg-sts-card-border/50" />
                </div>
                <div className="divide-y divide-sts-card-border/60 overflow-hidden rounded-xl border border-sts-card-border bg-sts-card">
                  {groupItems.map((item) => (
                    <div key={item.id} className="px-4 transition-colors hover:bg-sts-surface/40">
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
                  className="flex items-center gap-2 rounded-full border border-sts-card-border bg-sts-card px-5 py-2.5 font-sans text-[12.5px] font-medium text-sts-muted transition-colors hover:border-sts-id/30 hover:text-sts-foreground disabled:opacity-50"
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
