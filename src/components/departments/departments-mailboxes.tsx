"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Inbox,
  Mail,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export type DepartmentMailboxUsage = {
  departmentId: string;
  name: string;
  /** Total mailbox connections in the department. */
  total: number;
  /** Connections currently healthy (ACTIVE). */
  active: number;
  /** Connections needing attention (AUTH_ERROR + UNREACHABLE). */
  issues: number;
  /** ISO timestamp of the newest health check across the department, or null. */
  lastCheckedAt: string | null;
};

type FilterKey = "all" | "attention" | "uncovered";
type SortKey = "name" | "total" | "issues";
type SortDir = "asc" | "desc";

/** Relative "…ago" formatting (mirrors department-mailboxes-page.tsx). */
function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function StatCard({
  icon: Icon,
  label,
  value,
  alert,
}: {
  icon: typeof Mail;
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-sts-card-border bg-sts-card p-4">
      <div className="flex items-center gap-1.5 font-sans text-[11.5px] font-medium text-sts-muted">
        <Icon className={cn("size-3.5", alert && value > 0 ? "text-amber-500" : "text-sts-subtle")} />
        {label}
      </div>
      <span
        className={cn(
          "font-sans text-[22px] font-semibold tabular-nums leading-none",
          alert && value > 0 ? "text-amber-600 dark:text-amber-400" : "text-sts-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Tenant-wide view of how shared mailboxes are distributed across departments.
 * Read-only overview — enter a department (click a row) to connect or manage
 * its inboxes on /settings/departments/[id]/mailbox.
 */
export function DepartmentsMailboxes({ rows }: { rows: DepartmentMailboxUsage[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const totals = useMemo(() => {
    let mailboxes = 0;
    let healthy = 0;
    let attention = 0;
    let uncovered = 0;
    for (const r of rows) {
      mailboxes += r.total;
      healthy += r.active;
      attention += r.issues;
      if (r.total === 0) uncovered += 1;
    }
    return { mailboxes, healthy, attention, uncovered };
  }, [rows]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      attention: rows.filter((r) => r.issues > 0).length,
      uncovered: rows.filter((r) => r.total === 0).length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (filter === "attention") return r.issues > 0;
      if (filter === "uncovered") return r.total === 0;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return dir * a.name.localeCompare(b.name);
      const av = sortKey === "total" ? a.total : a.issues;
      const bv = sortKey === "total" ? b.total : b.issues;
      // Tie-break alphabetically so ordering stays stable.
      return dir * (av - bv) || a.name.localeCompare(b.name);
    });
  }, [rows, query, filter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text defaults A→Z; numeric defaults high→low.
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const SortIcon = ({ column }: { column: SortKey }) =>
    sortKey !== column ? null : sortDir === "asc" ? (
      <ArrowUp className="size-3" />
    ) : (
      <ArrowDown className="size-3" />
    );

  const filterTabs: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "attention", label: "Need attention", count: counts.attention },
    { key: "uncovered", label: "Uncovered", count: counts.uncovered },
  ];

  return (
    <div className="flex flex-col gap-5 px-6 py-6 sm:px-10">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-sts-muted" />
          <h1 className="sts-text-admin-title">Mailboxes</h1>
        </div>
        <p className="mt-[3px] font-sans text-[13px] text-sts-muted">
          How shared inboxes are distributed across every department in this tenant.
        </p>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Mail} label="Mailboxes" value={totals.mailboxes} />
        <StatCard icon={Inbox} label="Healthy" value={totals.healthy} />
        <StatCard icon={AlertTriangle} label="Need attention" value={totals.attention} alert />
        <StatCard icon={AlertTriangle} label="Uncovered depts" value={totals.uncovered} alert />
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          {filterTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-sans text-[12px] font-medium transition-colors",
                filter === t.key
                  ? "bg-sts-blue-tint text-sts-id"
                  : "text-sts-muted hover:bg-sts-surface hover:text-sts-foreground",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10.5px] tabular-nums",
                  filter === t.key ? "bg-sts-blue/15 text-sts-id" : "bg-sts-surface text-sts-subtle",
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sts-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search departments…"
            className="h-9 w-full rounded-lg border border-sts-card-border bg-sts-surface pl-8 pr-3 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-blue/50"
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-2xl border border-sts-card-border bg-sts-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  type="button"
                  onClick={() => toggleSort("name")}
                  className="flex items-center gap-1 hover:text-sts-foreground"
                >
                  Department
                  <SortIcon column="name" />
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("total")}
                  className="ml-auto flex items-center gap-1 hover:text-sts-foreground"
                >
                  Mailboxes
                  <SortIcon column="total" />
                </button>
              </TableHead>
              <TableHead className="text-right">Healthy</TableHead>
              <TableHead className="text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("issues")}
                  className="ml-auto flex items-center gap-1 hover:text-sts-foreground"
                >
                  Need attention
                  <SortIcon column="issues" />
                </button>
              </TableHead>
              <TableHead className="text-right">Last checked</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center font-sans text-[12.5px] text-sts-muted">
                  No departments yet.
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center font-sans text-[12.5px] text-sts-muted">
                  No departments match your search.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => (
                <TableRow key={r.departmentId} className="group relative cursor-pointer">
                  <TableCell className="font-sans text-[13px] font-medium text-sts-foreground">
                    <Link
                      href={`/settings/departments/${r.departmentId}/mailbox`}
                      className="block after:absolute after:inset-0"
                    >
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-sans text-[13px] tabular-nums">
                    {r.total === 0 ? (
                      <span className="text-sts-subtle">No mailbox</span>
                    ) : (
                      <span className="font-semibold text-sts-foreground">{r.total}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-sans text-[13px] tabular-nums text-sts-muted">
                    {r.active}
                  </TableCell>
                  <TableCell className="text-right font-sans text-[13px] tabular-nums">
                    {r.issues > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="size-3" />
                        {r.issues}
                      </span>
                    ) : (
                      <span className="text-sts-subtle">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-sans text-[11.5px] tabular-nums text-sts-subtle">
                    {relativeTime(r.lastCheckedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <ChevronRight className="ml-auto size-4 text-sts-subtle transition-colors group-hover:text-sts-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="font-sans text-[11.5px] text-sts-subtle">
        Click a department to connect or manage its shared inboxes.
      </p>
    </div>
  );
}
