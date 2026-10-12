"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check, Clock, TicketCheck, Layers, ChartColumn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createTicketsSubscription } from "@/lib/realtime";
import { ScheduledReports } from "@/components/reports/scheduled-reports";
import { TicketPerformancePanel } from "@/components/reports/ticket-performance-panel";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange as DayPickerDateRange } from "react-day-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { useSubDepartmentTimeReport, useReportsOverview } from "@/hooks/queries/use-reports";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { ReportsExportMenu } from "@/components/time/reports-export-menu";
import type { StatCard, SubDepartmentMember, NamedCount, DistSlice } from "@/lib/api/reports";
import { formatCalendarDate } from "@/lib/ticket-datetime";
import { ReportsSectionsSkeleton } from "@/components/skeletons/page-skeletons";

const RANGE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "6m", label: "Last 6 months" },
  { id: "9m", label: "Last 9 months" },
  { id: "1y", label: "Last 1 year" },
] as const;

type PresetId = (typeof RANGE_PRESETS)[number]["id"];

function isoDate(d: Date): string {
  return formatCalendarDate(d);
}

function presetRange(id: PresetId): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (id === "today") {
    /* from/to stay on today */
  } else if (id === "7d") from.setDate(to.getDate() - 7);
  else if (id === "30d") from.setDate(to.getDate() - 30);
  else if (id === "6m") from.setMonth(to.getMonth() - 6);
  else if (id === "9m") from.setMonth(to.getMonth() - 9);
  else if (id === "1y") from.setFullYear(to.getFullYear() - 1);
  return { from: isoDate(from), to: isoDate(to) };
}

