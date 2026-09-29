"use client";

import { useMemo, useRef, useState } from "react";
import {
  Plus,
  Loader2,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Mail,
  Building2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ManagerDnsRecord = {
  record: string;
  type: string;
  name: string;
  value: string;
  ttl: string;
  priority?: number;
  status: string;
};
export type ManagerDomain = {
  id: string;
  name: string;
  status: string;
  createdAt: string | null;
  records: ManagerDnsRecord[];
  /** Department / sub-department this domain is assigned to (tenant view). */
  scopeLabel?: string | null;
};

/** A department + its sub-departments for the cascading add-domain selector. */
export type ManagerDepartmentScope = {
  id: string;
  name: string;
  subDepartments: { id: string; name: string }[];
};

/** A domain the tenant's mailboxes send from, merged into the list read-only. */
export type ManagerInUseDomain = {
  domain: string;
  status: string;
  usedBy: string[];
  registered: boolean;
};

const WHOLE_DEPT = "__whole__";

// ── Status presentation ──────────────────────────────────────────────────────

type StatusVisual = { label: string; badge: string; Icon: typeof CheckCircle2; tone: "green" | "amber" | "red" | "muted" };

function statusVisual(status: string): StatusVisual {
  switch (status) {
    case "verified":
      return { label: "Verified", badge: "bg-sts-green/15 text-sts-green", Icon: CheckCircle2, tone: "green" };
    case "failed":
    case "partially_failed":
      return { label: "Verification failed", badge: "bg-destructive/15 text-destructive", Icon: AlertTriangle, tone: "red" };
    case "pending":
    case "not_started":
      return { label: "Awaiting verification", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400", Icon: Clock, tone: "amber" };
    case "temporary_failure":
      return { label: "Retrying", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400", Icon: Clock, tone: "amber" };
    case "partially_verified":
      return { label: "Partly verified", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400", Icon: Clock, tone: "amber" };
    default:
      return { label: "Unknown", badge: "bg-sts-surface text-sts-subtle", Icon: Clock, tone: "muted" };
  }
}

function StatusBadge({ status }: { status: string }) {
  const v = statusVisual(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[10.5px] font-semibold uppercase tracking-wide",
        v.badge,
      )}
    >
      <v.Icon className="size-3" />
      {v.label}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-sts-subtle hover:bg-sts-blue-tint hover:text-sts-foreground"
      aria-label="Copy value"
      title="Copy"
    >
      {copied ? <Check className="size-3.5 text-sts-green" /> : <Copy className="size-3.5" />}
    </button>
  );
}

// ── Merged row model ─────────────────────────────────────────────────────────

type MergedRow = {
  name: string;
  registered: boolean;
  id: string | null;
  status: string;
  records: ManagerDnsRecord[];
  scopeLabel: string | null;
  usedBy: string[];
};

/**
 * Add / verify / remove UI for Resend sending domains, with the tenant's
 * in-use mailbox domains merged into one list. Presentation-only — it talks to
 * whichever REST base it's given (`apiBase`), so the same component drives the
 * super-admin platform view and the tenant-admin views. Endpoints under
 * `apiBase`: GET / POST `/`, GET / DELETE `/:id`, POST `/:id/verify`.
 */
export function EmailDomainsManager({
  apiBase,
  initialDomains,
  loadError,
  departments,
  inUseDomains = [],
  allowRemove = true,
}: {
  apiBase: string;
  initialDomains: ManagerDomain[];
  loadError: string | null;
  /** When provided (tenant view), the admin must pick a department (then a
   * sub-department) that will use the domain before adding it. */
  departments?: ManagerDepartmentScope[];
  /** Domains the tenant's mailboxes already send from, merged in read-only. */
  inUseDomains?: ManagerInUseDomain[];
  /** When false, the Delete button is hidden for verified domains (but still
   * shown for unverified ones). Defaults to true (always show). */
  allowRemove?: boolean;
}) {
  const requiresScope = Array.isArray(departments) && departments.length > 0;
  const [domains, setDomains] = useState<ManagerDomain[]>(initialDomains);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [deptId, setDeptId] = useState("");
  const [subId, setSubId] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [deleteFromResend, setDeleteFromResend] = useState(true);
  const [error, setError] = useState<string | null>(loadError);
  const [status, setStatus] = useState<string | null>(null);
  const addCardRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selectedDept = requiresScope ? departments!.find((d) => d.id === deptId) ?? null : null;
  const showSub = Boolean(selectedDept && selectedDept.subDepartments.length > 0);
  const scopeChosen = !requiresScope || Boolean(deptId && (!showSub || subId));
  const canAdd = Boolean(newName.trim()) && scopeChosen;

  const mergedRows = useMemo<MergedRow[]>(() => {
    const byName = new Map<string, MergedRow>();
    for (const d of domains) {
      byName.set(d.name.toLowerCase(), {
        name: d.name,
        registered: true,
        id: d.id,
        status: d.status,
        records: d.records,
        scopeLabel: d.scopeLabel ?? null,
        usedBy: [],
      });
    }
    for (const u of inUseDomains) {
      const key = u.domain.toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        existing.usedBy = u.usedBy;
      } else {
        byName.set(key, {
          name: u.domain,
          registered: false,
          id: null,
          status: u.status,
          records: [],
          scopeLabel: null,
          usedBy: u.usedBy,
        });
      }
    }
    // Needs-attention (unverified) first, then alphabetical.
    return [...byName.values()].sort((a, b) => {
      const av = a.status === "verified" ? 1 : 0;
      const bv = b.status === "verified" ? 1 : 0;
      return av - bv || a.name.localeCompare(b.name);
    });
  }, [domains, inUseDomains]);

  function upsertDomain(next: ManagerDomain) {
    setDomains((ds) => {
      const exists = ds.some((d) => d.id === next.id);
      return exists ? ds.map((d) => (d.id === next.id ? { ...d, ...next } : d)) : [next, ...ds];
    });
  }

  function focusAddForm(prefill?: string) {
    if (prefill !== undefined) setNewName(prefill);
    addCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => nameInputRef.current?.focus(), 250);
  }

  async function addDomain() {
    const name = newName.trim().toLowerCase();
    if (!name) return;
    if (requiresScope && !scopeChosen) {
      setError("Choose the department (and sub-department) that will use this domain.");
      return;
    }
    setAdding(true);
    setError(null);
    setStatus(null);
    try {
      const scopeBody = requiresScope
        ? {
            departmentId: deptId,
            subDepartmentId: showSub && subId !== WHOLE_DEPT ? subId : null,
          }
        : {};
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ...scopeBody }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to add the domain");
        return;
      }
      upsertDomain(body.domain);
      setExpanded(body.domain.id);
      setNewName("");
      setDeptId("");
      setSubId("");
      setStatus(`${body.domain.name} added — publish the DNS records below, then verify.`);
    } finally {
      setAdding(false);
    }
  }

  async function loadRecords(id: string) {
    const existing = domains.find((d) => d.id === id);
    if (existing && existing.records.length > 0) return;
    try {
      const res = await fetch(`${apiBase}/${id}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok) upsertDomain(body.domain);
    } catch {
      /* non-fatal — the row still renders */
    }
  }

  async function verifyDomain(id: string) {
    setBusyId(id);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${apiBase}/${id}/verify`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Verification check failed");
        return;
      }
      upsertDomain(body.domain);
      setStatus(
        body.domain.status === "verified"
          ? `${body.domain.name} is verified — addresses on it can now be connected.`
          : `Re-checked ${body.domain.name}. DNS can take up to a few hours to propagate.`,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function performRemove() {
    if (!removing) return;
    setError(null);
    setStatus(null);
    const res = await fetch(`${apiBase}/${removing.id}?resend=${deleteFromResend}`, {
      method: "DELETE",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Failed to remove the domain");
    setDomains((ds) => ds.filter((d) => d.id !== removing.id));
  }

  return (
    <div className="flex flex-col gap-6">
      {(error || status) && (
        <div className="space-y-2">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
              {error}
            </div>
          )}
          {status && (
            <div className="rounded-lg border border-sts-green/30 bg-sts-green/10 px-3 py-2 font-sans text-[12.5px] text-sts-green">
              {status}
            </div>
          )}
        </div>
      )}

      {/* Add domain */}
      <div
        ref={addCardRef}
        className="flex flex-col gap-4 rounded-xl border border-sts-card-border bg-sts-card px-[22px] py-5 shadow-sts-card"
      >
        <div className="flex flex-col gap-[3px]">
          <h3 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Register a domain</h3>
          <p className="font-sans text-[12px] text-sts-muted">
            Register the domain you send from (e.g. <span className="font-mono">mail.example.com</span>) and choose the
            team that will use it. You&apos;ll then add DNS records and verify.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-[5px]">
            <label className="font-sans text-[12px] font-medium text-sts-muted">Domain</label>
            <Input
              ref={nameInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canAdd && !adding && addDomain()}
              className="h-9 w-full"
              placeholder="mail.example.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {requiresScope && (
            <div className="flex flex-col gap-[5px]">
              <label className="font-sans text-[12px] font-medium text-sts-muted">Department</label>
              <Select
                value={deptId}
                onValueChange={(v) => {
                  setDeptId(v ?? "");
                  setSubId("");
                }}
              >
                <SelectTrigger className="h-9 w-full">
                  <span className={cn("truncate font-sans text-[12.5px]", !selectedDept && "text-sts-subtle")}>
                    {selectedDept?.name ?? "Select a department"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {departments!.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="font-sans text-[12.5px]">
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {requiresScope && showSub && (
            <div className="flex flex-col gap-[5px]">
              <label className="font-sans text-[12px] font-medium text-sts-muted">Sub-department</label>
              <Select value={subId} onValueChange={(v) => setSubId(v ?? "")}>
                <SelectTrigger className="h-9 w-full">
                  <span className={cn("truncate font-sans text-[12.5px]", !subId && "text-sts-subtle")}>
                    {subId === WHOLE_DEPT
                      ? "Whole department"
                      : selectedDept?.subDepartments.find((s) => s.id === subId)?.name ?? "Select a sub-department"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_DEPT} className="font-sans text-[12.5px]">
                    Whole department
                  </SelectItem>
                  {selectedDept!.subDepartments.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="font-sans text-[12.5px]">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button disabled={adding || !canAdd} onClick={addDomain}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Register domain
          </Button>
        </div>
      </div>

      {/* Domain list */}
      <div className="flex flex-col gap-3">
        {mergedRows.length === 0 ? (
          <p className="rounded-xl border border-sts-card-border bg-sts-card px-[22px] py-10 text-center font-sans text-[12.5px] text-sts-muted shadow-sts-card">
            No domains yet. Register one above to start sending and receiving from your own domain.
          </p>
        ) : (
          mergedRows.map((d) => {
            const isOpen = d.registered && d.id !== null && expanded === d.id;
            const busy = d.id !== null && busyId === d.id;
            const pending = d.status !== "verified";
            const clickable = d.registered && d.id !== null;
            return (
              <div
                key={d.name}
                className={cn(
                  "overflow-hidden rounded-xl border bg-sts-card shadow-sts-card",
                  pending ? "border-amber-400/40" : "border-sts-card-border",
                )}
              >
                <div
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={() => {
                    if (!clickable) return;
                    const next = isOpen ? null : d.id;
                    setExpanded(next);
                    if (next && d.id) void loadRecords(d.id);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-[22px] py-4 text-left",
                    clickable && "cursor-pointer transition-colors hover:bg-sts-surface/40",
                  )}
                >
                  {clickable ? (
                    isOpen ? (
                      <ChevronDown className="size-4 shrink-0 text-sts-subtle" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-sts-subtle" />
                    )
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13.5px] font-medium text-sts-foreground">{d.name}</span>
                      <StatusBadge status={d.status} />
                      {!d.registered && (
                        <span className="rounded-full bg-sts-surface px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-sts-subtle">
                          Not registered
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {d.scopeLabel && (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-sts-blue/25 bg-sts-blue-tint px-2 py-1 font-sans text-[11.5px] font-semibold text-sts-blue">
                          <Building2 className="size-3.5" />
                          {d.scopeLabel}
                        </span>
                      )}
                      {d.usedBy.map((team) => (
                        <span
                          key={team}
                          className="inline-flex items-center gap-1.5 rounded-md border border-sts-card-border bg-sts-surface px-2 py-1 font-sans text-[11.5px] font-semibold text-sts-foreground"
                        >
                          <Mail className="size-3.5 text-sts-muted" />
                          {team}
                        </span>
                      ))}
                    </div>
                  </div>
                  {d.registered && d.id ? (
                    allowRemove || d.status !== "verified" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (d.id) {
                            setDeleteFromResend(true);
                            setRemoving({ id: d.id, name: d.name });
                          }
                        }}
                        className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    ) : null
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        focusAddForm(d.name);
                      }}
                    >
                      <Plus className="size-3.5" />
                      {d.status === "verified" ? "Add to workspace" : "Register & verify"}
                    </Button>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-sts-card-border px-[22px] py-4">
                    {pending && (
                      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-50/60 px-3 py-2 dark:bg-amber-900/10">
                        <Clock className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                        <p className="font-sans text-[12px] text-amber-700 dark:text-amber-400">
                          Waiting for verification. Add the records below at your DNS provider (Cloudflare, GoDaddy,
                          Route&nbsp;53…), then click <span className="font-semibold">Verify</span>. DNS can take a few
                          hours to propagate.
                        </p>
                      </div>
                    )}

                    {d.records.length > 0 ? (
                      <div className="overflow-x-auto rounded-lg border border-sts-card-border">
                        <table className="w-full border-collapse font-sans text-[12px]">
                          <thead>
                            <tr className="bg-sts-surface text-left text-sts-subtle">
                              <th className="px-3 py-2 font-medium">Type</th>
                              <th className="px-3 py-2 font-medium">Name / Host</th>
                              <th className="px-3 py-2 font-medium">Value</th>
                              <th className="px-3 py-2 font-medium">Priority</th>
                              <th className="px-3 py-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.records.map((r, i) => (
                              <tr key={i} className="border-t border-sts-card-border/60 align-top">
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-sts-foreground">
                                  {r.type}
                                  <span className="ml-1 text-[10px] uppercase text-sts-subtle">{r.record}</span>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1">
                                    <span className="break-all font-mono text-sts-foreground">{r.name}</span>
                                    <CopyButton value={r.name} />
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1">
                                    <span className="break-all font-mono text-sts-foreground">{r.value}</span>
                                    <CopyButton value={r.value} />
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-sts-muted">
                                  {r.priority ?? "—"}
                                </td>
                                <td className="px-3 py-2">
                                  <StatusBadge status={r.status} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="font-sans text-[12.5px] text-sts-muted">
                        {d.status === "verified" ? "This domain is verified. No action needed." : "Loading DNS records…"}
                      </p>
                    )}

                    <div className="mt-4 flex items-center gap-2">
                      <Button variant="outline" disabled={busy} onClick={() => d.id && verifyDomain(d.id)}>
                        {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                        {d.status === "verified" ? "Re-check" : "Verify"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => {
          if (!o) setRemoving(null);
        }}
        title="Remove domain?"
        description={
          removing
            ? `Remove ${removing.name}? Any mailbox that sends from this domain will stop working.${
                deleteFromResend
                  ? " The domain is also deregistered from Resend."
                  : " The domain stays registered in Resend and only the local record is removed."
              }`
            : ""
        }
        confirmLabel="Remove"
        successMessage={removing ? `${removing.name} removed.` : undefined}
        onConfirm={performRemove}
      >
        {allowRemove ? (
        <label className="flex cursor-pointer items-start gap-2 font-sans text-[12px] text-sts-muted">
          <input
            type="checkbox"
            checked={deleteFromResend}
            onChange={(e) => setDeleteFromResend(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-sts-blue"
          />
          <span>
            Also delete from Resend. Leave unchecked to remove only the local record and keep the
            domain registered in Resend.
          </span>
        </label>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
