"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check, ChartColumn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createTicketsSubscription } from "@/lib/realtime";
import { ScheduledReports } from "@/components/reports/scheduled-reports";
import { TicketPerformancePanel } from "@/components/reports/ticket-performance-panel";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import {
  ReportDateRangePicker,
  formatRangeLabel,
  presetRange,
  type PresetId,
} from "@/components/reports/report-date-range-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/page-header";
import { useReportsOverview } from "@/hooks/queries/use-reports";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { ReportsExportMenu } from "@/components/time/reports-export-menu";
import type { StatCard, SubDepartmentMember } from "@/lib/api/reports";
import styles from "@/components/reports/report-layout.module.css";
import { ReportsSectionsSkeleton } from "@/components/skeletons/page-skeletons";

export type { StatCard, SubDepartmentMember };

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
  const { userRole, activeDeptId } = useDashboardContext();
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

  const { data: overview, isLoading, isError, refetch } = useReportsOverview(
    range.from,
    range.to,
    "all",
    personFilter,
    showDepartmentFilter ? departmentFilter : "all",
  );
  const memberOptions = overview?.memberOptions ?? [];
  const historicalPerson = overview?.userPerformance.find((person) => person.personId === personFilter);
  const selectedPerson = memberOptions.find((m) => m.id === personFilter)
    ?? (historicalPerson ? { ...historicalPerson, avatarUrl: null } : undefined);
  const selectedPersonName = personFilter === "all" ? "Everyone" : selectedPerson?.name ?? "Person";

  return (
    <div className="sts-page-pad h-full overflow-y-auto bg-sts-bg/80">
      <div className={styles.page}>
      <PageHeader
        title="Reports"
        className="[&_h1]:text-2xl [&_h1]:tracking-tight"
        icon={ChartColumn}
        iconClassName="text-sts-blue"
        description={
          showDepartmentFilter
            ? "Analytics for this tenant. Choose one department, or keep every department combined."
            : "User completions, priorities, SLA reliability, and customer reply times."
        }
        clampDescription
        badge={<span className="rounded-md bg-sts-surface px-2 py-1 text-[10px] font-medium text-sts-muted">Performance</span>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-sts-card-border bg-[var(--sts-card-solid)] p-1" role="group" aria-label="Report period">
          {(["today", "7d", "30d", "1y"] as const).map((id) => (
            <button key={id} type="button" aria-pressed={presetId === id} onClick={() => { setPresetId(id); setRange(presetRange(id)); }} className={`rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sts-blue ${presetId === id ? "bg-sts-surface text-sts-foreground" : "text-sts-muted hover:bg-sts-surface/60"}`}>
              {{ today: "Day", "7d": "Week", "30d": "Month", "1y": "Year" }[id]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showDepartmentFilter && (
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className="flex h-9 w-[180px] shrink-0 items-center justify-between gap-2 rounded-lg border border-sts-card-border bg-[var(--sts-card-solid)] px-3 font-sans text-[11.5px] font-semibold text-sts-foreground outline-none focus-visible:ring-2 focus-visible:ring-sts-blue focus-visible:ring-offset-2 hover:bg-sts-bg data-popup-open:bg-sts-bg"
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
              className="flex h-9 w-[160px] shrink-0 items-center justify-between gap-2 rounded-lg border border-sts-card-border bg-[var(--sts-card-solid)] px-3 font-sans text-[11.5px] font-semibold text-sts-foreground outline-none focus-visible:ring-2 focus-visible:ring-sts-blue focus-visible:ring-offset-2 hover:bg-sts-bg data-popup-open:bg-sts-bg"
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
          <ReportDateRangePicker
            presetId={presetId}
            range={range}
            onChange={(id, next) => {
              setPresetId(id);
              setRange(next);
            }}
          />

          {/* Export */}
          <ReportsExportMenu
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
      </div>
      <p className="-mt-2 text-xs text-sts-muted">{formatRangeLabel(range.from, range.to)} · {selectedPersonName}</p>

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-sts-card-border bg-sts-card py-8">
          <p className="font-sans text-[12.5px] text-sts-muted">
            Failed to load report data.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="h-7 border-sts-card-border bg-sts-bg px-3 font-sans text-[11.5px]"
          >
            Retry
          </Button>
        </div>
      )}

      <div aria-busy={isLoading || !overview}>
        {isError ? null : isLoading || !overview ? (
          <ReportsSectionsSkeleton />
        ) : (
          <TicketPerformancePanel overview={overview} onSelectPerson={canFilterByPerson ? setPersonFilter : undefined} />
        )}
      </div>

      {/* RPT-06: periodic exportable reports (Project Admin only; self-hides otherwise) */}
      <ScheduledReports personId={personFilter} departmentId={showDepartmentFilter ? departmentFilter : activeDeptId ?? "all"} />
      </div>
    </div>
  );
}
