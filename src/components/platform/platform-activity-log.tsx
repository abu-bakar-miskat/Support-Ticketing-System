"use client";

import { useEffect, useMemo, useState } from "react";
import {
  History,
  ChevronDown,
  RotateCw,
  Plus,
  Minus,
  Pencil,
  Trash2,
  UserPlus,
  UserMinus,
  Ban,
  ToggleLeft,
  ToggleRight,
  Search,
  SlidersHorizontal,
  Loader2,
  Building2,
  CalendarDays,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

// Every targetType string currently written via lib/audit-log.ts recordAuditEvent.
const TARGET_TYPES = [
  "Agreement",
  "AgreementDocument",
  "AssignmentRule",
  "DepartmentManager",
  "EmailTemplate",
  "FeatureFlag",
  "Profile",
  "SlaPolicy",
  "Tenant",
  "TenantTemplate",
  "TemplateRequest",
] as const;

const ALL_OPTION = "__all__";

type TenantOption = { id: string; name: string; slug: string };
type ActorOption = { id: string; name: string | null; email: string };

// ── Date range presets ──────────────────────────────────────────────────────
// Mirrors the department activity feed. "all" applies no bound; the others feed
// server-side `from`/`to` filters so counts/pagination reflect the full range.

type RangePreset = "all" | "today" | "7d" | "30d" | "custom";
const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "custom", label: "Custom" },
];

