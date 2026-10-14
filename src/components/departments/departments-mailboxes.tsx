"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Building2,
  ChevronDown,
  ChevronRight,
  Inbox,
  Mail,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { TenantMailboxPanel } from "@/components/mailbox/tenant-mailbox-panel";
import type { MailboxConnection } from "@/lib/api/admin";
import { MailboxesGuide } from "@/components/departments/mailboxes-guide";

export type DepartmentMailboxUsage = {
  departmentId: string;
  name: string;
  /** URL prefix naming this department (/<tenant>/<dept>), or "" when unknown. */
  basePath: string;
  subDepartments: {
    id: string;
    name: string;
    mailboxes: { address: string; status: "ACTIVE" | "AUTH_ERROR" | "UNREACHABLE"; lastCheckedAt: string | null }[];
  }[];
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

function SortIcon({
  column,
  sortKey,
  sortDir,
}: {
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
}) {
  if (sortKey !== column) return null;
  return sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
}

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

type RowStatus = "healthy" | "attention" | "uncovered";

function rowStatus(r: DepartmentMailboxUsage): RowStatus {
  if (r.total === 0) return "uncovered";
  if (r.issues > 0) return "attention";
  return "healthy";
}

const ROW_STATUS: Record<
  RowStatus,
  { label: string; dot: string; chip: string; avatar: string; avatarIcon: string }
> = {
  healthy: {
    label: "Healthy",
    dot: "bg-sts-green",
    chip: "bg-sts-green-tint text-sts-green",
    avatar: "bg-sts-green/15",
    avatarIcon: "text-sts-green",
  },
  attention: {
    label: "Needs attention",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    avatar: "bg-amber-400/20",
    avatarIcon: "text-amber-500",
  },
  uncovered: {
    label: "No mailbox",
    dot: "bg-sts-subtle",
    chip: "bg-sts-surface text-sts-subtle",
    avatar: "bg-sts-surface",
    avatarIcon: "text-sts-subtle",
  },
};

const MAILBOX_STATUS: Record<
  DepartmentMailboxUsage["subDepartments"][number]["mailboxes"][number]["status"],
  { label: string; dot: string; text: string }
> = {
  ACTIVE: { label: "Healthy", dot: "bg-sts-green", text: "text-sts-green" },
  AUTH_ERROR: { label: "Sign-in expired", dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  UNREACHABLE: { label: "Not responding", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
};

/**
 * Tenant-wide view of how shared mailboxes are distributed across departments.
 * Read-only overview — enter a department (click a row) to connect or manage
 * its inboxes on /settings/departments/[id]/mailbox.
 */
export function DepartmentsMailboxes({
  rows,
  tenantMailbox,
}: {
  rows: DepartmentMailboxUsage[];
  /** The organisation's send-only Microsoft 365 mailbox, if connected. */
  tenantMailbox: MailboxConnection | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedDepartmentIds, setExpandedDepartmentIds] = useState<Set<string>>(() => new Set());
  const [overviewOpen, setOverviewOpen] = useState(false);

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

  function toggleDepartment(departmentId: string) {
    setExpandedDepartmentIds((current) => {
      const next = new Set(current);
      if (next.has(departmentId)) next.delete(departmentId);
      else next.add(departmentId);
      return next;
    });
  }

  const filterTabs: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "attention", label: "Need attention", count: counts.attention },
    { key: "uncovered", label: "Uncovered", count: counts.uncovered },
  ];

  return (
    <div className="flex flex-col gap-5 px-6 py-6 sm:px-10">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-sts-muted" />
            <h1 className="sts-text-admin-title">Mailboxes</h1>
          </div>
          <p className="mt-[3px] font-sans text-[13px] text-sts-muted">
            Connect your organisation&rsquo;s Microsoft 365 mailbox; departments and sub-departments connect their own.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MailboxesGuide />
          <Button variant="outline" onClick={() => setOverviewOpen(true)}>
            <Inbox className="size-4" />
            Mailbox overview
            <span className="rounded-full bg-sts-surface px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-sts-subtle">
              {totals.mailboxes}
            </span>
            {totals.attention > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {totals.attention} need attention
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* ── Organisation (tenant) mailbox ── */}
      <TenantMailboxPanel initial={tenantMailbox} />

      {/* ── Mailbox overview (modal) ── */}
      <Dialog.Root open={overviewOpen} onOpenChange={setOverviewOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="sts-overlay-backdrop fixed inset-0 z-50" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex h-[min(680px,90dvh)] w-[min(1080px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-sts-card-border bg-sts-bg shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-sts-card-border px-5 py-6 sm:px-8">
              <div className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-sts-blue/15 bg-sts-blue-tint text-sts-blue">
                  <Inbox className="size-6" strokeWidth={1.5} />
                </span>
                <div>
                  <Dialog.Title className="font-sans text-[22px] font-semibold tracking-tight text-sts-foreground">
                    Mailbox overview
                  </Dialog.Title>
                  <Dialog.Description className="mt-1.5 max-w-md font-sans text-[13px] leading-relaxed text-sts-muted">
                    Connection health across your departments. Expand a row to view and manage its mailboxes.
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close
                aria-label="Close mailbox overview"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-sts-subtle transition-colors hover:bg-sts-surface hover:text-sts-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-blue"
              >
                <X className="size-4" />
              </Dialog.Close>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-5 py-6 sm:px-8">
              <dl className="grid shrink-0 grid-cols-2 gap-y-5 rounded-xl bg-sts-surface/70 px-5 py-5 sm:grid-cols-4 sm:gap-y-0">
                {[
                  { label: "Connected mailboxes", value: totals.mailboxes, icon: Mail, color: "text-sts-foreground" },
                  { label: "Healthy connections", value: totals.healthy, icon: CheckCircle2, color: "text-sts-green" },
                  { label: "Need attention", value: totals.attention, icon: AlertTriangle, color: totals.attention > 0 ? "text-amber-600 dark:text-amber-400" : "text-sts-muted" },
                  { label: "Uncovered departments", value: totals.uncovered, icon: Building2, color: "text-sts-muted" },
                ].map((stat) => (
                  <div key={stat.label} className="px-2 sm:border-l sm:border-sts-card-border sm:px-5 sm:first:border-l-0 sm:first:pl-0">
                    <dt className="font-sans text-[11px] font-medium text-sts-muted sm:text-[12px]">{stat.label}</dt>
                    <dd className={cn("mt-2 flex items-center gap-2.5 font-sans text-[28px] font-semibold leading-none tracking-tight tabular-nums", stat.color)}>
                      {stat.value}
                      <stat.icon className="size-4 opacity-70" strokeWidth={1.75} />
                    </dd>
                  </div>
                ))}
              </dl>
              {/* ── Controls ── */}
              <div className="flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-1 rounded-lg bg-sts-surface p-1">
                  {filterTabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setFilter(t.key)}
                      aria-pressed={filter === t.key}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 font-sans text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-blue",
                        filter === t.key
                          ? "bg-sts-card text-sts-foreground shadow-sm"
                          : "text-sts-muted hover:bg-sts-surface hover:text-sts-foreground",
                      )}
                    >
                      {t.label}
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums",
                          filter === t.key ? "bg-sts-blue-tint text-sts-blue" : "text-sts-subtle",
                        )}
                      >
                        {t.count}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="relative md:w-64 md:shrink-0">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sts-subtle" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search departments"
                    placeholder="Search departments…"
                    className="h-10 w-full rounded-lg border border-sts-card-border bg-sts-card pl-8 pr-3 font-sans text-[13px] text-sts-foreground outline-none transition-shadow placeholder:text-sts-subtle focus-visible:border-sts-blue/50 focus-visible:ring-2 focus-visible:ring-sts-blue/15"
                  />
                </div>
              </div>

              {/* ── Table ── */}
              <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-sts-card-border bg-sts-card">
                <Table className="[&_td]:px-4 [&_th]:h-11 [&_th]:px-4 [&_th]:text-[11px] [&_th]:font-medium [&_th]:text-sts-muted">
                  <TableHeader className="bg-sts-surface/70">
                    <TableRow>
                      <TableHead>
                        <button
                          type="button"
                          onClick={() => toggleSort("name")}
                          className="flex items-center gap-1 rounded-sm hover:text-sts-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-blue"
                        >
                          Department
                          <SortIcon column="name" sortKey={sortKey} sortDir={sortDir} />
                        </button>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">
                        <button
                          type="button"
                          onClick={() => toggleSort("total")}
                          className="ml-auto flex items-center gap-1 rounded-sm hover:text-sts-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-blue"
                        >
                          Mailboxes
                          <SortIcon column="total" sortKey={sortKey} sortDir={sortDir} />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">Healthy</TableHead>
                      <TableHead className="text-right">
                        <button
                          type="button"
                          onClick={() => toggleSort("issues")}
                          className="ml-auto flex items-center gap-1 rounded-sm hover:text-sts-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-blue"
                        >
                          Need attention
                          <SortIcon column="issues" sortKey={sortKey} sortDir={sortDir} />
                        </button>
                      </TableHead>
                      <TableHead className="text-right">Last checked</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center font-sans text-[12.5px] text-sts-muted">
                          No departments yet.
                        </TableCell>
                      </TableRow>
                    ) : visible.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center font-sans text-[12.5px] text-sts-muted">
                          <p className="font-medium text-sts-foreground">No matching departments</p>
                          <p className="mt-1">Try another search or change the selected filter.</p>
                          <button
                            type="button"
                            onClick={() => { setQuery(""); setFilter("all"); }}
                            className="mt-3 rounded-md px-3 py-1.5 font-medium text-sts-blue hover:bg-sts-blue-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-blue"
                          >
                            Clear filters
                          </button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      visible.map((r) => {
                        const status = rowStatus(r);
                        const s = ROW_STATUS[status];
                        const isExpanded = expandedDepartmentIds.has(r.departmentId);
                        return (
                        <Fragment key={r.departmentId}>
                          <TableRow
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            aria-controls={`department-mailboxes-${r.departmentId}`}
                            onClick={() => toggleDepartment(r.departmentId)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleDepartment(r.departmentId);
                              }
                            }}
                            className="group h-[72px] cursor-pointer transition-colors aria-expanded:bg-sts-surface/60 hover:bg-sts-surface/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sts-blue"
                          >
                          <TableCell className="font-sans text-[13px] font-medium text-sts-foreground">
                            <span className="flex items-center gap-2.5">
                              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", s.avatar)}>
                                <Building2 className={cn("size-4", s.avatarIcon)} />
                              </span>
                              <span>
                                <span className="block text-[13px] font-semibold">{r.name}</span>
                                <span className="mt-1 block text-[11px] font-normal text-sts-muted">
                                  {r.subDepartments.length} {r.subDepartments.length === 1 ? "sub-department" : "sub-departments"}
                                </span>
                              </span>
                            </span>
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-[11px] font-semibold",
                                s.chip,
                              )}
                            >
                              <span className={cn("size-1.5 rounded-full", s.dot)} />
                              {s.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-sans text-[13px] tabular-nums">
                            {r.total === 0 ? (
                              <span className="text-sts-subtle">—</span>
                            ) : (
                              <span className="font-semibold text-sts-foreground">{r.total}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-sans text-[13px] tabular-nums">
                            {r.active > 0 ? (
                              <span className="font-medium text-sts-green">{r.active}</span>
                            ) : (
                              <span className="text-sts-subtle">0</span>
                            )}
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
                            <ChevronDown
                              className={cn(
                                "ml-auto size-4 text-sts-subtle transition-transform group-hover:text-sts-foreground",
                                !isExpanded && "-rotate-90",
                              )}
                            />
                          </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow id={`department-mailboxes-${r.departmentId}`} className="bg-sts-surface/40 hover:bg-sts-surface/40">
                              <TableCell colSpan={7} className="whitespace-normal px-5 py-1 sm:px-7">
                                {r.subDepartments.length === 0 ? (
                                  <p className="font-sans text-[12px] text-sts-muted">No sub-departments yet.</p>
                                ) : (
                                  <div className="divide-y divide-sts-card-border">
                                    {r.subDepartments.map((subDepartment) => (
                                      <div key={subDepartment.id} className="py-4 pl-4 border-l-2 border-sts-card-border">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div>
                                            <p className="font-sans text-[12.5px] font-medium text-sts-foreground">
                                              {subDepartment.name}
                                            </p>
                                            <p className="mt-0.5 font-sans text-[11px] text-sts-muted">
                                              {subDepartment.mailboxes.length} {subDepartment.mailboxes.length === 1 ? "mailbox" : "mailboxes"}
                                            </p>
                                          </div>
                                          <Link
                                            href={`${r.basePath}/sub-departments/${encodeURIComponent(subDepartment.name)}/mailbox`}
                                            onClick={(event) => event.stopPropagation()}
                                            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 font-sans text-[12px] font-medium text-sts-blue transition-colors hover:bg-sts-blue-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-blue"
                                          >
                                            Manage mailboxes
                                            <ChevronRight className="size-3.5" />
                                          </Link>
                                        </div>
                                        {subDepartment.mailboxes.length === 0 ? (
                                          <p className="mt-2 font-sans text-[11.5px] text-sts-subtle">No mailbox connected.</p>
                                        ) : (
                                          <div className="mt-3 flex flex-col gap-2">
                                            {subDepartment.mailboxes.map((mailbox) => {
                                              const mailboxStatus = MAILBOX_STATUS[mailbox.status];
                                              return (
                                                <div key={mailbox.address} className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-1">
                                                  <p className="flex min-w-0 items-center gap-2 font-sans text-[12px] font-medium text-sts-foreground">
                                                    <Mail className="size-3.5 shrink-0 text-sts-subtle" />
                                                    <span className="break-all">{mailbox.address}</span>
                                                  </p>
                                                  <div className="flex items-center gap-5 font-sans text-[11px]">
                                                    <span className={cn("inline-flex items-center gap-1", mailboxStatus.text)}>
                                                      <span className={cn("size-1.5 rounded-full", mailboxStatus.dot)} />
                                                      {mailboxStatus.label}
                                                    </span>
                                                    <span className="text-sts-subtle">{relativeTime(mailbox.lastCheckedAt)}</span>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-sts-card-border bg-sts-surface/40 px-5 py-3 font-sans text-[11px] text-sts-muted sm:px-8">
              <span>Showing {visible.length} of {rows.length} departments</span>
              <span>Connection status reflects the latest mailbox health check.</span>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
