"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
          mode?: string;
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
    tenantId === "all" ? "All tenants" : tenants?.find((tenant) => tenant.tenantId === tenantId)?.tenantName ?? "Tenant";
  const total = tenants?.reduce((sum, tenant) => sum + tenant.count, 0) ?? 0;

  return (
    <div className="sts-page-pad flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-sans text-lg font-semibold text-sts-foreground">Reports</h1>
          <p className="mt-1 font-sans text-[12.5px] text-sts-subtle">
            Combined ticket volume for the last 30 days. Choose a tenant to see only that tenant.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            className="flex h-[30px] w-[200px] items-center justify-between gap-2 rounded-full border border-sts-card-border bg-sts-card px-3 font-sans text-[11.5px] font-semibold text-sts-foreground outline-none hover:bg-sts-bg"
          >
            <span className="truncate">{selectedName}</span>
            <ChevronDown className="size-3 shrink-0 text-sts-subtle" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 w-[220px] overflow-y-auto font-sans">
            <DropdownMenuItem onClick={() => setTenantId("all")} className="gap-2">
              <span className="flex-1">All tenants</span>
              {tenantId === "all" && <Check className="size-3 text-sts-blue" />}
            </DropdownMenuItem>
            {(tenants ?? []).map((tenant) => (
              <DropdownMenuItem key={tenant.tenantId} onClick={() => setTenantId(tenant.tenantId)} className="gap-2">
                <span className="flex-1 truncate">{tenant.tenantName}</span>
                {tenantId === tenant.tenantId && <Check className="size-3 text-sts-blue" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error && <p className="font-sans text-[12.5px] text-sts-subtle">{error}</p>}

      {tenantId === "all" ? (
        <div className="rounded-xl border border-sts-card-border bg-sts-card p-4">
          <p className="font-sans text-[11.5px] font-medium uppercase tracking-wide text-sts-subtle">All tenants</p>
          <p className="mt-1 font-sans text-2xl font-semibold text-sts-foreground">{loading && !tenants ? "—" : total}</p>
          {tenants && tenants.length === 0 && (
            <p className="mt-2 font-sans text-[12.5px] text-sts-subtle">No tenants to report.</p>
          )}
          {tenants && tenants.length > 0 && (
            <ul className="mt-3 divide-y divide-sts-card-border">
              {tenants.map((tenant) => (
                <li key={tenant.tenantId}>
                  <button
                    type="button"
                    onClick={() => setTenantId(tenant.tenantId)}
                    className="flex w-full items-center justify-between gap-3 py-2 text-left font-sans text-[12.5px] text-sts-foreground hover:text-sts-blue"
                  >
                    <span className="truncate">{tenant.tenantName}</span>
                    <span className="text-sts-subtle">{tenant.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-sts-card-border bg-sts-card p-4">
            <p className="font-sans text-[11.5px] font-medium uppercase tracking-wide text-sts-subtle">Departments</p>
            {loading && <p className="mt-2 font-sans text-[12.5px] text-sts-subtle">Loading…</p>}
            {!loading && departments.length === 0 && (
              <p className="mt-2 font-sans text-[12.5px] text-sts-subtle">No department activity in this window.</p>
            )}
            {departments.length > 0 && (
              <ul className="mt-3 space-y-1">
                {departments.map((dept) => (
                  <li key={dept.departmentId} className="flex justify-between font-sans text-[12.5px] text-sts-foreground">
                    <span className="truncate">{dept.departmentName}</span>
                    <span className="text-sts-subtle">{dept.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-sts-card-border bg-sts-card p-4">
            <p className="font-sans text-[11.5px] font-medium uppercase tracking-wide text-sts-subtle">Tickets</p>
            {tickets && tickets.length === 0 && !loading && (
              <p className="mt-2 font-sans text-[12.5px] text-sts-subtle">No tickets in this window.</p>
            )}
            {tickets && tickets.length > 0 && (
              <ul className="mt-3 divide-y divide-sts-card-border">
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0 truncate font-sans text-[12.5px] text-sts-foreground">
                      <span className="mr-2 font-mono text-[11.5px] text-sts-subtle">{ticket.humanId}</span>
                      {ticket.title}
                    </span>
                    <span className="shrink-0 font-sans text-[12px] text-sts-subtle">{ticket.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
