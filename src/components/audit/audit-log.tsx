"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  Clock,
  Folder,
  History,
  Layers,
  Loader2,
  RotateCw,
  Search,
  SlidersHorizontal,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { timeAgo } from "@/lib/format";
import {
  ACTION_META,
  ACTION_FILTER_OPTIONS,
  FALLBACK_ACTION_META,
  PRIORITY_COLOR,
  describeTicketAction,
  type ActivityAction,
} from "@/components/audit/ticket-action-meta";
import { adminActionMeta, humanizeAction, ChangeDiff } from "@/components/audit/admin-action-meta";
import { auditTargetTypeLabel } from "@/lib/audit-display";
import type { AuditLogEntry, AuditScopeKind, AuditFilterOption } from "@/lib/audit-log-types";

// ── Date range presets ──────────────────────────────────────────────────────

type RangePreset = "all" | "today" | "7d" | "30d" | "custom";
const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "custom", label: "Custom" },
];

function resolveRange(preset: RangePreset, customFrom: string, customTo: string): { from: string; to: string } {
  if (preset === "all") return { from: "", to: "" };
  if (preset === "custom") {
    return {
      from: customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : "",
      to: customTo ? new Date(`${customTo}T23:59:59.999`).toISOString() : "",
    };
  }
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "7d") start.setDate(start.getDate() - 6);
  if (preset === "30d") start.setDate(start.getDate() - 29);
  return { from: start.toISOString(), to: now.toISOString() };
}

const SOURCE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "ticket", label: "Ticket activity" },
  { value: "admin", label: "Admin & settings" },
];

// ── Time grouping ─────────────────────────────────────────────────────────────

type TimeGroup = "today" | "yesterday" | "this_week" | "older";
const GROUP_LABELS: Record<TimeGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  older: "Older",
};

function getTimeGroup(createdAt: string): TimeGroup {
  const now = new Date();
  const date = new Date(createdAt);
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.floor((nowDay.getTime() - itemDay.getTime()) / 86400000);
  if (dayDiff === 0) return "today";
  if (dayDiff === 1) return "yesterday";
  if (dayDiff < 7) return "this_week";
  return "older";
}

// ── Context chips (tenant / department) ────────────────────────────────────────

function ScopeChips({ entry, showTenant, showDepartment }: { entry: AuditLogEntry; showTenant: boolean; showDepartment: boolean }) {
  return (
    <>
      {showTenant && entry.tenant && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sts-surface px-2 py-0.5 font-sans text-[10.5px] font-medium text-sts-muted">
          <Building2 className="size-2.5 shrink-0" />
          {entry.tenant.name}
        </span>
      )}
      {showDepartment && entry.department && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sts-surface px-2 py-0.5 font-sans text-[10.5px] font-medium text-sts-muted">
          <Layers className="size-2.5 shrink-0" />
          {entry.department.name}
        </span>
      )}
    </>
  );
}

// ── Rows ────────────────────────────────────────────────────────────────────────