function formatRangeLabel(from: string, to: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(from)} – ${fmt(to)}`;
}

export type { StatCard, SubDepartmentMember };

// ── Sub-components ────────────────────────────────────────────────────────────

function ReportStatCard({
  label,
  value,
  detail,
  detailClassName,
  icon: Icon,
}: StatCard & { icon?: React.ElementType }) {
  return (
    <div className="rounded-xl border border-sts-card-border bg-sts-card px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="sts-text-stat-label">{label}</p>
        {Icon && (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sts-surface">
            <Icon className="size-3.5 text-sts-blue" strokeWidth={2} />
          </span>
        )}
      </div>
      <p className="mt-1.5 font-mono text-[22px] font-semibold leading-none tabular-nums text-sts-foreground">
        {value}
      </p>
      <p className={cn("mt-1.5 font-sans text-[11.5px] text-sts-muted", detailClassName)}>
        {detail}
      </p>
    </div>
  );
}

function TopContributors({
  members,
  periodLabel,
}: {
  members: SubDepartmentMember[];
  periodLabel: string;
}) {
  const top = members.slice(0, 5);
  if (top.length === 0) {
    return (
      <p className="font-sans text-[12px] text-sts-subtle">No time logged {periodLabel}.</p>
    );
  }
  const maxProgress = Math.max(1, ...top.map((m) => m.weekProgress));

  return (
    <div className="flex flex-col gap-2.5">
      {top.map((member, i) => (
        <div key={member.id} className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold",
              i === 0
                ? "bg-sts-blue-tint text-sts-id"
                : "bg-sts-surface text-sts-subtle",
            )}
          >
            {i + 1}
          </span>
          <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-sans text-[12px] font-semibold text-sts-foreground">
              {member.name}
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sts-surface">
              <div
                className="h-full rounded-full bg-sts-blue"
                style={{ width: `${(member.weekProgress / maxProgress) * 100}%` }}
              />
            </div>
          </div>
          <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-sts-foreground">
            {member.weekHours}
          </span>
        </div>
      ))}
    </div>
  );
}

function MemberAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  return <UserAvatar name={name} avatarUrl={avatarUrl} size={30} />;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function OverviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-sts-card-border bg-sts-card">
      <div className="border-b border-sts-card-border px-4 py-2.5">
        <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-sts-subtle">
          {title}
        </p>
      </div>
      <div className="flex-1 px-4 py-3">{children}</div>
    </div>
  );
}

function CountBars({ rows, color }: { rows: NamedCount[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0)
    return <p className="font-sans text-[12px] text-sts-subtle">No data yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2.5">
          <span className="w-20 shrink-0 truncate font-sans text-[12px] text-sts-foreground sm:w-24">
            {r.name}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-sts-surface">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(4, (r.count / max) * 100)}%`, backgroundColor: color }}
            />
          </div>
          <span className="w-7 shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums text-sts-foreground">
            {r.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({
  rows,
  size = 132,
  thickness = 18,
}: {
  rows: DistSlice[];
  size?: number;
  thickness?: number;
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0)
    return <p className="font-sans text-[12px] text-sts-subtle">No data yet.</p>;
  const radius = (size - thickness) / 2;
  const circ = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;
  const lengths = rows.map((d) => (d.count / total) * circ);
  const offsets = lengths.map((_, i) =>
    lengths.slice(0, i).reduce((s, l) => s + l, 0),
  );
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={thickness} />
          {rows.map((d, i) => (
            <circle
              key={d.label}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${lengths[i]} ${circ - lengths[i]}`}
              strokeDashoffset={-offsets[i]}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[20px] font-semibold leading-none tabular-nums text-sts-foreground">
            {total}
          </span>
          <span className="mt-0.5 font-sans text-[10px] text-sts-subtle">total</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {rows.map((d) => (
          <div key={d.label} className="flex items-center gap-2.5 font-sans text-[12px]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="min-w-0 max-w-[120px] flex-1 truncate text-sts-foreground">{d.label}</span>
            <span className="w-7 text-right font-mono font-semibold tabular-nums text-sts-foreground">{d.count}</span>
            <span className="w-9 text-right tabular-nums text-sts-subtle">
              {Math.round((d.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SubDepartmentTimePage({
  showDepartmentFilter = false,
}: {
  /** Tenant view: filter the tenant's departments. Department view omits this. */
  showDepartmentFilter?: boolean;
}) {
  const [presetId, setPresetId] = useState<PresetId | "custom">("30d");
  const [range, setRange] = useState<{ from: string; to: string }>(() =>
    presetRange("30d"),
  );
  const [customRange, setCustomRange] = useState<DayPickerDateRange | undefined>();
  const [rangeOpen, setRangeOpen] = useState(false);
  const { userRole } = useDashboardContext();
  const queryClient = useQueryClient();
  // Per-person filtering is a manager tool — completely hidden from members.
  const canFilterByPerson = userRole === "admin" || userRole === "manager";

  // RPT-06: live dashboard — refresh report metrics when tenant tickets change.
  // Debounced so a burst of changes triggers a single invalidation.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }, 1500);
    };
    const unsubscribe = createTicketsSubscription(supabase, invalidate);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [queryClient]);
  const [personFilter, setPersonFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!showDepartmentFilter) return;
    let cancelled = false;
    fetch("/api/admin/departments")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: { id: string; name: string }[]) => {
        if (!cancelled) setDepartments(Array.isArray(rows) ? rows.map((row) => ({ id: row.id, name: row.name })) : []);
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showDepartmentFilter]);

  const selectedLabel =
    presetId === "custom"
      ? formatRangeLabel(range.from, range.to)
      : RANGE_PRESETS.find((o) => o.id === presetId)?.label ?? "Last 30 days";
  const { data, isLoading, isError, refetch } = useSubDepartmentTimeReport(
    range.from,
    range.to,
    "all",
    personFilter,
    showDepartmentFilter ? departmentFilter : "all",
  );
  const { data: overview, isError: overviewError, refetch: refetchOverview } = useReportsOverview(
    range.from,
    range.to,
    "all",
    personFilter,
    showDepartmentFilter ? departmentFilter : "all",
  );
  const memberOptions = overview?.memberOptions ?? [];
  const selectedPerson = memberOptions.find((m) => m.id === personFilter);
  const selectedPersonName = personFilter === "all" ? "Everyone" : selectedPerson?.name ?? "Person";

  return (
    <div className="sts-page-pad flex h-full flex-col gap-4 overflow-y-auto">
      <PageHeader
        title="Reports"
        icon={ChartColumn}
        iconClassName="text-sts-blue"
        description={
          showDepartmentFilter
            ? "Analytics for this tenant. Choose one department, or keep every department combined."
            : "Time and delivery for this department."
        }
        clampDescription
        actions={
        <div className="flex shrink-0 items-center gap-2">
          {showDepartmentFilter && (
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className="flex h-[30px] w-[180px] shrink-0 items-center justify-between gap-2 rounded-full border border-sts-card-border bg-sts-card px-3 font-sans text-[11.5px] font-semibold text-sts-foreground outline-none hover:bg-sts-bg data-popup-open:bg-sts-bg"
            >
              <span className="truncate">
                {departmentFilter === "all"
                  ? "All departments"
                  : departments.find((dept) => dept.id === departmentFilter)?.name ?? "Department"}
              </span>
              <ChevronDown className="size-3 shrink-0 text-sts-subtle" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-72 overflow-y-auto font-sans [&_[data-slot=dropdown-menu-item]]:text-[12.5px]"
            >
              <DropdownMenuItem onClick={() => { setDepartmentFilter("all"); setPersonFilter("all"); }} className="gap-2">
                <span className="flex-1">All departments</span>
                {departmentFilter === "all" && <Check className="size-3 text-sts-blue" />}
              </DropdownMenuItem>
              {departments.map((dept) => (
                <DropdownMenuItem
                  key={dept.id}
                  onClick={() => { setDepartmentFilter(dept.id); setPersonFilter("all"); }}
                  className="gap-2"
                >
                  <span className="flex-1 truncate">{dept.name}</span>
                  {departmentFilter === dept.id && <Check className="size-3 text-sts-blue" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          )}
          {/* Person filter — managers and admins only */}
          {canFilterByPerson && (
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              aria-label={`Filter by person: ${selectedPersonName}`}
              className="flex h-[30px] w-[160px] shrink-0 items-center justify-between gap-2 rounded-full border border-sts-card-border bg-sts-card px-3 font-sans text-[11.5px] font-semibold text-sts-foreground outline-none hover:bg-sts-bg data-popup-open:bg-sts-bg"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {selectedPerson && (
                  <UserAvatar name={selectedPerson.name} avatarUrl={selectedPerson.avatarUrl} size={16} />
                )}
                <span className="truncate">{selectedPersonName}</span>
              </span>
              <ChevronDown className="size-3 shrink-0 text-sts-subtle" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-72 overflow-y-auto font-sans [&_[data-slot=dropdown-menu-item]]:text-[12.5px]"
            >
              <DropdownMenuItem onClick={() => setPersonFilter("all")} className="gap-2">
                <span className="flex-1">Everyone</span>
                {personFilter === "all" && <Check className="size-3 text-sts-blue" />}
              </DropdownMenuItem>
              {memberOptions.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => setPersonFilter(m.id)}
                  className="gap-2"
                >
                  <UserAvatar name={m.name} avatarUrl={m.avatarUrl} size={18} />
                  <span className="flex-1 truncate">{m.name}</span>
                  {personFilter === m.id && <Check className="size-3 text-sts-blue" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          )}



          {/* Date range filter */}
          <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
            <PopoverTrigger
              className="flex h-[30px] w-[180px] shrink-0 items-center justify-between gap-2 rounded-full border border-sts-card-border bg-sts-card px-3 font-sans text-[11.5px] font-semibold text-sts-foreground outline-none hover:bg-sts-bg"
            >
              <span className="truncate">{selectedLabel}</span>
              <ChevronDown className="size-3 shrink-0 text-sts-subtle" />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-64 rounded-xl border border-sts-card-border bg-sts-bg p-0 shadow-xl"
            >
              <div className="p-1.5">
                {RANGE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPresetId(p.id);
                      setRange(presetRange(p.id));
                      setRangeOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-sans text-[12.5px] text-sts-foreground transition-colors hover:bg-sts-surface"
                  >
                    <span className="flex-1">{p.label}</span>
                    {presetId === p.id && <Check className="size-3.5 text-sts-blue" />}
                  </button>
                ))}
              </div>
              <div className="border-t border-sts-card-border p-3">
                <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-sts-subtle">
                  Custom range
                </p>
                <Calendar
                  mode="range"
                  selected={customRange}
                  onSelect={setCustomRange}
                  numberOfMonths={1}
                />
                <button
                  type="button"
                  disabled={!customRange?.from || !customRange?.to}
                  onClick={() => {
                    if (!customRange?.from || !customRange?.to) return;
                    setPresetId("custom");
                    setRange({
                      from: isoDate(customRange.from),
                      to: isoDate(customRange.to),
                    });
                    setRangeOpen(false);
                  }}
                  className="mt-2 h-8 w-full rounded-full bg-sts-blue px-3 font-sans text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-gray-900"
                >
                  Apply custom range
                </button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Export */}
          <ReportsExportMenu
            subDepartmentTime={data}
            overview={overview}
            rangeLabel={formatRangeLabel(range.from, range.to)}
            scopeLabel={
              [
                showDepartmentFilter && departmentFilter !== "all" ? departments.find((dept) => dept.id === departmentFilter)?.name : null,
                canFilterByPerson && personFilter !== "all" ? selectedPersonName : null,
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            }
          />
        </div>
        }
      />

      {/* Error state */}
      {(isError || overviewError) && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-sts-card-border bg-sts-card py-8">
          <p className="font-sans text-[12.5px] text-sts-muted">
            Failed to load report data.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetch(); refetchOverview(); }}
            className="h-7 border-sts-card-border bg-sts-bg px-3 font-sans text-[11.5px]"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Range KPIs + overview — skeleton while either report stream is pending */}
      {isError || overviewError ? null : isLoading || !overview ? (
        <ReportsSectionsSkeleton />
      ) : (
        <>
          <TicketPerformancePanel overview={overview} onSelectPerson={canFilterByPerson ? setPersonFilter : undefined} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <>
            {data?.stats.map((stat, i) => (
              <ReportStatCard
                key={stat.label}
                {...stat}
                icon={[Clock, TicketCheck][i]}
              />
            ))}
            <ReportStatCard
              label="OPEN TICKETS"
              value={`${overview.totals.open}`}
              detail={`${overview.totals.closed} closed · ${overview.totals.total} total`}
              icon={Layers}
            />
          </>
      </div>

          {/* Distribution — three equal donuts */}
          <div className="grid auto-rows-fr grid-cols-1 gap-3.5 md:grid-cols-3">
            <OverviewCard title="STATUS">
              <DonutChart rows={overview.statusDist} />
            </OverviewCard>
            <OverviewCard title="PRIORITY">
              <DonutChart rows={overview.priorityDist} />
            </OverviewCard>
            <OverviewCard title="OPEN VS CLOSED">
              <DonutChart
                rows={[
                  { label: "Open", count: overview.totals.open, color: "#f59e0b" },
                  { label: "Closed", count: overview.totals.closed, color: "#16a34a" },
                ]}
              />
            </OverviewCard>
          </div>

          {/* Contributions */}
          <div className="grid auto-rows-fr grid-cols-1 gap-3.5 md:grid-cols-2">
            <OverviewCard title="RESOLVED">
              <CountBars rows={overview.resolved} color="#16a34a" />
            </OverviewCard>
            <OverviewCard title={`TOP TIME LOGGED · ${selectedLabel.toUpperCase()}`}>
              <TopContributors
                members={data?.members ?? []}
                periodLabel={selectedLabel.toLowerCase()}
              />
            </OverviewCard>
          </div>

        </>
      )}

      {/* RPT-06: periodic exportable reports (Project Admin only; self-hides otherwise) */}
      <ScheduledReports />

    </div>
  );
}
