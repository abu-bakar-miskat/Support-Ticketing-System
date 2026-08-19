"use client";

import { useEffect, useState } from "react";
import { History, ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type TenantOption = { id: string; name: string; slug: string };

type AuditEvent = {
  id: string;
  actorId: string;
  actor: { id: string; name: string | null; email: string } | null;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
};

function EventRow({ event }: { event: AuditEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = event.before != null || event.after != null;

  return (
    <>
      <TableRow
        className={cn(hasDetails && "cursor-pointer")}
        onClick={() => hasDetails && setExpanded((e) => !e)}
      >
        <TableCell className="w-6">
          {hasDetails ? (
            expanded ? (
              <ChevronDown className="size-3.5 text-pen-subtle" />
            ) : (
              <ChevronRight className="size-3.5 text-pen-subtle" />
            )
          ) : null}
        </TableCell>
        <TableCell className="font-sans text-[12.5px] font-medium text-pen-foreground">{event.action}</TableCell>
        <TableCell className="font-sans text-[12.5px] text-pen-muted">
          {event.targetType}
          <span className="text-pen-subtle"> · {event.targetId}</span>
        </TableCell>
        <TableCell className="font-sans text-[12.5px] text-pen-muted">
          {event.actor?.name ?? event.actor?.email ?? event.actorId}
        </TableCell>
        <TableCell className="font-sans text-[12.5px] text-pen-subtle">
          {new Date(event.createdAt).toLocaleString()}
        </TableCell>
      </TableRow>
      {expanded && hasDetails && (
        <TableRow>
          <TableCell colSpan={5} className="bg-pen-bg/40 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {event.before != null && (
                <div>
                  <p className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
                    Before
                  </p>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-pen-card p-2 font-mono text-[11px] text-pen-muted">
                    {JSON.stringify(event.before, null, 2)}
                  </pre>
                </div>
              )}
              {event.after != null && (
                <div>
                  <p className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
                    After
                  </p>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-pen-card p-2 font-mono text-[11px] text-pen-muted">
                    {JSON.stringify(event.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function PlatformActivityLog({ tenants }: { tenants: TenantOption[] }) {
  const [tenantId, setTenantId] = useState<string>(tenants[0]?.id ?? "");
  const [targetType, setTargetType] = useState<string>("");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function fetchPage(after: string | null) {
    const params = new URLSearchParams({ tenantId, take: "50" });
    if (targetType) params.set("targetType", targetType);
    if (after) params.set("cursor", after);
    const res = await fetch(`/api/admin/audit-events?${params}`);
    if (!res.ok) throw new Error("Failed to load activity");
    return res.json() as Promise<{ events: AuditEvent[]; nextCursor: string | null }>;
  }

  useEffect(() => {
    if (!tenantId) return;
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
        if (!cancelled) setError("Failed to load activity for this tenant");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, targetType, refreshKey]);

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

  const selectedTenant = tenants.find((t) => t.id === tenantId);

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={History}
          title="Activity Log"
          description="Full audit history of Super Admin and tenant-admin actions — feature flags, tenant lifecycle, agreements, templates, and more."
        />

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Select value={tenantId} onValueChange={(v) => v && setTenantId(v)}>
            <SelectTrigger className="h-9 w-[220px]">
              <span className="truncate font-sans text-[12.5px]">
                {selectedTenant?.name ?? "Select a tenant"}
              </span>
            </SelectTrigger>
            <SelectContent>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id} className="font-sans text-[12.5px]">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={targetType || "__all__"} onValueChange={(v) => setTargetType(v === "__all__" ? "" : v ?? "")}>
            <SelectTrigger className="h-9 w-[190px]">
              <span className="truncate font-sans text-[12.5px]">{targetType || "All target types"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="font-sans text-[12.5px]">
                All target types
              </SelectItem>
              {TARGET_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="font-sans text-[12.5px]">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading || !tenantId}
          >
            <RotateCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6" />
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center font-sans text-[12.5px] text-pen-muted">
                    {loading ? "Loading…" : "No activity yet"}
                  </TableCell>
                </TableRow>
              ) : (
                events.map((e) => <EventRow key={e.id} event={e} />)
              )}
            </TableBody>
          </Table>
        </div>

        {cursor && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
