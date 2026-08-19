"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, ListFilter } from "lucide-react";
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
  ACTIVE: "bg-pen-green/10 text-pen-green",
  PENDING_RENEWAL: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  RENEWED: "bg-pen-blue/10 text-pen-blue",
  EXPIRED: "bg-pen-red/10 text-pen-red",
  CANCELLED: "bg-pen-surface text-pen-subtle",
};

type SummaryRow = {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  agreementEndDate: string | null;
  renewalStatus: RenewalStatus | null;
  departmentCount: number;
  activeUserCount: number;
};

type SortField = "tenantName" | "tenantStatus" | "agreementEndDate" | "renewalStatus" | "departmentCount" | "activeUserCount";

const COLUMNS: { key: SortField; label: string }[] = [
  { key: "tenantName", label: "Tenant" },
  { key: "tenantStatus", label: "Status" },
  { key: "agreementEndDate", label: "Agreement ends" },
  { key: "renewalStatus", label: "Renewal" },
  { key: "departmentCount", label: "Depts" },
  { key: "activeUserCount", label: "Active users" },
];

export function TenantStatusSummary() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("tenantName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [renewalFilter, setRenewalFilter] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ sortBy, sortDir });
        if (renewalFilter) params.set("renewalStatus", renewalFilter);
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
  }, [sortBy, sortDir, renewalFilter]);

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-sans text-[13px] font-semibold text-pen-foreground">Tenant status summary</h2>
        <Select value={renewalFilter || "__all__"} onValueChange={(v) => setRenewalFilter(v === "__all__" ? "" : v ?? "")}>
          <SelectTrigger className="h-8 min-w-[180px]">
            <div className="flex items-center gap-1.5">
              <ListFilter className="size-3.5 text-pen-subtle" />
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

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortBy === col.key &&
                      (sortDir === "asc" ? (
                        <ChevronUp className="size-3" />
                      ) : (
                        <ChevronDown className="size-3" />
                      ))}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} className="py-6 text-center font-sans text-[12.5px] text-pen-muted">
                  {loading ? "Loading…" : "No tenants yet"}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.tenantId}>
                  <TableCell className="font-sans text-[12.5px] font-medium text-pen-foreground">
                    <Link href={`/platform/${r.tenantId}`} className="hover:underline">
                      {r.tenantName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-sans text-[12.5px] text-pen-muted">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-sans text-[11px] font-medium",
                        r.tenantStatus === "suspended"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-pen-green/10 text-pen-green",
                      )}
                    >
                      {r.tenantStatus === "suspended" ? "Suspended" : "Active"}
                    </span>
                  </TableCell>
                  <TableCell className="font-sans text-[12.5px] text-pen-muted">
                    {r.agreementEndDate ? new Date(r.agreementEndDate).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="font-sans text-[12.5px] text-pen-muted">
                    {r.renewalStatus ? (
                      <span className={cn("rounded-full px-2 py-0.5 font-sans text-[11px] font-medium", STATUS_CLASS[r.renewalStatus])}>
                        {STATUS_LABEL[r.renewalStatus]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="font-sans text-[12.5px] text-pen-muted">{r.departmentCount}</TableCell>
                  <TableCell className="font-sans text-[12.5px] text-pen-muted">{r.activeUserCount}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