function TicketRow({ entry, showTenant, showDepartment }: { entry: AuditLogEntry; showTenant: boolean; showDepartment: boolean }) {
  const action = entry.action as ActivityAction;
  const meta = ACTION_META[action] ?? FALLBACK_ACTION_META;
  const Icon = meta.icon;
  const metadata = entry.metadata ?? {};
  const desc = describeTicketAction(action, metadata);
  const t = entry.ticket!;
  const priorityColor = PRIORITY_COLOR[t.priority] ?? "#94a3b8";
  const isDeleted = action === "TICKET_DELETED";
  const isAutomation = metadata.source === "github";
  const actorName = isAutomation ? "PR merge" : entry.actor?.name ?? "System";
  const actorAvatarUrl = isAutomation ? null : entry.actor?.avatarUrl ?? null;

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
          <span className="ml-auto shrink-0 font-sans text-[11px] text-sts-subtle">{timeAgo(new Date(entry.createdAt), new Date())}</span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <ScopeChips entry={entry} showTenant={showTenant} showDepartment={showDepartment} />
          {isDeleted ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-red-500">
              {t.humanId}
            </span>
          ) : (
            <Link
              href={`/tickets/${t.id}`}
              className="inline-flex items-center gap-1 rounded-full bg-sts-surface px-2 py-0.5 font-mono text-[10.5px] font-semibold text-sts-id transition-colors hover:bg-sts-blue-tint"
            >
              {t.humanId}
            </Link>
          )}

          {isDeleted ? (
            <span className="min-w-0 max-w-[280px] truncate font-sans text-[12px] text-sts-muted/60 line-through">{t.title}</span>
          ) : (
            <Link
              href={`/tickets/${t.id}`}
              className="min-w-0 max-w-[280px] truncate font-sans text-[12px] font-medium text-sts-foreground hover:text-sts-id hover:underline"
            >
              {t.title}
            </Link>
          )}

          <span className="text-sts-subtle/40">·</span>
          <span className="shrink-0 font-sans text-[10.5px] font-semibold" style={{ color: priorityColor }}>
            {t.priority}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-sts-surface px-1.5 py-px font-sans text-[10.5px] text-sts-muted">
            <span className="size-[4px] rounded-full bg-current opacity-50" />
            {t.status}
          </span>
          {t.projectName && (
            <>
              <span className="text-sts-subtle/40">·</span>
              <span className="inline-flex shrink-0 items-center gap-1 font-sans text-[10.5px] text-sts-muted">
                <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: t.projectColor ?? "#94a3b8" }} />
                {t.projectName}
              </span>
            </>
          )}
          <span className="inline-flex shrink-0 items-center font-sans text-[10.5px] text-sts-subtle">· {t.subDepartmentName}</span>
        </div>

        {action === "COMMENT_ADDED" && metadata.body ? (
          <p className="mt-1 line-clamp-2 font-sans text-[11.5px] italic text-sts-subtle">
            <span className="not-italic text-sts-subtle/40">&quot;</span>
            {String(metadata.body)}
            <span className="not-italic text-sts-subtle/40">&quot;</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AdminRow({ entry, showTenant, showDepartment }: { entry: AuditLogEntry; showTenant: boolean; showDepartment: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const meta = adminActionMeta(entry.action);
  const Icon = meta.icon;
  const hasDetails = entry.before != null || entry.after != null;
  const actorName = entry.actor?.name ?? "System";
  const target = entry.target!;

  return (
    <div className="group flex items-start gap-3.5 py-3">
      <div className="relative mt-0.5 shrink-0">
        <UserAvatar name={actorName} avatarUrl={entry.actor?.avatarUrl ?? null} size={30} />
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
          <span className="shrink-0 font-sans text-[12px] text-sts-muted">{humanizeAction(entry.action)}</span>
          <span className="ml-auto shrink-0 font-sans text-[11px] text-sts-subtle">{timeAgo(new Date(entry.createdAt), new Date())}</span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <ScopeChips entry={entry} showTenant={showTenant} showDepartment={showDepartment} />
          <span className="inline-flex shrink-0 items-center rounded-md bg-sts-surface px-2 py-0.5 font-sans text-[10.5px] font-semibold text-sts-id">
            {auditTargetTypeLabel(target.type)}
          </span>
          {target.name ? (
            <span
              className="inline-flex min-w-0 max-w-[280px] items-center gap-1 truncate font-sans text-[11px] font-medium text-sts-foreground"
              title={`${target.name} · ${target.id}`}
            >
              <Users className="size-2.5 shrink-0 text-sts-subtle" />
              <span className="truncate">{target.name}</span>
            </span>
          ) : (
            <span className="min-w-0 max-w-[280px] truncate font-mono text-[10.5px] text-sts-subtle">{target.id}</span>
          )}

          {hasDetails && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-sts-muted transition-colors hover:bg-sts-surface hover:text-sts-foreground"
            >
              <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Hide changes" : "View changes"}
            </button>
          )}
        </div>

        {expanded && hasDetails && (
          <div className="mt-2">
            <ChangeDiff before={entry.before} after={entry.after} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AuditLog({
  scope,
  title = "Audit Log",
  description,
  actors = [],
  departments = [],
  tenants = [],
}: {
  scope: AuditScopeKind;
  title?: string;
  description?: string;
  actors?: AuditFilterOption[];
  departments?: AuditFilterOption[];
  tenants?: AuditFilterOption[];
}) {
  const isPlatform = scope === "platform";

  const [source, setSource] = useState("");
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const showTenant = isPlatform && tenantId === "";
  const showDepartment = departmentId === "" && (isPlatform || departments.length > 1);

  const { from, to } = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo, refreshKey],
  );

  async function fetchPage(after: string | null) {
    const params = new URLSearchParams({ scope });
    if (source) params.set("source", source);
    if (action) params.set("action", action);
    if (actorId) params.set("actorId", actorId);
    if (tenantId) params.set("tenantId", tenantId);
    if (departmentId) params.set("departmentId", departmentId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (after) params.set("cursor", after);
    const res = await fetch(`/api/audit?${params}`);
    if (!res.ok) throw new Error("Failed to load audit log");
    return res.json() as Promise<{ entries: AuditLogEntry[]; nextCursor: string | null }>;
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPage(null);
        if (cancelled) return;
        setEntries(data.entries);
        setCursor(data.nextCursor);
      } catch {
        if (!cancelled) setError("Failed to load audit log");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, source, action, actorId, tenantId, departmentId, from, to, refreshKey]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(cursor);
      setEntries((prev) => [...prev, ...data.entries]);
      setCursor(data.nextCursor);
    } catch {
      setError("Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      e.action.toLowerCase().includes(q) ||
      (e.actor?.name ?? "").toLowerCase().includes(q) ||
      (e.ticket?.title ?? "").toLowerCase().includes(q) ||
      (e.ticket?.humanId ?? "").toLowerCase().includes(q) ||
      (e.target?.name ?? e.target?.id ?? "").toLowerCase().includes(q) ||
      (e.target?.type ?? "").toLowerCase().includes(q) ||
      (e.tenant?.name ?? "").toLowerCase().includes(q) ||
      (e.department?.name ?? "").toLowerCase().includes(q),
    );
  }, [entries, search]);

  const groups = useMemo(() => {
    const order: TimeGroup[] = ["today", "yesterday", "this_week", "older"];
    const map = new Map<TimeGroup, AuditLogEntry[]>();
    for (const e of filtered) {
      const g = getTimeGroup(e.createdAt);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(e);
    }
    return order.map((k) => ({ key: k, items: map.get(k) ?? [] })).filter((g) => g.items.length > 0);
  }, [filtered]);

  const hasActiveFilter = !!(
    source || action || actorId || tenantId || departmentId || preset !== "all" || search
  );

  function clearFilters() {
    setSource("");
    setAction("");
    setActorId("");
    setTenantId("");
    setDepartmentId("");
    setPreset("all");
    setCustomFrom("");
    setCustomTo("");
    setSearch("");
  }

  const sourceOptions = SOURCE_OPTIONS;
  const actorOptions = [{ value: "", label: "All actors" }, ...actors.map((a) => ({ value: a.id, label: a.name }))];
  // Platform: the department list follows the tenant filter. With no tenant
  // picked, every department shows with its tenant as a subtitle (names repeat
  // across tenants), and the tenant name is searchable.
  const tenantNameById = new Map(tenants.map((t) => [t.id, t.name]));
  const visibleDepartments = isPlatform && tenantId
    ? departments.filter((d) => d.tenantId === tenantId)
    : departments;
  const departmentOptions = [
    { value: "", label: "All departments" },
    ...visibleDepartments.map((d) => {
      const tenantName = isPlatform && !tenantId && d.tenantId ? tenantNameById.get(d.tenantId) : undefined;
      return { value: d.id, label: d.name, description: tenantName, keywords: tenantName ? [tenantName] : undefined };
    }),
  ];
  const tenantOptions = [{ value: "", label: "All tenants" }, ...tenants.map((t) => ({ value: t.id, label: t.name }))];
  // Distinguish from the source ("type") filter, which used to read "All actions" too.
  const actionOptions = ACTION_FILTER_OPTIONS.map((o) => (o.value === "" ? { ...o, label: "All ticket actions" } : o));

  function selectTenant(next: string) {
    setTenantId(next);
    // Drop a department that doesn't belong to the newly selected tenant.
    if (next && departmentId && departments.find((d) => d.id === departmentId)?.tenantId !== next) {
      setDepartmentId("");
    }
  }

  // Filter menus size to their longest option instead of the (narrow) trigger,
  // so labels aren't truncated.
  const filterMenuClass = "w-max min-w-[220px] max-w-[min(100vw-2rem,360px)]";

  return (
    <div className="h-full overflow-y-auto px-5 py-6 sm:px-8 lg:px-12">
      <PageHeader
        className="mb-5"
        title={title}
        icon={History}
        iconClassName="text-sts-blue"
        description={
          description ??
          (isPlatform
            ? "Every recorded action across all tenants and departments — tickets, members, roles, settings, and platform operations."
            : "Every recorded action in this department — ticket activity plus member, role, and settings changes.")
        }
      />

      {/* Filter bar */}
      <div className={cn("mb-4 rounded-xl border border-sts-card-border bg-sts-card px-4 py-3 transition-opacity", loading && "opacity-60")}>
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="size-3.5 shrink-0 text-sts-subtle" />

          <SearchableSelect
            aria-label="Filter by type"
            value={source}
            onChange={setSource}
            options={sourceOptions}
            icon={Zap}
            searchPlaceholder="Search types…"
            size="sm"
            highlightWhenSet
            className="max-w-[220px] w-auto"
            contentClassName={filterMenuClass}
          />

          {isPlatform && (
            <SearchableSelect
              aria-label="Filter by tenant"
              value={tenantId}
              onChange={selectTenant}
              options={tenantOptions}
              icon={Building2}
              searchPlaceholder="Search tenants…"
              size="sm"
              highlightWhenSet
              className="max-w-[220px] w-auto"
              contentClassName={filterMenuClass}
            />
          )}

          {(isPlatform || departments.length > 1) && (
            <SearchableSelect
              aria-label="Filter by department"
              value={departmentId}
              onChange={setDepartmentId}
              options={departmentOptions}
              icon={Layers}
              searchPlaceholder="Search departments…"
              emptyLabel={tenantId ? "No departments in this tenant" : "No matches"}
              size="sm"
              highlightWhenSet
              className="max-w-[220px] w-auto"
              contentClassName={filterMenuClass}
            />
          )}

          {actors.length > 0 && (
            <SearchableSelect
              aria-label="Filter by actor"
              value={actorId}
              onChange={setActorId}
              options={actorOptions}
              icon={User}
              searchPlaceholder="Search people…"
              size="sm"
              highlightWhenSet
              className="max-w-[220px] w-auto"
              contentClassName={filterMenuClass}
            />
          )}

          <SearchableSelect
            aria-label="Filter by ticket action"
            value={action}
            onChange={setAction}
            options={actionOptions}
            icon={Folder}
            searchPlaceholder="Search actions…"
            size="sm"
            highlightWhenSet
            className="max-w-[220px] w-auto"
            contentClassName={filterMenuClass}
          />

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sts-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-8 w-[180px] rounded-lg border border-sts-card-border bg-sts-surface pl-8 pr-2.5 font-sans text-[12px] text-sts-foreground outline-none placeholder:text-sts-subtle focus:border-sts-id"
            />
          </div>

          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-full border border-sts-card-border bg-sts-surface px-3 font-sans text-[12px] font-medium text-sts-muted transition-colors hover:text-sts-foreground disabled:opacity-50"
          >
            <RotateCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Date range */}
        <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-sts-card-border/50 pt-2.5">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0 text-sts-subtle" />
            <span className="font-sans text-[11.5px] font-medium text-sts-muted">Range</span>
          </div>

          <div className="flex gap-0.5 rounded-full border border-sts-card-border bg-sts-surface p-0.5">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={loading}
                onClick={() => setPreset(p.id)}
                className={cn(
                  "rounded-full px-3 py-1 font-sans text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed",
                  preset === p.id ? "bg-sts-blue text-white shadow-sm dark:text-gray-900" : "text-sts-muted hover:text-sts-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === "custom" && (
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
            </div>
          )}

          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto flex h-8 items-center gap-1.5 rounded-full border border-sts-card-border bg-sts-surface px-3 font-sans text-[12px] text-sts-muted transition-colors hover:text-sts-foreground"
            >
              <X className="size-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20">
          <Loader2 className="size-4 animate-spin text-sts-id" />
          <span className="font-sans text-[12.5px] font-medium text-sts-muted">Loading audit log…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl border border-sts-card-border bg-sts-card">
            <History className="size-5 text-sts-subtle" strokeWidth={1.2} />
          </div>
          <div>
            <p className="font-sans text-[13px] font-semibold text-sts-foreground">No entries found</p>
            <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
              {hasActiveFilter ? "Try clearing your filters." : "No actions have been recorded yet."}
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
          {groups.map(({ key, items }) => (
            <div key={key} className="flex flex-col">
              <div className="mb-2 flex items-center gap-2.5">
                <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.8px] text-sts-subtle">{GROUP_LABELS[key]}</span>
                <span className="font-sans text-[11px] text-sts-subtle/60">({items.length})</span>
                <div className="h-px flex-1 bg-sts-card-border/50" />
              </div>
              <div className="divide-y divide-sts-card-border/60 overflow-hidden rounded-xl border border-sts-card-border bg-sts-card">
                {items.map((entry) => (
                  <div key={entry.id} className="px-4 transition-colors hover:bg-sts-surface/40">
                    {entry.source === "ticket" && entry.ticket ? (
                      <TicketRow entry={entry} showTenant={showTenant} showDepartment={showDepartment} />
                    ) : (
                      <AdminRow entry={entry} showTenant={showTenant} showDepartment={showDepartment} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {cursor && (
            <div className="flex justify-center pb-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 rounded-full border border-sts-card-border bg-sts-card px-5 py-2.5 font-sans text-[12.5px] font-medium text-sts-muted transition-colors hover:border-sts-id/30 hover:text-sts-foreground disabled:opacity-50"
              >
                {loadingMore ? <Loader2 className="size-3.5 animate-spin" /> : <Clock className="size-3.5" />}
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
