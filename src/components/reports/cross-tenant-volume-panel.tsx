"use client";

import { useEffect, useState } from "react";

type TenantVolumeRow = { tenantId: string; tenantName: string; count: number };
type TenantTicketRow = {
  id: string;
  tenantId: string;
  humanId: string;
  title: string;
  status: string;
  type: string;
  category: string;
  createdAt: string;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * TC-038: Super Admin ticket volume for the last 30 days, one row per tenant.
 * Drill-down asks the API for that tenant id; the list is whatever the query
 * returned for that id.
 */
export function CrossTenantVolumePanel() {
  const [start] = useState(() => isoDaysAgo(30));
  const [end] = useState(() => new Date().toISOString());
  const [tenants, setTenants] = useState<TenantVolumeRow[] | null>(null);
  const [selected, setSelected] = useState<TenantVolumeRow | null>(null);
  const [tickets, setTickets] = useState<TenantTicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qs = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    let cancelled = false;
    fetch(`/api/reports/cross-tenant-volume?${qs}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Failed to load report");
        return json as { tenants?: TenantVolumeRow[] };
      })
      .then((json) => {
        if (!cancelled) setTenants(json.tenants ?? []);
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
  }, [start, end]);

  async function openTenant(tenant: TenantVolumeRow) {
    setSelected(tenant);
    setTickets(null);
    setError(null);
    setLoading(true);
    try {
      const qs = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&tenantId=${encodeURIComponent(tenant.tenantId)}`;
      const res = await fetch(`/api/reports/cross-tenant-volume?${qs}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to load tickets");
      const rows = (json.tickets ?? []) as TenantTicketRow[];
      setTickets(rows.filter((row) => row.tenantId === tenant.tenantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  const total = tenants?.reduce((sum, tenant) => sum + tenant.count, 0) ?? 0;

  return (
    <section className="border-b border-sts-card-border px-6 py-5">
      <h2 className="font-sans text-sm font-semibold text-sts-foreground">
        Cross-tenant ticket volume (last 30 days)
      </h2>
      <p className="mt-1 font-sans text-[12.5px] text-sts-subtle">
        Ticket counts per tenant. Open a tenant to see only that tenant&apos;s tickets.
      </p>
      {error && <p className="mt-2 font-sans text-[12.5px] text-sts-subtle">{error}</p>}

      {selected ? (
        <div className="mt-3 rounded-xl border border-sts-card-border bg-sts-card p-4">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setTickets(null);
              setError(null);
            }}
            className="font-sans text-[12.5px] font-medium text-sts-subtle hover:text-sts-foreground"
          >
            All tenants
          </button>
          <p className="mt-2 font-sans text-sm font-semibold text-sts-foreground">
            {selected.tenantName}
            <span className="ml-2 font-normal text-sts-subtle">{selected.count} tickets</span>
          </p>
          {loading && <p className="mt-2 font-sans text-[12.5px] text-sts-subtle">Loading…</p>}
          {tickets && tickets.length === 0 && !loading && (
            <p className="mt-2 font-sans text-[12.5px] text-sts-subtle">No tickets in this window.</p>
          )}
          {tickets && tickets.length > 0 && (
            <ul className="mt-3 divide-y divide-sts-card-border">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="flex items-baseline justify-between gap-3 py-2">
                  <a href={`/tickets/${ticket.id}`} className="min-w-0 truncate font-sans text-[12.5px] text-sts-foreground hover:underline">
                    <span className="mr-2 font-mono text-[11.5px] text-sts-subtle">{ticket.humanId}</span>
                    {ticket.title}
                  </a>
                  <span className="shrink-0 font-sans text-[12px] text-sts-subtle">
                    {ticket.status}
                    {" · "}
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-sts-card-border bg-sts-card p-4">
          <p className="font-sans text-[11.5px] font-medium uppercase tracking-wide text-sts-subtle">
            All tenants
          </p>
          <p className="mt-1 font-sans text-2xl font-semibold text-sts-foreground">
            {loading && !tenants ? "—" : total}
          </p>
          {tenants && tenants.length === 0 && (
            <p className="mt-2 font-sans text-[12.5px] text-sts-subtle">No tenants to report.</p>
          )}
          {tenants && tenants.length > 0 && (
            <ul className="mt-3 space-y-1">
              {tenants.map((tenant) => (
                <li key={tenant.tenantId}>
                  <button
                    type="button"
                    onClick={() => openTenant(tenant)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left font-sans text-[12.5px] text-sts-foreground hover:bg-sts-blue-tint/50"
                  >
                    <span className="truncate">{tenant.tenantName}</span>
                    <span className="text-sts-subtle">{tenant.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
