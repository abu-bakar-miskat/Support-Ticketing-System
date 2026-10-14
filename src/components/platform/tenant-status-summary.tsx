"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, ListFilter } from "lucide-react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getAgreementExpiry } from "@/lib/agreement-expiry";

const RENEWAL_STATUSES = ["ACTIVE", "PENDING_RENEWAL", "RENEWED", "EXPIRED", "CANCELLED"] as const;
type RenewalStatus = (typeof RENEWAL_STATUSES)[number];

const STATUS_LABEL: Record<RenewalStatus, string> = {
  ACTIVE: "Active",
  PENDING_RENEWAL: "Pending renewal",
  RENEWED: "Renewed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

const STATUS_CLASS: Record<RenewalStatus, string> = {
  ACTIVE: "bg-sts-green/10 text-sts-green",
  PENDING_RENEWAL: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  RENEWED: "bg-sts-blue/10 text-sts-blue",
  EXPIRED: "bg-sts-red/10 text-sts-red",
  CANCELLED: "bg-sts-surface text-sts-subtle",
};

type SummaryRow = {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  tenantCreatedAt: string;
  agreementEndDate: string | null;
  renewalStatus: RenewalStatus | null;
  departmentCount: number;
  activeUserCount: number;
};

type SortField = "tenantName" | "tenantStatus" | "tenantCreatedAt" | "agreementEndDate" | "renewalStatus" | "departmentCount" | "activeUserCount";

const NUMERIC_COLUMNS = new Set<SortField>(["departmentCount", "activeUserCount"]);

const formatDate = (iso: string) => format(new Date(iso), "d MMM yyyy");

const COLUMNS: { key: SortField; label: string }[] = [
  { key: "tenantName", label: "Tenant" },
  { key: "tenantStatus", label: "Status" },
  { key: "tenantCreatedAt", label: "Created" },
  { key: "agreementEndDate", label: "Agreement ends" },
  { key: "renewalStatus", label: "Renewal" },
  { key: "departmentCount", label: "Departments" },
  { key: "activeUserCount", label: "Active users" },
];

export function TenantStatusSummary() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("tenantName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [renewalFilter, setRenewalFilter] = useState<string>("");
  const [tenantStatusFilter, setTenantStatusFilter] = useState<string>("active");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ sortBy, sortDir });
        if (renewalFilter) params.set("renewalStatus", renewalFilter);
        if (tenantStatusFilter) params.set("tenantStatus", tenantStatusFilter);
        const res = await fetch(`/api/admin/tenants/agreement-summary?${params}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setError("Failed to load tenant summary");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sortBy, sortDir, renewalFilter, tenantStatusFilter]);

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  }

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-sans text-[14px] font-semibold text-sts-foreground">Status & agreements</h2>
          <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
            Renewal and access health across every tenant.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Select value={tenantStatusFilter || "__all__"} onValueChange={(v) => setTenantStatusFilter(v === "__all__" ? "" : v ?? "")}>
          <SelectTrigger className="h-8 min-w-[160px]">
            <div className="flex items-center gap-1.5">
              <ListFilter className="size-3.5 text-sts-subtle" />
              <span className="font-sans text-[12px]">
                {tenantStatusFilter === "active"
                  ? "Active"
                  : tenantStatusFilter === "suspended"
                    ? "Suspended"
                    : tenantStatusFilter === "deleted"
                      ? "Deleted"
                      : "All tenant statuses"}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="font-sans text-[12.5px]">All tenant statuses</SelectItem>
            <SelectItem value="active" className="font-sans text-[12.5px]">Active</SelectItem>
            <SelectItem value="suspended" className="font-sans text-[12.5px]">Suspended</SelectItem>
            <SelectItem value="deleted" className="font-sans text-[12.5px]">Deleted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={renewalFilter || "__all__"} onValueChange={(v) => setRenewalFilter(v === "__all__" ? "" : v ?? "")}>
          <SelectTrigger className="h-8 min-w-[180px]">
            <div className="flex items-center gap-1.5">
              <ListFilter className="size-3.5 text-sts-subtle" />
              <span className="font-sans text-[12px]">
                {renewalFilter ? STATUS_LABEL[renewalFilter as RenewalStatus] : "All renewal statuses"}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="font-sans text-[12.5px]">
              All renewal statuses
            </SelectItem>
            {RENEWAL_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="font-sans text-[12.5px]">
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-xl border border-sts-card-border bg-sts-card">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(NUMERIC_COLUMNS.has(col.key) && "text-right")}
                  aria-sort={
                    sortBy === col.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined
                  }
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex items-center gap-1 rounded outline-none select-none hover:text-sts-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {col.label}
                    {sortBy === col.key &&
                      (sortDir === "asc" ? (
                        <ChevronUp className="size-3" aria-hidden />
                      ) : (
                        <ChevronDown className="size-3" aria-hidden />
                      ))}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} className="py-6 text-center font-sans text-[12.5px] text-sts-muted">
                  {loading ? "Loading…" : "No tenants yet"}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.tenantId}>
                  <TableCell className="font-sans text-[12.5px] font-medium text-sts-foreground">
                    <Link href={`/platform/${r.tenantId}`} className="hover:underline">
                      {r.tenantName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-sans text-[12.5px] text-sts-muted">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-sans text-[11px] font-medium",
                        r.tenantStatus === "deleted"
                          ? "bg-sts-red/10 text-sts-red"
                          : r.tenantStatus === "suspended"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "bg-sts-green/10 text-sts-green",
                      )}
                    >
                      {r.tenantStatus === "deleted"
                        ? "Deleted"
                        : r.tenantStatus === "suspended"
                          ? "Suspended"
                          : "Active"}
                    </span>
                  </TableCell>
                  <TableCell className="font-sans text-[12.5px] text-sts-muted">
                    {formatDate(r.tenantCreatedAt)}
                  </TableCell>
                  <TableCell className="font-sans text-[12.5px] text-sts-muted">
                    {r.agreementEndDate ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {formatDate(r.agreementEndDate)}
                        {(() => {
                          const flag = getAgreementExpiry(r.agreementEndDate, r.renewalStatus);
                          if (flag.state === "ok") return null;
                          return (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold",
                                flag.state === "expired"
                                  ? "bg-sts-red/10 text-sts-red"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                              )}
                            >
                              {flag.label}
                            </span>
                          );
                        })()}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="font-sans text-[12.5px] text-sts-muted">
                    {r.renewalStatus ? (
                      <span className={cn("rounded-full px-2 py-0.5 font-sans text-[11px] font-medium", STATUS_CLASS[r.renewalStatus])}>
                        {STATUS_LABEL[r.renewalStatus]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12.5px] text-sts-muted tabular-nums">
                    {r.departmentCount}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12.5px] text-sts-muted tabular-nums">
                    {r.activeUserCount}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
