"use client";

import { useState } from "react";
import { ChevronDown, Check, Clock, TicketCheck, Layers, ChartColumn, Globe } from "lucide-react";
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
import type { StatCard, SubDepartmentMember, NamedCount, ModuleSpeed, DistSlice, ProjectTickets, ModuleTickets, ProjectTimeRow, CrossDeptContribution } from "@/lib/api/reports";
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
    <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="pen-text-stat-label">{label}</p>
        {Icon && (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-pen-surface">
            <Icon className="size-3.5 text-pen-blue" strokeWidth={2} />
          </span>
        )}
      </div>
      <p className="mt-1.5 font-mono text-[22px] font-semibold leading-none tabular-nums text-pen-foreground">
        {value}
      </p>
      <p className={cn("mt-1.5 font-sans text-[11.5px] text-pen-muted", detailClassName)}>
        {detail}
      </p>
    </div>
  );
}

function ProjectShareBar({ projects }: { projects: ProjectTimeRow[] }) {
  if (projects.length === 0) return null;
  return (
    <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-pen-surface">
      {projects.map((p) => (
        <div
          key={p.name}
          className="h-full transition-[width] duration-300"
          style={{ width: `${Math.max(p.share, 1)}%`, backgroundColor: p.color }}
          title={`${p.name}: ${p.hours} (${p.share}%)`}
        />
      ))}
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
      <p className="font-sans text-[12px] text-pen-subtle">No time logged {periodLabel}.</p>
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
                ? "bg-pen-blue-tint text-pen-id"
                : "bg-pen-surface text-pen-subtle",
            )}
          >
            {i + 1}
          </span>
          <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-sans text-[12px] font-semibold text-pen-foreground">
              {member.name}
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-pen-surface">
              <div
                className="h-full rounded-full bg-pen-blue"
                style={{ width: `${(member.weekProgress / maxProgress) * 100}%` }}
              />
            </div>
          </div>
          <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-pen-foreground">
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
    <div className="flex h-full flex-col rounded-xl border border-pen-card-border bg-pen-card">
      <div className="border-b border-pen-card-border px-4 py-2.5">
        <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
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
    return <p className="font-sans text-[12px] text-pen-subtle">No data yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2.5">
          <span className="w-20 shrink-0 truncate font-sans text-[12px] text-pen-foreground sm:w-24">
            {r.name}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-pen-surface">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(4, (r.count / max) * 100)}%`, backgroundColor: color }}
            />
          </div>
          <span className="w-7 shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums text-pen-foreground">
            {r.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function ModuleSpeedBars({ rows }: { rows: ModuleSpeed[] }) {
  const max = Math.max(1, ...rows.map((r) => r.days));
  if (rows.length === 0)
    return <p className="font-sans text-[12px] text-pen-subtle">No bug tickets resolved yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.module} className="flex items-center gap-2.5">
          <span className="w-24 shrink-0 truncate font-sans text-[12px] text-pen-foreground" title={r.module}>
            {r.module}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-pen-surface">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(4, (r.days / max) * 100)}%`, backgroundColor: "#e08848" }}
            />
          </div>
          <span className="w-9 shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums text-pen-foreground">
            {r.days}d
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
    return <p className="font-sans text-[12px] text-pen-subtle">No data yet.</p>;
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
          <span className="font-mono text-[20px] font-semibold leading-none tabular-nums text-pen-foreground">
            {total}
          </span>
          <span className="mt-0.5 font-sans text-[10px] text-pen-subtle">total</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {rows.map((d) => (
          <div key={d.label} className="flex items-center gap-2.5 font-sans text-[12px]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="min-w-0 max-w-[120px] flex-1 truncate text-pen-foreground">{d.label}</span>
            <span className="w-7 text-right font-mono font-semibold tabular-nums text-pen-foreground">{d.count}</span>
            <span className="w-9 text-right tabular-nums text-pen-subtle">
              {Math.round((d.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectTicketsList({ rows }: { rows: ProjectTickets[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (rows.length === 0)
    return <p className="font-sans text-[12px] text-pen-subtle">No projects yet.</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.project} className="flex items-center gap-2.5">
          <span className="flex w-28 shrink-0 items-center gap-1.5 font-sans text-[12px] text-pen-foreground">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
            <span className="truncate" title={r.project}>{r.project}</span>
          </span>
          <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-pen-surface">
            <div
              className="h-full"
              style={{ width: `${((r.total - r.open) / max) * 100}%`, backgroundColor: "#16a34a" }}
              title={`${r.total - r.open} closed`}
            />
            <div
              className="h-full"
              style={{ width: `${(r.open / max) * 100}%`, backgroundColor: r.color }}
              title={`${r.open} open`}
            />
          </div>
          <span className="w-20 shrink-0 text-right font-sans text-[11.5px] text-pen-subtle">
            <span className="font-semibold text-pen-foreground">{r.open}</span> open / {r.total}
          </span>
        </div>
      ))}
    </div>
  );
}

function ModuleTicketsList({ rows }: { rows: ModuleTickets[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (rows.length === 0)
    return <p className="font-sans text-[12px] text-pen-subtle">No module tickets yet.</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.module} className="flex items-center gap-2.5">
          <span className="flex w-28 shrink-0 items-center gap-1.5 font-sans text-[12px] text-pen-foreground">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: "#0a76b9" }} />
            <span className="truncate" title={r.module}>{r.module}</span>
          </span>
          <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-pen-surface">
            <div
              className="h-full"
              style={{ width: `${((r.total - r.open) / max) * 100}%`, backgroundColor: "#16a34a" }}
              title={`${r.total - r.open} closed`}
            />
            <div
              className="h-full"
              style={{ width: `${(r.open / max) * 100}%`, backgroundColor: "#0a76b9" }}
              title={`${r.open} open`}
            />
          </div>
          <span className="w-20 shrink-0 text-right font-sans text-[11.5px] text-pen-subtle">
            <span className="font-semibold text-pen-foreground">{r.open}</span> open / {r.total}
          </span>
        </div>
      ))}
    </div>
  );
}

