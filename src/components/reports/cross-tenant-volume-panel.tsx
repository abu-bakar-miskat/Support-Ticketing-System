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
  createdAt: string;
};

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
  const deptMax = Math.max(1, ...departments.map((dept) => dept.count));

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
        description="Ticket volume across every tenant for the last 30 days. Filter to one tenant to see its departments and tickets."
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

          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,280px)_1fr]">
            <section className="rounded-xl border border-sts-card-border bg-sts-card">
              <div className="border-b border-sts-card-border px-4 py-2.5">
                <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-sts-subtle">
                  DEPARTMENTS
                </p>
              </div>
              <div className="px-4 py-3">
                {loading && <p className="font-sans text-[12.5px] text-sts-subtle">Loading…</p>}
                {!loading && departments.length === 0 && (
                  <p className="font-sans text-[12.5px] text-sts-subtle">No department activity in this window.</p>
                )}
                {departments.length > 0 && (
                  <ul className="flex flex-col gap-2.5">
                    {departments.map((dept) => (
                      <li key={dept.departmentId}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-sans text-[12.5px] text-sts-foreground">{dept.departmentName}</span>
                          <span className="font-mono text-[12px] tabular-nums text-sts-subtle">{dept.count}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sts-surface">
                          <div
                            className="h-full rounded-full bg-sts-blue"
                            style={{ width: `${Math.max(4, (dept.count / deptMax) * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="min-w-0 rounded-xl border border-sts-card-border bg-sts-card">
              <div className="border-b border-sts-card-border px-4 py-2.5">
                <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-sts-subtle">
                  TICKETS · {selectedName.toUpperCase()}
                </p>
              </div>
              {loading && <p className="px-4 py-6 font-sans text-[12.5px] text-sts-subtle">Loading…</p>}
              {tickets && tickets.length === 0 && !loading && (
                <p className="px-4 py-6 font-sans text-[12.5px] text-sts-subtle">No tickets in this window.</p>
              )}
              {tickets && tickets.length > 0 && (
                <ul className="max-h-[520px] divide-y divide-sts-card-border/70 overflow-y-auto">
                  {tickets.map((ticket) => (
                    <li key={ticket.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-[72px] shrink-0 font-mono text-[11.5px] text-sts-id">{ticket.humanId}</span>
                      <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-sts-foreground">
                        {ticket.title}
                      </span>
                      <span className="hidden shrink-0 font-sans text-[11.5px] text-sts-subtle sm:inline">
                        {new Date(ticket.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                      <span className="shrink-0 rounded-full bg-sts-surface px-2 py-0.5 font-sans text-[11px] text-sts-muted">
                        {ticket.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
