"use client";

import { useEffect, useState } from "react";
import { Building2, ChartColumn, ChevronDown, Check, Ticket } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

type TenantVolumeRow = { tenantId: string; tenantName: string; count: number };
type DepartmentRow = { departmentId: string; departmentName: string; count: number };
type TenantTicketRow = {
  id: string;
  tenantId: string;
  humanId: string;
  title: string;
  status: string;
  type?: string;
  category?: string;
  createdAt: string;
};

type Slice = { label: string; count: number; color: string };

const STATUS_COLOR: Record<string, string> = {
  OPEN: "#94a3b8",
  "TO DO": "#94a3b8",
  "IN PROGRESS": "#0a76b9",
  PAUSED: "#f59e0b",
  ESCALATED: "#dc2626",
  RESOLVED: "#16a34a",
  LIVE: "#16a34a",
  DONE: "#16a34a",
  CLOSED: "#16a34a",
  BLOCKED: "#dc2626",
};
const FALLBACK_COLORS = ["#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5"];

function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function eachDay(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  const cursor = new Date(startIso);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endIso);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    days.push(localDayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function prettyLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countBy(rows: TenantTicketRow[], key: (row: TenantTicketRow) => string): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const label = key(row).trim() || "Unknown";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function statusSlices(rows: TenantTicketRow[]): Slice[] {
  return countBy(rows, (row) => row.status || "Unknown").map((slice, index) => ({
    ...slice,
    color: STATUS_COLOR[slice.label.trim().toUpperCase()] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
  }));
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="border-b border-sts-card-border px-4 py-2.5">
      <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-sts-subtle">{children}</p>
    </div>
  );
}

function Donut({ slices, total }: { slices: Slice[]; total: number }) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="size-[148px] shrink-0 text-sts-foreground" role="img" aria-label="Status mix">
      <circle cx="50" cy="50" r={r} fill="none" className="stroke-sts-surface" strokeWidth="12" />
      {total > 0 &&
        slices.map((slice) => {
          const length = (slice.count / total) * circumference;
          const gap = slices.length > 1 ? 1.5 : 0;
          const dash = Math.max(0, length - gap);
          const node = (
            <circle
              key={slice.label}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={slice.color}
              strokeWidth="12"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
            />
          );
          offset += length;
          return node;
        })}
      <text x="50" y="48" textAnchor="middle" fill="currentColor" style={{ fontSize: 16, fontWeight: 650 }}>
        {total}
      </text>
      <text x="50" y="61" textAnchor="middle" className="fill-sts-subtle" style={{ fontSize: 7, letterSpacing: 0.8 }}>
        TICKETS
      </text>
    </svg>
  );
}