/** Resolve a preset (or custom dates) to inclusive ISO `from`/`to` bounds. */
function resolveRange(
  preset: RangePreset,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
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

type AuditEvent = {
  id: string;
  actorId: string;
  actor: { id: string; name: string | null; email: string } | null;
  tenant: { id: string; name: string } | null;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
};

// ── Action semantics ───────────────────────────────────────────────────────────
// Audit actions follow a `TARGET_VERB` shape (SLA_POLICY_CREATED, FEATURE_FLAG_
// DISABLED, …). The trailing verb drives the icon + colour so new actions get a
// sensible badge for free.

const VERB_META: Record<string, { icon: LucideIcon; color: string }> = {
  CREATED: { icon: Plus, color: "#059669" },
  ADDED: { icon: Plus, color: "#059669" },
  GRANTED: { icon: UserPlus, color: "#059669" },
  ENABLED: { icon: ToggleRight, color: "#059669" },
  RESTORED: { icon: RotateCw, color: "#059669" },
  REACTIVATED: { icon: RotateCw, color: "#059669" },
  UPDATED: { icon: Pencil, color: "#0a76b9" },
  DELETED: { icon: Trash2, color: "#dc2626" },
  REMOVED: { icon: Minus, color: "#dc2626" },
  REVOKED: { icon: UserMinus, color: "#dc2626" },
  DISABLED: { icon: ToggleLeft, color: "#dc2626" },
  SUSPENDED: { icon: Ban, color: "#f97316" },
};
const FALLBACK_META = { icon: History, color: "#64748b" };

// Words kept upper-case when a raw action is turned into a readable phrase.
const ACRONYMS = new Set(["SLA", "QA", "PR"]);

function actionMeta(action: string) {
  const verb = action.split("_").pop() ?? "";
  return VERB_META[verb] ?? FALLBACK_META;
}

/** "FEATURE_FLAG_DISABLED" → "disabled feature flag" */
function humanizeAction(action: string): string {
  const parts = action.split("_");
  if (parts.length === 0) return action.toLowerCase();
  const verb = parts[parts.length - 1].toLowerCase();
  const target = parts
    .slice(0, -1)
    .map((w) => (ACRONYMS.has(w) ? w : w.toLowerCase()))
    .join(" ");
  return target ? `${verb} ${target}` : verb;
}

// ── Time grouping (mirrors the department activity feed) ───────────────────────

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

// ── Event row ──────────────────────────────────────────────────────────────────

function EventRow({ event, showTenant }: { event: AuditEvent; showTenant: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const meta = actionMeta(event.action);
  const Icon = meta.icon;
  const hasDetails = event.before != null || event.after != null;
  const actorName = event.actor?.name ?? event.actor?.email ?? "System";
  const now = new Date();

  return (
    <div className="px-4 transition-colors hover:bg-sts-surface/40">
      <div className="group flex items-start gap-3.5 py-3">
        <div className="relative mt-0.5 shrink-0">
          <UserAvatar name={actorName} avatarUrl={null} size={30} />
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
            <span className="shrink-0 font-sans text-[12px] text-sts-muted">{humanizeAction(event.action)}</span>
            <span className="ml-auto shrink-0 font-sans text-[11px] text-sts-subtle">
              {timeAgo(new Date(event.createdAt), now)}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {showTenant && event.tenant && (
              <>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sts-surface px-2 py-0.5 font-sans text-[10.5px] font-medium text-sts-muted">
                  <Building2 className="size-2.5 shrink-0" />
                  {event.tenant.name}
                </span>
                <span className="text-sts-subtle/40">·</span>
              </>
            )}
            <span className="inline-flex shrink-0 items-center rounded-md bg-sts-surface px-2 py-0.5 font-mono text-[10.5px] font-semibold text-sts-id">
              {event.targetType}
            </span>
            <span className="min-w-0 max-w-[280px] truncate font-mono text-[10.5px] text-sts-subtle">{event.targetId}</span>

            {hasDetails && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-sts-muted transition-colors hover:bg-sts-surface hover:text-sts-foreground"
              >
                <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
                {expanded ? "Hide changes" : "View changes"}
              </button>
            )}
          </div>

          {expanded && hasDetails && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {event.before != null && (
                <div>
                  <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wide text-sts-subtle">Before</p>
                  <pre className="overflow-x-auto rounded-lg border border-sts-card-border bg-sts-surface p-2.5 font-mono text-[11px] leading-relaxed text-sts-muted">
                    {JSON.stringify(event.before, null, 2)}
                  </pre>
                </div>
              )}
              {event.after != null && (
                <div>
                  <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wide text-sts-subtle">After</p>
                  <pre className="overflow-x-auto rounded-lg border border-sts-card-border bg-sts-surface p-2.5 font-mono text-[11px] leading-relaxed text-sts-muted">
                    {JSON.stringify(event.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export function PlatformActivityLog({
  tenants,
  actors,
}: {
  tenants: TenantOption[];
  actors: ActorOption[];
}) {
  // Default to "All tenants" ("") so the log is never blank just because the
  // first-alphabetical tenant happens to have no audit events.
  const [tenantId, setTenantId] = useState<string>("");
  const [targetType, setTargetType] = useState<string>("");
  const [actorId, setActorId] = useState<string>("");
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const showTenant = tenantId === "";
  const selectedTenant = tenants.find((t) => t.id === tenantId);
  const selectedActor = actors.find((a) => a.id === actorId);

  // "custom" only takes effect once both ends are set; otherwise it applies no
  // bound (same as "all"), so the feed never blanks while a date is half-typed.
  const { from, to } = resolveRange(preset, customFrom, customTo);

  async function fetchPage(after: string | null) {
    const params = new URLSearchParams({ take: "50" });
    if (tenantId) params.set("tenantId", tenantId);
    if (targetType) params.set("targetType", targetType);
    if (actorId) params.set("actorId", actorId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (after) params.set("cursor", after);
    const res = await fetch(`/api/admin/audit-events?${params}`);
    if (!res.ok) throw new Error("Failed to load activity");
    return res.json() as Promise<{ events: AuditEvent[]; nextCursor: string | null }>;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPage(null);
        if (cancelled) return;
        setEvents(data.events);
        setCursor(data.nextCursor);
      } catch {
        if (!cancelled) setError("Failed to load activity");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, targetType, actorId, from, to, refreshKey]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(cursor);
      setEvents((prev) => [...prev, ...data.events]);
      setCursor(data.nextCursor);
    } catch {
      setError("Failed to load more activity");
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      humanizeAction(e.action).includes(q) ||
      e.action.toLowerCase().includes(q) ||
      e.targetType.toLowerCase().includes(q) ||
      e.targetId.toLowerCase().includes(q) ||
      (e.tenant?.name ?? "").toLowerCase().includes(q) ||
      (e.actor?.name ?? e.actor?.email ?? "").toLowerCase().includes(q),
    );
  }, [events, search]);

  const groups = useMemo(() => {
    const order: TimeGroup[] = ["today", "yesterday", "this_week", "older"];
    const map = new Map<TimeGroup, AuditEvent[]>();
    for (const e of filtered) {
      const g = getTimeGroup(e.createdAt);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(e);
    }
    return order.map((k) => ({ key: k, items: map.get(k) ?? [] })).filter((g) => g.items.length > 0);
  }, [filtered]);

  const hasActiveFilter = !!(tenantId || targetType || actorId || preset !== "all" || search);

  function clearFilters() {
    setSearch("");
    setTenantId("");
    setTargetType("");
    setActorId("");
    setPreset("all");
    setCustomFrom("");
    setCustomTo("");
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-6 sm:px-8 lg:px-12">
      <PageHeader
        className="mb-5"
        icon={History}
        iconClassName="text-sts-blue"
        title="Activity Log"
        description="Full audit history of Super Admin and tenant-admin actions — feature flags, tenant lifecycle, agreements, templates, and more."
      />

      {/* Filter bar */}
      <div className={cn("mb-5 rounded-xl border border-sts-card-border bg-sts-card px-4 py-3 transition-opacity", loading && "opacity-60")}>
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="size-3.5 shrink-0 text-sts-subtle" />

          <Select
            value={tenantId || ALL_OPTION}
            onValueChange={(v) => setTenantId(v === ALL_OPTION ? "" : v ?? "")}
          >
            <SelectTrigger className="h-8 w-[200px]">
              <span className="truncate font-sans text-[12px]">{selectedTenant?.name ?? "All tenants"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OPTION} className="font-sans text-[12px]">
                All tenants
              </SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id} className="font-sans text-[12px]">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={targetType || ALL_OPTION} onValueChange={(v) => setTargetType(v === ALL_OPTION ? "" : v ?? "")}>
            <SelectTrigger className="h-8 w-[180px]">
              <span className="truncate font-sans text-[12px]">{targetType || "All target types"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OPTION} className="font-sans text-[12px]">
                All target types
              </SelectItem>
              {TARGET_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="font-sans text-[12px]">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={actorId || ALL_OPTION} onValueChange={(v) => setActorId(v === ALL_OPTION ? "" : v ?? "")}>
            <SelectTrigger className="h-8 w-[180px]">
              <span className="flex min-w-0 items-center gap-1.5 truncate font-sans text-[12px]">
                <Users className="size-3 shrink-0 text-sts-subtle" />
                <span className="truncate">{selectedActor ? (selectedActor.name ?? selectedActor.email) : "All actors"}</span>
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OPTION} className="font-sans text-[12px]">
                All actors
              </SelectItem>
              {actors.map((a) => (
                <SelectItem key={a.id} value={a.id} className="font-sans text-[12px]">
                  {a.name ?? a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sts-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actions, actors…"
              className="h-8 w-[220px] rounded-lg border border-sts-card-border bg-sts-surface pl-8 pr-2.5 font-sans text-[12px] text-sts-foreground outline-none placeholder:text-sts-subtle focus:border-sts-id"
            />
          </div>

          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-sts-card-border bg-sts-surface px-3 font-sans text-[12px] font-medium text-sts-muted transition-colors hover:text-sts-foreground disabled:opacity-50"
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

          <div className="flex gap-0.5 rounded-lg border border-sts-card-border bg-sts-surface p-0.5">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={loading}
                onClick={() => setPreset(p.id)}
                className={cn(
                  "rounded-md px-3 py-1 font-sans text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed",
                  preset === p.id
                    ? "bg-sts-blue text-white shadow-sm dark:text-gray-900"
                    : "text-sts-muted hover:text-sts-foreground",
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
          <span className="font-sans text-[12.5px] font-medium text-sts-muted">Loading activity…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl border border-sts-card-border bg-sts-card">
            <History className="size-5 text-sts-subtle" strokeWidth={1.2} />
          </div>
          <div>
            <p className="font-sans text-[13px] font-semibold text-sts-foreground">No activity found</p>
            <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
              {hasActiveFilter ? "Try clearing your filters." : "No audited actions have been recorded yet."}
            </p>
          </div>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-lg border border-sts-card-border bg-sts-card px-3 py-1.5 font-sans text-[12px] text-sts-muted transition-colors hover:text-sts-foreground"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(({ key, items }) => (
            <div key={key} className="flex flex-col">
              <div className="mb-2 flex items-center gap-2.5">
                <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.8px] text-sts-subtle">
                  {GROUP_LABELS[key]}
                </span>
                <span className="font-sans text-[11px] text-sts-subtle/60">({items.length})</span>
                <div className="h-px flex-1 bg-sts-card-border/50" />
              </div>
              <div className="divide-y divide-sts-card-border/60 overflow-hidden rounded-xl border border-sts-card-border bg-sts-card">
                {items.map((e) => (
                  <EventRow key={e.id} event={e} showTenant={showTenant} />
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
                className="flex items-center gap-2 rounded-xl border border-sts-card-border bg-sts-card px-5 py-2.5 font-sans text-[12.5px] font-medium text-sts-muted transition-colors hover:border-sts-id/30 hover:text-sts-foreground disabled:opacity-50"
              >
                {loadingMore ? <Loader2 className="size-3.5 animate-spin" /> : <History className="size-3.5" />}
                {loadingMore ? "Loading…" : "Load more activity"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
