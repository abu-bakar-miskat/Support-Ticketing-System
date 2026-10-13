"use client";

import { Tip } from "@/components/ui/tooltip";
import { useMemo, useRef, useState } from "react";
import {
  Plus,
  Loader2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
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
import { ListSearchInput, SortDropdown, useListControls, byText, byDateAsc, byDateDesc } from "@/components/ui/list-controls";

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
  /** Sending/receiving state from Resend — receiving must be "enabled" for the
   * domain to expose its MX (Receiving) record. */
  capabilities?: { sending: string; receiving: string };
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

const ALL_DEPTS = "__all_departments__";
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

/**
 * Hostname check for the register form: dot-separated labels of letters,
 * digits and inner hyphens (≤63 chars each), ending in a 2+ letter TLD.
 * Stricter than the server's check in resend-domains.ts, so anything this
 * accepts the API accepts too.
 */
const DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// ── Merged row model ─────────────────────────────────────────────────────────

type MergedRow = {
  name: string;
  registered: boolean;
  id: string | null;
  status: string;
  records: ManagerDnsRecord[];
  capabilities?: { sending: string; receiving: string };
  scopeLabel: string | null;
  usedBy: string[];
  /** When the domain was added; null for in-use domains that aren't registered here. */
  createdAt: string | null;
};

/** Date sort that keeps undated rows last in either direction. */
const datedFirst =
  (compare: (a: MergedRow, b: MergedRow) => number) =>
  (a: MergedRow, b: MergedRow) =>
    !a.createdAt ? (b.createdAt ? 1 : 0) : !b.createdAt ? -1 : compare(a, b);

/**
 * Add / remove workspace assignments for externally verified Resend domains, with the tenant's
 * in-use mailbox domains merged into one list. Presentation-only — it talks to
 * whichever REST base it's given (`apiBase`), so the same component drives the
 * super-admin platform view and the tenant-admin views. Endpoints under
 * `apiBase`: GET / POST `/`, GET / DELETE `/:id`, read-only Resend status checks.
 */
export function EmailDomainsManager({
  apiBase,
  initialDomains,
  loadError,
  departments,
  inUseDomains = [],
  allowRemove = true,
  allowAdd = true,
}: {
  apiBase: string;
  initialDomains: ManagerDomain[];
  loadError: string | null;
  /** When provided (tenant view), the admin must pick a department (then a
   * sub-department) that will use the domain before adding it. */
  departments?: ManagerDepartmentScope[];
  /** Domains the tenant's mailboxes already send from, merged in read-only. */
  inUseDomains?: ManagerInUseDomain[];
  /** Allow removing local workspace assignments. */
  allowRemove?: boolean;
  /** Platform view lists domains; workspace views can assign verified domains. */
  allowAdd?: boolean;
}) {
  const requiresScope = Array.isArray(departments);
  const [domains, setDomains] = useState<ManagerDomain[]>(initialDomains);
  const [newName, setNewName] = useState("");
  const [checkedDomain, setCheckedDomain] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const checkRequest = useRef(0);
  const [deptId, setDeptId] = useState("");
  const [subId, setSubId] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(loadError);
  const [status, setStatus] = useState<string | null>(null);
  const addCardRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selectedDept = requiresScope ? departments!.find((d) => d.id === deptId) ?? null : null;
  const showSub = Boolean(selectedDept && selectedDept.subDepartments.length > 0);
  const allDepartments = deptId === ALL_DEPTS;
  const scopeChosen = !requiresScope || Boolean(deptId && (!showSub || subId));
  const domainValid = DOMAIN_RE.test(newName.trim().toLowerCase());
  // Only complain once the user has left the field, not on every keystroke.
  const [nameTouched, setNameTouched] = useState(false);
  const showDomainError = nameTouched && newName.trim() !== "" && !domainValid;
  const domainChecked = domainValid && checkedDomain === newName.trim().toLowerCase();
  const canAdd = domainChecked && scopeChosen;

  const mergedRows = useMemo<MergedRow[]>(() => {
    const byName = new Map<string, MergedRow>();
    for (const d of domains) {
      byName.set(d.name.toLowerCase(), {
        name: d.name,
        registered: true,
        id: d.id,
        status: d.status,
        records: d.records,
        capabilities: d.capabilities,
        scopeLabel: d.scopeLabel ?? null,
        usedBy: [],
        createdAt: d.createdAt,
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
          createdAt: null,
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

  const domainList = useListControls(mergedRows, {
    searchText: (d) => [d.name, d.status, d.scopeLabel ?? "", ...d.usedBy].join(" "),
    sortOptions: [
      // mergedRows is already ordered needs-attention first, then A–Z.
      { id: "attention", label: "Needs attention first", compare: () => 0 },
      { id: "name", label: "Name (A–Z)", compare: byText((d) => d.name) },
      { id: "newest", label: "Newest first", compare: datedFirst(byDateDesc((d) => d.createdAt)) },
      { id: "oldest", label: "Oldest first", compare: datedFirst(byDateAsc((d) => d.createdAt)) },
      { id: "status", label: "Status", compare: byText((d) => d.status) },
    ],
  });

  function upsertDomain(next: ManagerDomain) {
    setDomains((ds) => {
      const exists = ds.some((d) => d.id === next.id);
      return exists ? ds.map((d) => (d.id === next.id ? { ...d, ...next } : d)) : [next, ...ds];
    });
  }

  function changeDomain(value: string) {
    checkRequest.current += 1;
    setNewName(value);
    setCheckedDomain(null);
    setCheckError(null);
    setChecking(false);
    setDeptId("");
    setSubId("");
  }

  async function checkDomain() {
    if (!domainValid || checking) return;
    const name = newName.trim().toLowerCase();
    const requestId = ++checkRequest.current;
    setChecking(true);
    setCheckedDomain(null);
    setCheckError(null);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/email-identity/domain-status?domain=${encodeURIComponent(name)}`);
      const body = await res.json().catch(() => ({}));
      if (requestId !== checkRequest.current) return;
      if (!res.ok || body.status !== "verified" || body.domain !== name) {
        setCheckError(body.error ?? `The ${name} domain is not verified in Resend. Verify it in Resend before adding it here.`);
        return;
      }
      setCheckedDomain(name);
    } catch {
      if (requestId === checkRequest.current) setCheckError("Unable to check Resend. Please try again.");
    } finally {
      if (requestId === checkRequest.current) setChecking(false);
    }
  }

  function focusAddForm(prefill?: string) {
    if (prefill !== undefined) changeDomain(prefill);
    addCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => nameInputRef.current?.focus(), 250);
  }

  async function addDomain() {
    const name = newName.trim().toLowerCase();
    if (!canAdd || adding) return;
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
            allDepartments,
            departmentId: allDepartments ? null : deptId,
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
      changeDomain("");
      setNameTouched(false);
      setDeptId("");
      setSubId("");
      setStatus(`${body.domain.name} is verified in Resend and has been added.`);
    } catch {
      setError("Unable to check the domain in Resend. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  async function performRemove() {
    if (!removing) return;
    setError(null);
    setStatus(null);
    const res = await fetch(`${apiBase}/${removing.id}`, {
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
      {allowAdd && <div
        ref={addCardRef}
        className="flex flex-col gap-4 rounded-xl border border-sts-card-border bg-sts-card px-[22px] py-5 shadow-sts-card"
      >
        <div className="flex flex-col gap-[3px]">
          <h3 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Add a verified domain</h3>
          <p className="font-sans text-[12px] text-sts-muted">
            Enter a domain (e.g. <span className="font-mono">mail.example.com</span>) and check its Resend status.
            Once verified, choose the department and sub-department that will use it.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-[5px] sm:col-span-2">
            <label className="font-sans text-[12px] font-medium text-sts-muted">
              Domain <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
            <Input
              ref={nameInputRef}
              disabled={adding}
              required
              aria-required
              aria-invalid={showDomainError || undefined}
              aria-describedby={showDomainError ? "register-domain-error" : undefined}
              value={newName}
              onChange={(e) => changeDomain(e.target.value)}
              onBlur={() => setNameTouched(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!domainChecked) void checkDomain();
                }
              }}
              className="h-9 w-full"
              placeholder="mail.example.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button variant="outline" disabled={!domainValid || checking || adding} onClick={checkDomain}>
              {checking ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {checking ? "Checking…" : "Check"}
            </Button>
            </div>
            <div aria-live="polite">
              {checkError && <p className="font-sans text-[12px] text-destructive">{checkError}</p>}
              {domainChecked && <p className="font-sans text-[12px] text-sts-green">Verified in Resend. Choose the team that will use this domain.</p>}
            </div>
            {showDomainError && (
              <p id="register-domain-error" className="font-sans text-[11.5px] text-destructive">
                Enter a valid domain, e.g. mail.example.com
              </p>
            )}
          </div>

          {domainChecked && requiresScope && (
            <div className="flex flex-col gap-[5px]">
              <label className="font-sans text-[12px] font-medium text-sts-muted">
                Department <span className="text-red-500">*</span>
              </label>
              {/* Disabled triggers swallow pointer events, so the tooltip sits on a wrapper
                  and the trigger ignores the pointer while disabled. */}
              <Tip label={domainValid ? null : "Add a valid domain first"}>
                <div className="w-full">
                  <Select
                    required
                    disabled={!domainValid}
                    value={deptId}
                    onValueChange={(v) => {
                      setDeptId(v ?? "");
                      setSubId("");
                    }}
                  >
                    <SelectTrigger className={cn("h-9 w-full", !domainValid && "pointer-events-none")}>
                      <span className={cn("truncate font-sans text-[12.5px]", !selectedDept && "text-sts-subtle")}>
                        {allDepartments ? "All departments and sub-departments" : selectedDept?.name ?? "Select a department"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_DEPTS} className="font-sans text-[12.5px]">
                        All departments and sub-departments
                      </SelectItem>
                      {departments!.map((d) => (
                        <SelectItem key={d.id} value={d.id} className="font-sans text-[12.5px]">
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Tip>
            </div>
          )}

          {domainChecked && requiresScope && showSub && (
            <div className="flex flex-col gap-[5px]">
              <label className="font-sans text-[12px] font-medium text-sts-muted">
                Sub-department <span className="text-red-500">*</span>
              </label>
              <Select disabled={!domainValid} value={subId} onValueChange={(v) => setSubId(v ?? "")}>
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

        {domainChecked && allDepartments && (
          <p className="font-sans text-[12px] text-sts-muted">
            Every department and sub-department in this workspace can use this domain. Each mailbox must use a unique address, such as support@{checkedDomain} or sales@{checkedDomain}.
          </p>
        )}

        {domainChecked && <div className="flex justify-end">
          <Button disabled={adding || !canAdd} onClick={addDomain}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add domain
          </Button>
        </div>}
      </div>

      }

      {/* Domain list */}
      <div className="flex flex-col gap-3">
        {mergedRows.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <ListSearchInput value={domainList.query} onChange={domainList.setQuery} placeholder="Search domains…" />
            <SortDropdown
              value={domainList.sortKey}
              onChange={domainList.setSortKey}
              options={domainList.sortDropdownOptions}
            />
          </div>
        )}
        {mergedRows.length > 0 && domainList.visible.length === 0 ? (
          <p className="rounded-xl border border-sts-card-border bg-sts-card px-[22px] py-10 text-center font-sans text-[12.5px] text-sts-muted shadow-sts-card">
            No domains match &ldquo;{domainList.query.trim()}&rdquo;
          </p>
        ) : mergedRows.length === 0 ? (
          <p className="rounded-xl border border-sts-card-border bg-sts-card px-[22px] py-10 text-center font-sans text-[12.5px] text-sts-muted shadow-sts-card">
            No domains added yet. Only domains already verified in Resend can be added.
          </p>
        ) : (
          domainList.visible.map((d) => {
            const pending = d.status !== "verified";
            return (
              <div
                key={d.name}
                className={cn(
                  "overflow-hidden rounded-xl border bg-sts-card shadow-sts-card",
                  pending ? "border-amber-400/40" : "border-sts-card-border",
                )}
              >
                <div className="flex w-full items-center gap-3 px-[22px] py-4 text-left">
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
                    allowRemove ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (d.id) {
                            setRemoving({ id: d.id, name: d.name });
                          }
                        }}
                        className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    ) : null
                  ) : allowAdd ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={d.status !== "verified"}
                      onClick={(e) => {
                        e.stopPropagation();
                        focusAddForm(d.name);
                      }}
                    >
                      <Plus className="size-3.5" />
                      Add to workspace
                    </Button>
                  ) : null}
                </div>
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
        description={removing ? `Remove ${removing.name} from this workspace? Its configuration in Resend will remain unchanged.` : ""}
        confirmLabel="Remove"
        successMessage={removing ? `${removing.name} removed.` : undefined}
        onConfirm={performRemove}
      />
    </div>
  );
}