function ShareBars({
  rows,
  color,
}: {
  rows: { label: string; count: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row, index) => {
        const share = Math.round((row.count / Math.max(total, 1)) * 100);
        return (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-sans text-[12.5px] text-sts-foreground">{prettyLabel(row.label)}</span>
              <span className="shrink-0 font-sans text-[11.5px] tabular-nums text-sts-subtle">
                <span className="font-mono font-semibold text-sts-foreground">{row.count}</span>
                <span className="ml-1.5">{share}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sts-surface">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(4, (row.count / max) * 100)}%`,
                  backgroundColor: color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function Stat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Ticket;
}) {
  return (
    <div className="rounded-xl border border-sts-card-border bg-sts-card px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="sts-text-stat-label">{label}</p>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sts-surface">
          <Icon className="size-3.5 text-sts-blue" strokeWidth={2} />
        </span>
      </div>
      <p className="mt-1.5 font-mono text-[22px] font-semibold leading-none tabular-nums text-sts-foreground">
        {value}
      </p>
      <p className="mt-1.5 font-sans text-[11.5px] text-sts-muted">{detail}</p>
    </div>
  );
}

function TenantCharts({
  tickets,
  departments,
  start,
  end,
}: {
  tickets: TenantTicketRow[];
  departments: DepartmentRow[];
  start: string;
  end: string;
}) {
  const days = eachDay(start, end);
  const byDay = new Map<string, number>();
  for (const ticket of tickets) {
    const key = localDayKey(new Date(ticket.createdAt));
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const series = days.map((key) => ({ key, count: byDay.get(key) ?? 0 }));
  const peak = series.reduce((best, day) => (day.count > best.count ? day : best), series[0]);
  const maxDay = Math.max(1, ...series.map((day) => day.count));
  const statuses = statusSlices(tickets);
  const categories = countBy(tickets, (row) => row.category || "Uncategorized");
  const types = countBy(tickets, (row) => row.type || "Unknown");
  const mid = series[Math.floor(series.length / 2)];

  return (
    <>
      <section className="rounded-xl border border-sts-card-border bg-sts-card">
        <SectionTitle>CREATED OVER 30 DAYS</SectionTitle>
        <div className="px-4 py-4">
          <p className="mb-3 font-sans text-[12px] text-sts-muted">
            {peak && peak.count > 0
              ? `Busiest day ${dayLabel(peak.key)} · ${peak.count} ${peak.count === 1 ? "ticket" : "tickets"}`
              : "No tickets in this window"}
          </p>
          <div className="flex h-36 items-end gap-[3px]" role="img" aria-label="Tickets created each day">
            {series.map((day) => (
              <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${dayLabel(day.key)}: ${day.count}`}>
                <div
                  className="w-full rounded-sm bg-sts-blue"
                  style={{
                    height: day.count === 0 ? "2px" : `${Math.max(8, (day.count / maxDay) * 100)}%`,
                    opacity: day.count === 0 ? 0.25 : 1,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between font-sans text-[11px] text-sts-subtle">
            <span>{series[0] ? dayLabel(series[0].key) : ""}</span>
            <span>{mid ? dayLabel(mid.key) : ""}</span>
            <span>{series.at(-1) ? dayLabel(series.at(-1)!.key) : ""}</span>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-sts-card-border bg-sts-card">
          <SectionTitle>STATUS</SectionTitle>
          <div className="flex flex-wrap items-center gap-5 px-4 py-4">
            <Donut slices={statuses} total={tickets.length} />
            <ul className="min-w-0 flex-1 space-y-2">
              {statuses.map((slice) => (
                <li key={slice.label} className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                  <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-sts-foreground">
                    {prettyLabel(slice.label)}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-sts-foreground">{slice.count}</span>
                  <span className="w-9 text-right font-sans text-[11.5px] tabular-nums text-sts-subtle">
                    {Math.round((slice.count / tickets.length) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-xl border border-sts-card-border bg-sts-card">
          <SectionTitle>DEPARTMENTS</SectionTitle>
          <div className="px-4 py-4">
            {departments.length === 0 ? (
              <p className="font-sans text-[12.5px] text-sts-subtle">No department activity in this window.</p>
            ) : (
              <ShareBars
                rows={departments.map((dept) => ({ label: dept.departmentName, count: dept.count }))}
                color="var(--sts-blue)"
              />
            )}
          </div>
        </section>
      </div>

      {(categories.length > 1 || types.length > 1) && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {categories.length > 1 && (
            <section className="rounded-xl border border-sts-card-border bg-sts-card">
              <SectionTitle>CATEGORY</SectionTitle>
              <div className="px-4 py-4">
                <ShareBars rows={categories} />
              </div>
            </section>
          )}
          {types.length > 1 && (
            <section className="rounded-xl border border-sts-card-border bg-sts-card">
              <SectionTitle>TYPE</SectionTitle>
              <div className="px-4 py-4">
                <ShareBars rows={types} />
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Super Admin reports on the platform tenant list. "All tenants" is the
 * combined volume. Choosing a tenant reloads with that tenant id on the query.
 */
export function CrossTenantVolumePanel() {
  const [start] = useState(() => isoDaysAgo(30));
  const [end] = useState(() => new Date().toISOString());
  const [tenants, setTenants] = useState<TenantVolumeRow[] | null>(null);
  const [tenantId, setTenantId] = useState("all");
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [tickets, setTickets] = useState<TenantTicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ start, end });
    if (tenantId !== "all") params.set("tenantId", tenantId);
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/reports/cross-tenant-volume?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Failed to load report");
        return json as {
          tenants?: TenantVolumeRow[];
          tickets?: TenantTicketRow[];
          departments?: DepartmentRow[];
        };
      })
      .then((json) => {
        if (cancelled) return;
        if (tenantId === "all") {
          setTenants(json.tenants ?? []);
          setTickets(null);
          setDepartments([]);
        } else {
          setTickets((json.tickets ?? []).filter((row) => row.tenantId === tenantId));
          setDepartments(json.departments ?? []);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load report");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [start, end, tenantId]);

  const selectedName =
    tenantId === "all"
      ? "All tenants"
      : tenants?.find((tenant) => tenant.tenantId === tenantId)?.tenantName ?? "Tenant";
  const active = (tenants ?? []).filter((tenant) => tenant.count > 0);
  const quiet = (tenants ?? []).filter((tenant) => tenant.count === 0);
  const total = (tenants ?? []).reduce((sum, tenant) => sum + tenant.count, 0);
  const maxCount = Math.max(1, ...active.map((tenant) => tenant.count));
  const top = active[0];

  const tenantFilter = (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className="flex h-8 w-[220px] items-center justify-between gap-2 rounded-full border border-sts-card-border bg-sts-card px-3 font-sans text-[12.5px] font-semibold text-sts-foreground outline-none hover:bg-sts-bg"
      >
        <span className="truncate">{selectedName}</span>
        <ChevronDown className="size-3.5 shrink-0 text-sts-subtle" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-[240px] overflow-y-auto font-sans">
        <DropdownMenuItem onClick={() => setTenantId("all")} className="gap-2">
          <span className="flex-1">All tenants</span>
          {tenantId === "all" && <Check className="size-3 text-sts-blue" />}
        </DropdownMenuItem>
        {(tenants ?? []).map((tenant) => (
          <DropdownMenuItem key={tenant.tenantId} onClick={() => setTenantId(tenant.tenantId)} className="gap-2">
            <span className="min-w-0 flex-1 truncate">{tenant.tenantName}</span>
            <span className="font-mono text-[11px] tabular-nums text-sts-subtle">{tenant.count}</span>
            {tenantId === tenant.tenantId && <Check className="size-3 text-sts-blue" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="sts-page-pad flex flex-col gap-4">
      <PageHeader
        title="Reports"
        icon={ChartColumn}
        iconClassName="text-sts-blue"
        description="Ticket volume across every tenant for the last 30 days. Filter to one tenant to see how that volume breaks down."
        actions={tenantFilter}
      />

      {error && (
        <p className="rounded-xl border border-sts-card-border bg-sts-card px-4 py-3 font-sans text-[12.5px] text-sts-subtle">
          {error}
        </p>
      )}

      {tenantId === "all" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="TICKETS"
              value={loading && !tenants ? "—" : String(total)}
              detail="Created in the last 30 days"
              icon={Ticket}
            />
            <Stat
              label="ACTIVE TENANTS"
              value={loading && !tenants ? "—" : String(active.length)}
              detail={tenants ? `${tenants.length} tenants on the platform` : "Loading…"}
              icon={Building2}
            />
            <Stat
              label="BUSIEST"
              value={top ? String(top.count) : "—"}
              detail={top ? top.tenantName : "No ticket activity yet"}
              icon={ChartColumn}
            />
          </div>

          <section className="rounded-xl border border-sts-card-border bg-sts-card">
            <div className="border-b border-sts-card-border px-4 py-2.5">
              <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-sts-subtle">
                VOLUME BY TENANT
              </p>
            </div>
            {loading && !tenants && (
              <p className="px-4 py-6 font-sans text-[12.5px] text-sts-subtle">Loading…</p>
            )}
            {tenants && active.length === 0 && (
              <p className="px-4 py-6 font-sans text-[12.5px] text-sts-subtle">
                No tickets were created in the last 30 days.
              </p>
            )}
            {active.length > 0 && (
              <ul className="divide-y divide-sts-card-border/70">
                {active.map((tenant, index) => {
                  const share = Math.round((tenant.count / Math.max(total, 1)) * 100);
                  return (
                    <li key={tenant.tenantId}>
                      <button
                        type="button"
                        onClick={() => setTenantId(tenant.tenantId)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sts-bg/60"
                      >
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold",
                            index === 0 ? "bg-sts-blue-tint text-sts-id" : "bg-sts-surface text-sts-subtle",
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="w-36 shrink-0 truncate font-sans text-[13px] font-medium text-sts-foreground sm:w-48">
                          {tenant.tenantName}
                        </span>
                        <span className="hidden h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-sts-surface sm:block">
                          <span
                            className="block h-full rounded-full bg-sts-blue"
                            style={{ width: `${Math.max(4, (tenant.count / maxCount) * 100)}%` }}
                          />
                        </span>
                        <span className="ml-auto w-10 shrink-0 text-right font-mono text-[12.5px] font-semibold tabular-nums text-sts-foreground">
                          {tenant.count}
                        </span>
                        <span className="w-10 shrink-0 text-right font-sans text-[11.5px] tabular-nums text-sts-subtle">
                          {share}%
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {quiet.length > 0 && (
              <p className="border-t border-sts-card-border px-4 py-2.5 font-sans text-[12px] text-sts-subtle">
                {quiet.length} {quiet.length === 1 ? "tenant has" : "tenants have"} no tickets in this window.
              </p>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="TICKETS"
              value={loading && !tickets ? "—" : String(tickets?.length ?? 0)}
              detail={selectedName}
              icon={Ticket}
            />
            <Stat
              label="DEPARTMENTS"
              value={loading ? "—" : String(departments.length)}
              detail="With tickets in this window"
              icon={Building2}
            />
            <Stat
              label="SHARE OF PLATFORM"
              value={total > 0 && tickets ? `${Math.round((tickets.length / total) * 100)}%` : "—"}
              detail={`${total} tickets across all tenants`}
              icon={ChartColumn}
            />
          </div>

          {loading && !tickets && (
            <p className="rounded-xl border border-sts-card-border bg-sts-card px-4 py-6 font-sans text-[12.5px] text-sts-subtle">
              Loading…
            </p>
          )}
          {tickets && tickets.length === 0 && !loading && (
            <p className="rounded-xl border border-sts-card-border bg-sts-card px-4 py-6 font-sans text-[12.5px] text-sts-subtle">
              No tickets in this window.
            </p>
          )}
          {tickets && tickets.length > 0 && (
            <TenantCharts
              tickets={tickets}
              departments={departments}
              start={start}
              end={end}
            />
          )}
        </>
      )}
    </div>
  );
}