function crossDeptHours(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function CrossDeptPanel({ rows }: { rows: CrossDeptContribution[] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div
          key={r.personId}
          className="flex flex-col gap-2 border-b border-pen-card-border/40 pb-3 last:border-b-0 last:pb-0"
        >
          <div className="flex items-center gap-2.5">
            <UserAvatar name={r.name} avatarUrl={r.avatarUrl} size={28} />
            <span className="min-w-0 flex-1 truncate font-sans text-[13px] font-medium text-pen-foreground">
              {r.name}
            </span>
            <span className="flex shrink-0 items-center gap-3 font-mono text-[11.5px] tabular-nums text-pen-muted">
              {r.created > 0 && (
                <span title="Tickets created for other departments">
                  <span className="font-semibold text-pen-foreground">{r.created}</span> created
                </span>
              )}
              {r.completed > 0 && (
                <span title="Tickets completed for other departments">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{r.completed}</span> done
                </span>
              )}
              {r.loggedSecs > 0 && (
                <span title="Time logged for other departments">
                  <span className="font-semibold text-pen-foreground">{crossDeptHours(r.loggedSecs)}</span> logged
                </span>
              )}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-[38px]">
            {r.byDepartment.map((d) => (
              <span
                key={d.departmentName}
                className="rounded bg-amber-500/10 px-1.5 py-px font-sans text-[10.5px] text-amber-700 dark:text-amber-400"
                title={`${d.created} created · ${d.completed} done · ${crossDeptHours(d.loggedSecs)} logged`}
              >
                {d.departmentName}
                <span className="ml-1 text-amber-600/70 dark:text-amber-400/70">
                  {[
                    d.created > 0 ? `${d.created}c` : null,
                    d.completed > 0 ? `${d.completed}d` : null,
                    d.loggedSecs > 0 ? crossDeptHours(d.loggedSecs) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SubDepartmentTimePage() {
  const [presetId, setPresetId] = useState<PresetId | "custom">("30d");
  const [range, setRange] = useState<{ from: string; to: string }>(() =>
    presetRange("30d"),
  );
  const [customRange, setCustomRange] = useState<DayPickerDateRange | undefined>();
  const [rangeOpen, setRangeOpen] = useState(false);
  const { userRole } = useDashboardContext();
  // Per-person filtering is a manager tool — completely hidden from members.
  const canFilterByPerson = userRole === "admin" || userRole === "manager";
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [personFilter, setPersonFilter] = useState<string>("all");
  const selectedLabel =
    presetId === "custom"
      ? formatRangeLabel(range.from, range.to)
      : RANGE_PRESETS.find((o) => o.id === presetId)?.label ?? "Last 30 days";
  const { data, isLoading, isError, refetch } = useSubDepartmentTimeReport(
    range.from,
    range.to,
    projectFilter,
    personFilter,
  );
  const { data: overview } = useReportsOverview(
    range.from,
    range.to,
    projectFilter,
    personFilter,
  );
  const projectOptions = overview?.projectOptions ?? [];
  const selectedProjectName =
    projectFilter === "all"
      ? "All projects"
      : projectOptions.find((p) => p.id === projectFilter)?.name ?? "Project";
  const memberOptions = overview?.memberOptions ?? [];
  const selectedPerson = memberOptions.find((m) => m.id === personFilter);
  const selectedPersonName = personFilter === "all" ? "Everyone" : selectedPerson?.name ?? "Person";

  return (
    <div className="pen-page-pad flex h-full flex-col gap-4 overflow-y-auto">
      <PageHeader
        title="Reports"
        icon={ChartColumn}
        iconClassName="text-pen-blue"
        description="Time and delivery across your team and projects — an overview of where the hours go."
        clampDescription
        actions={
        <div className="flex shrink-0 items-center gap-2">
          {/* Person filter — managers and admins only */}
          {canFilterByPerson && (
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className="flex h-[30px] w-[160px] shrink-0 items-center justify-between gap-2 rounded-md border border-pen-card-border bg-pen-card px-3 font-sans text-[11.5px] font-semibold text-pen-foreground outline-none hover:bg-pen-bg data-popup-open:bg-pen-bg"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {selectedPerson && (
                  <UserAvatar name={selectedPerson.name} avatarUrl={selectedPerson.avatarUrl} size={16} />
                )}
                <span className="truncate">{selectedPersonName}</span>
              </span>
              <ChevronDown className="size-3 shrink-0 text-pen-subtle" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-72 overflow-y-auto font-sans [&_[data-slot=dropdown-menu-item]]:text-[12.5px]"
            >
              <DropdownMenuItem onClick={() => setPersonFilter("all")} className="gap-2">
                <span className="flex-1">Everyone</span>
                {personFilter === "all" && <Check className="size-3 text-pen-blue" />}
              </DropdownMenuItem>
              {memberOptions.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => setPersonFilter(m.id)}
                  className="gap-2"
                >
                  <UserAvatar name={m.name} avatarUrl={m.avatarUrl} size={18} />
                  <span className="flex-1 truncate">{m.name}</span>
                  {personFilter === m.id && <Check className="size-3 text-pen-blue" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          )}

          {/* Project filter */}
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className="flex h-[30px] w-[160px] shrink-0 items-center justify-between gap-2 rounded-md border border-pen-card-border bg-pen-card px-3 font-sans text-[11.5px] font-semibold text-pen-foreground outline-none hover:bg-pen-bg data-popup-open:bg-pen-bg"
            >
              <span className="truncate">{selectedProjectName}</span>
              <ChevronDown className="size-3 shrink-0 text-pen-subtle" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-72 overflow-y-auto font-sans [&_[data-slot=dropdown-menu-item]]:text-[12.5px]"
            >
              <DropdownMenuItem onClick={() => setProjectFilter("all")} className="gap-2">
                <span className="flex-1">All projects</span>
                {projectFilter === "all" && <Check className="size-3 text-pen-blue" />}
              </DropdownMenuItem>
              {projectOptions.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setProjectFilter(p.id)}
                  className="gap-2"
                >
                  <span className="flex-1 truncate">{p.name}</span>
                  {projectFilter === p.id && <Check className="size-3 text-pen-blue" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Date range filter */}
          <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
            <PopoverTrigger
              className="flex h-[30px] w-[180px] shrink-0 items-center justify-between gap-2 rounded-md border border-pen-card-border bg-pen-card px-3 font-sans text-[11.5px] font-semibold text-pen-foreground outline-none hover:bg-pen-bg"
            >
              <span className="truncate">{selectedLabel}</span>
              <ChevronDown className="size-3 shrink-0 text-pen-subtle" />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-64 rounded-xl border border-pen-card-border bg-pen-bg p-0 shadow-xl"
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
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-sans text-[12.5px] text-pen-foreground transition-colors hover:bg-pen-surface"
                  >
                    <span className="flex-1">{p.label}</span>
                    {presetId === p.id && <Check className="size-3.5 text-pen-blue" />}
                  </button>
                ))}
              </div>
              <div className="border-t border-pen-card-border p-3">
                <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
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
                  className="mt-2 h-8 w-full rounded-md bg-pen-blue px-3 font-sans text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-gray-900"
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
            rangeLabel={selectedLabel}
            scopeLabel={
              [
                projectFilter !== "all" ? selectedProjectName : null,
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
      {isError && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-pen-card-border bg-pen-card py-8">
          <p className="font-sans text-[12.5px] text-pen-muted">
            Failed to load report data.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="h-7 border-pen-card-border bg-pen-bg px-3 font-sans text-[11.5px]"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Range KPIs + overview — skeleton while either report stream is pending */}
      {isLoading || !overview ? (
        <ReportsSectionsSkeleton />
      ) : (
        <>
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

          {/* Contributions — three equal people cards */}
          <div className="grid auto-rows-fr grid-cols-1 gap-3.5 md:grid-cols-3">
            <OverviewCard title="CREATED">
              <CountBars rows={overview.created} color="#2f6df6" />
            </OverviewCard>
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

          {/* Tickets breakdown — two equal cards */}
          <div className="grid auto-rows-fr grid-cols-1 gap-3.5 md:grid-cols-2">
            <OverviewCard title="TICKETS BY PROJECT">
              <ProjectTicketsList rows={overview.projectTickets} />
            </OverviewCard>
            <OverviewCard title="TICKETS BY MODULE">
              <ModuleTicketsList rows={overview.moduleTickets} />
            </OverviewCard>
          </div>

          {/* Delivery — two equal cards */}
          <div className="grid auto-rows-fr grid-cols-1 gap-3.5 md:grid-cols-2">
            <OverviewCard title="OPEN WORKLOAD">
              <CountBars rows={overview.workload} color="#f97316" />
            </OverviewCard>
            <OverviewCard title="BUG RESOLUTION SPEED">
              <ModuleSpeedBars rows={overview.bugResolution} />
            </OverviewCard>
          </div>

          {/* Cross-department contributions — what our people did for other departments */}
          {(overview.crossDept?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-pen-card-border bg-pen-card">
              <div className="flex items-center gap-2 border-b border-pen-card-border px-4 py-2.5">
                <Globe className="size-3.5 text-amber-500" />
                <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
                  CROSS-DEPARTMENT CONTRIBUTIONS · {selectedLabel.toUpperCase()}
                </p>
              </div>
              <div className="px-4 py-3">
                <CrossDeptPanel rows={overview.crossDept} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Time by project */}
      {!isLoading && overview && (data?.projects.length ?? 0) > 0 && (
        <div className="rounded-xl border border-pen-card-border bg-pen-card">
          <div className="border-b border-pen-card-border px-4 py-2.5 sm:px-[18px]">
            <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
              TIME BY PROJECT · {selectedLabel.toUpperCase()}
            </p>
          </div>
          <div className="px-4 py-3 sm:px-[18px]">
            <ProjectShareBar projects={data!.projects} />
            <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1">
              {data!.projects.slice(0, 6).map((p) => (
                <span
                  key={p.name}
                  className="flex items-center gap-1.5 font-sans text-[11px] text-pen-muted"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name} {p.share}%
                </span>
              ))}
            </div>
          </div>
          {/* Column headers */}
          <div className="flex items-center gap-4 border-y border-pen-card-border/60 px-4 py-1.5 sm:px-[18px]">
            <span className="size-2.5 shrink-0" />
            <span className="min-w-0 flex-1 font-sans text-[10px] font-semibold uppercase tracking-[0.6px] text-pen-subtle/70">
              Project
            </span>
            <span className="hidden w-16 shrink-0 text-right font-sans text-[10px] font-semibold uppercase tracking-[0.6px] text-pen-subtle/70 sm:block">
              People
            </span>
            <span className="hidden w-32 shrink-0 md:block" />
            <span className="w-[72px] shrink-0 text-right font-sans text-[10px] font-semibold uppercase tracking-[0.6px] text-pen-subtle/70">
              Time
            </span>
            <span className="w-9 shrink-0 text-right font-sans text-[10px] font-semibold uppercase tracking-[0.6px] text-pen-subtle/70">
              %
            </span>
          </div>
          <div className="divide-y divide-pen-card-border/60">
            {data!.projects.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-4 px-4 py-2.5 transition-colors hover:bg-pen-bg/40 sm:px-[18px]"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-pen-foreground">
                  {p.name}
                </span>
                <span className="hidden w-16 shrink-0 text-right font-sans text-[11.5px] text-pen-subtle sm:block">
                  {p.contributors} {p.contributors === 1 ? "person" : "people"}
                </span>
                <div className="hidden h-2 w-32 shrink-0 overflow-hidden rounded-full bg-pen-surface md:block">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, p.share)}%`,
                      backgroundColor: p.color,
                    }}
                  />
                </div>
                <span className="w-[72px] shrink-0 whitespace-nowrap text-right font-mono text-[12px] font-semibold tabular-nums text-pen-foreground">
                  {p.hours}
                </span>
                <span className="w-9 shrink-0 text-right font-sans text-[11.5px] tabular-nums text-pen-subtle">
                  {p.share}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
