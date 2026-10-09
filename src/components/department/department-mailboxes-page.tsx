"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CornerDownRight,
  Copy,
  Gauge,
  ListChecks,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  UserCog,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import {
  ListSearchInput,
  SortDropdown,
  useListControls,
  byText,
  byDateAsc,
  byDateDesc,
} from "@/components/ui/list-controls";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReceivedMailPanel } from "@/components/mailbox/received-mail-panel";
import {
  DomainRequestForm,
  type ScopeRequestStatus,
} from "@/components/email/domain-request-form";
import {
  getDepartmentMailboxConnections,
  createDepartmentMailboxConnection,
  updateMailboxConnection,
  deleteMailboxConnection,
  recheckMailboxConnection,
  type MailboxConnection,
} from "@/lib/api/admin";

type StatusMeta = {
  label: string;
  dot: string;
  chip: string;
};

const STATUS: Record<MailboxConnection["status"], StatusMeta> = {
  ACTIVE: {
    label: "Connected",
    dot: "bg-sts-green",
    chip: "bg-sts-green/10 text-sts-green",
  },
  AUTH_ERROR: {
    label: "Sign-in expired",
    dot: "bg-red-500",
    chip: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  },
  UNREACHABLE: {
    label: "Not responding",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
};

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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

type AssignmentMethod = "RULE_BASED" | "ROUND_ROBIN" | "WORKLOAD_BASED" | "MANUAL" | "MANUAL_SELECT";

const ASSIGNMENT_METHOD_LABEL: Record<AssignmentMethod, string> = {
  RULE_BASED: "Rule-based",
  ROUND_ROBIN: "Round-robin",
  WORKLOAD_BASED: "Workload-based",
  MANUAL: "Manual",
  MANUAL_SELECT: "Manual user",
};

const ASSIGNMENT_METHOD_META: Record<
  AssignmentMethod,
  { icon: LucideIcon; className: string; description: string }
> = {
  RULE_BASED: {
    icon: ListChecks,
    className: "text-violet-600 dark:text-violet-400",
    description: "Route by matching rules",
  },
  ROUND_ROBIN: {
    icon: RefreshCw,
    className: "text-sky-600 dark:text-sky-400",
    description: "Cycle evenly across the team",
  },
  WORKLOAD_BASED: {
    icon: Gauge,
    className: "text-amber-600 dark:text-amber-400",
    description: "Send to the least-loaded agent",
  },
  MANUAL: {
    icon: UserCog,
    className: "text-emerald-600 dark:text-emerald-400",
    description: "Leave unassigned for pickup",
  },
  MANUAL_SELECT: {
    icon: UserCog,
    className: "text-teal-600 dark:text-teal-400",
    description: "Route to chosen members",
  },
};

// Methods offered in the mailbox picker (rule-based + manual-user are hidden).
const SELECTABLE_ASSIGNMENT_METHODS = (
  Object.keys(ASSIGNMENT_METHOD_LABEL) as AssignmentMethod[]
).filter((m) => m !== "RULE_BASED" && m !== "MANUAL_SELECT");

type SubDepartmentMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export function DepartmentMailboxesPage({
  departmentId,
  departmentName,
  subDepartments,
  canManage,
  canRequestDomain = false,
  domainRequests = [],
}: {
  departmentId: string;
  departmentName: string;
  subDepartments: { id: string; name: string; assignmentMethod: AssignmentMethod }[];
  canManage: boolean;
  /** Managers / sub-managers can request a sending domain (admins register directly). */
  canRequestDomain?: boolean;
  /** Existing domain requests in this department, shown with their status. */
  domainRequests?: ScopeRequestStatus[];
}) {
  const [connections, setConnections] = useState<MailboxConnection[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [showConnect, setShowConnect] = useState(false);
  const [address, setAddress] = useState("");
  const addressRef = useRef<HTMLInputElement>(null);
  const [teamId, setTeamId] = useState(subDepartments[0]?.id ?? "");

  /** Opens the connect form prefilled with `@<domain>`, cursor at the start so
   * the admin just types the local part. */
  function connectForDomain(domain: string) {
    setAddress(`@${domain}`);
    openConnect();
    setTimeout(() => {
      const el = addressRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(0, 0);
      }
    }, 50);
  }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAddress, setEditAddress] = useState("");
  const [rechecking, setRechecking] = useState<Record<string, boolean>>({});
  const [togglingId, setTogglingId] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<MailboxConnection | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<MailboxConnection | null>(null);

  // Assignment method is per-mailbox (per MailboxConnection). Editing state is
  // keyed by the connection id so changing one inbox never touches another. A
  // connection's own assignmentMethod === null means "inherit the sub-department
  // default" (the sub-department the mailbox files into).
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [draftAssignmentMethod, setDraftAssignmentMethod] = useState<AssignmentMethod | "INHERIT">("INHERIT");
  const [draftMemberIds, setDraftMemberIds] = useState<string[]>([]);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  // Member rosters cached per sub-department id, loaded lazily for the picker.
  const [membersBySubDept, setMembersBySubDept] = useState<Record<string, SubDepartmentMember[] | undefined>>({});

  useEffect(() => {
    getDepartmentMailboxConnections(departmentId)
      .then(setConnections)
      .catch(() => {
        setConnections([]);
        setLoadError(true);
      });
  }, [departmentId]);

  const list = connections ?? [];
  const loading = connections === null;
  const noSubDepartments = subDepartments.length === 0;
  const subDeptName = (id: string) => subDepartments.find((s) => s.id === id)?.name ?? "—";
  const mailboxList = useListControls(list, {
    searchText: (c) => [c.address, subDeptName(c.subDepartmentId), STATUS[c.status].label, c.isActive ? "" : "disabled"].join(" "),
    sortOptions: [
      { id: "address", label: "Address (A–Z)", compare: byText((c) => c.address) },
      { id: "subdept", label: "Sub-department", compare: byText((c) => subDeptName(c.subDepartmentId)) },
      { id: "newest", label: "Newest first", compare: byDateDesc((c) => c.createdAt) },
      { id: "oldest", label: "Oldest first", compare: byDateAsc((c) => c.createdAt) },
      {
        id: "status",
        label: "Problems first",
        compare: (a, b) => Number(a.status === "ACTIVE") - Number(b.status === "ACTIVE"),
      },
    ],
  });
  // The inherited default for a mailbox is the assignment method of the
  // sub-department it files into (already resolved against the dept default).
  const inheritedMethod = (subDepartmentId: string): AssignmentMethod =>
    subDepartments.find((s) => s.id === subDepartmentId)?.assignmentMethod ?? "RULE_BASED";

  // Load the member roster the first time the admin opens the picker for the
  // "Manual user" method on a mailbox whose sub-department isn't cached yet.
  useEffect(() => {
    if (editingAssignmentId === null || draftAssignmentMethod !== "MANUAL_SELECT") return;
    const editing = list.find((c) => c.id === editingAssignmentId);
    if (!editing || membersBySubDept[editing.subDepartmentId] !== undefined) return;
    const subDepartmentId = editing.subDepartmentId;
    fetch(`/api/sub-departments/${subDepartmentId}/members`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((rows: SubDepartmentMember[]) => setMembersBySubDept((prev) => ({ ...prev, [subDepartmentId]: rows })))
      .catch(() => setMembersBySubDept((prev) => ({ ...prev, [subDepartmentId]: [] })));
  }, [editingAssignmentId, draftAssignmentMethod, membersBySubDept, list]);

  function openConnect() {
    setFormError(null);
    setTeamId((prev) => prev || subDepartments[0]?.id || "");
    setShowConnect(true);
  }

  function closeConnect() {
    setShowConnect(false);
    setFormError(null);
  }

  async function connect() {
    const value = address.trim();
    if (!isValidEmail(value)) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (!teamId) {
      setFormError("Choose which subDepartment this mailbox files into.");
      return;
    }
    if (list.some((c) => c.address.toLowerCase() === value.toLowerCase())) {
      setFormError("That address is already connected.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await createDepartmentMailboxConnection(departmentId, { teamId, address: value });
      setConnections((prev) => [...(prev ?? []), created]);
      setAddress("");
      setShowConnect(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't connect that mailbox.");
    } finally {
      setSaving(false);
    }
  }

  function startEditAssignment(c: MailboxConnection) {
    setEditingAssignmentId(c.id);
    setDraftAssignmentMethod(c.assignmentMethod ?? "INHERIT");
    setDraftMemberIds(c.manualAssigneeIds);
    setAssignmentError(null);
  }

  async function saveAssignmentMethod(c: MailboxConnection) {
    const method = draftAssignmentMethod === "INHERIT" ? null : draftAssignmentMethod;
    if (method === "MANUAL_SELECT" && draftMemberIds.length === 0) {
      setAssignmentError("Select at least one member for the Manual user method.");
      return;
    }
    setSavingAssignment(true);
    setAssignmentError(null);
    try {
      const updated = await updateMailboxConnection(c.id, {
        assignmentMethod: method,
        manualAssigneeIds: method === "MANUAL_SELECT" ? draftMemberIds : [],
      });
      setConnections((prev) => (prev ?? []).map((x) => (x.id === c.id ? updated : x)));
      setEditingAssignmentId(null);
    } catch (e) {
      setAssignmentError(e instanceof Error ? e.message : "Couldn't update the assignment method.");
    } finally {
      setSavingAssignment(false);
    }
  }

  function toggleDraftMember(userId: string) {
    setDraftMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function saveEdit(id: string) {
    const value = editAddress.trim();
    if (!isValidEmail(value)) return;
    setSaving(true);
    try {
      const updated = await updateMailboxConnection(id, { address: value });
      setConnections((prev) => (prev ?? []).map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch {
      // keep the row in edit mode so the admin can retry
    } finally {
      setSaving(false);
    }
  }

  async function recheck(id: string) {
    setRechecking((prev) => ({ ...prev, [id]: true }));
    try {
      const updated = await recheckMailboxConnection(id);
      setConnections((prev) => (prev ?? []).map((c) => (c.id === id ? updated : c)));
    } catch {
      // leave the previous status in place on a failed check
    } finally {
      setRechecking((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function disconnect(id: string) {
    await deleteMailboxConnection(id).catch(() => null);
    setConnections((prev) => (prev ?? []).filter((c) => c.id !== id));
    setConfirmDisconnect(null);
  }

  // Manual on/off switch. Off pauses ticket creation from this mailbox (the
  // inbound router skips inactive mailboxes); existing tickets are untouched.
  async function toggleActive(c: MailboxConnection) {
    setTogglingId((prev) => ({ ...prev, [c.id]: true }));
    try {
      const updated = await updateMailboxConnection(c.id, { isActive: !c.isActive });
      setConnections((prev) => (prev ?? []).map((x) => (x.id === c.id ? updated : x)));
    } catch {
      // leave the current state in place on a failed toggle
    } finally {
      setTogglingId((prev) => ({ ...prev, [c.id]: false }));
    }
  }

  async function copyAddress(c: MailboxConnection) {
    try {
      await navigator.clipboard.writeText(c.address);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId((id) => (id === c.id ? null : id)), 1500);
    } catch {
      // clipboard may be unavailable; silently ignore
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <ConfirmDialog
        open={!!confirmDisable}
        onOpenChange={(open) => { if (!open) setConfirmDisable(null); }}
        title="Turn off mailbox"
        description={
          confirmDisable
            ? `Turn off "${confirmDisable.address}"? New emails to it will stop opening tickets for ${subDeptName(confirmDisable.subDepartmentId)}. Existing tickets are kept, and you can turn it back on anytime.`
            : ""
        }
        confirmLabel="Turn off"
        successMessage={confirmDisable ? `${confirmDisable.address} turned off` : undefined}
        onConfirm={async () => { if (confirmDisable) await toggleActive(confirmDisable); }}
      />

      <ConfirmDialog
        open={!!confirmDisconnect}
        onOpenChange={(open) => { if (!open) setConfirmDisconnect(null); }}
        title="Disconnect mailbox"
        description={
          confirmDisconnect
            ? `Stop routing mail from "${confirmDisconnect.address}" into ${subDeptName(confirmDisconnect.subDepartmentId)}? Existing tickets are kept.`
            : ""
        }
        confirmLabel="Disconnect"
        successMessage={confirmDisconnect ? `Disconnected ${confirmDisconnect.address}` : undefined}
        onConfirm={async () => { if (confirmDisconnect) await disconnect(confirmDisconnect.id); }}
      />

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="sts-text-admin-title">Shared Mailboxes</h1>
          <p className="mt-[3px] font-sans text-[13px] text-sts-muted">
            Connect the shared inboxes that open tickets for {departmentName}.
          </p>
        </div>
      </div>

      {/* ── Request a sending domain (managers / sub-managers) ── */}
      {canRequestDomain && (
        <DomainRequestForm
          departmentId={departmentId}
          subDepartments={subDepartments}
          existingRequests={domainRequests}
          onConnectMailbox={canManage && !noSubDepartments ? connectForDomain : undefined}
        />
      )}

      {/* ── Connect mailbox modal ── */}
      {canManage && showConnect && !noSubDepartments && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sts-overlay-backdrop" onClick={closeConnect}>
          <div
            className="w-full max-w-md rounded-2xl border border-sts-card-border bg-sts-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-sts-card-border px-5 py-4">
              <p className="font-sans text-[14px] font-semibold text-sts-foreground">Connect mailbox</p>
              <button type="button" onClick={closeConnect} aria-label="Close">
                <X className="size-4 text-sts-muted" />
              </button>
            </div>
            <div className="flex flex-col gap-4 px-5 py-4">
              <div>
                <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">
                  Mailbox address
                </label>
                <input
                  ref={addressRef}
                  autoFocus
                  type="text"
                  inputMode="email"
                  value={address}
                  onChange={(e) => { setAddress(e.target.value); setFormError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") connect(); if (e.key === "Escape") closeConnect(); }}
                  placeholder="support@yourcompany.com"
                  className="h-9 w-full rounded-lg border border-sts-card-border bg-sts-surface px-3 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-blue/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-sts-muted">
                  Files into
                </label>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-sts-card-border bg-sts-surface px-3 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-blue/50"
                >
                  {subDepartments.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <p className="mt-1.5 font-sans text-[11px] text-sts-subtle">
                  Each new email to this address opens a ticket for the chosen subDepartment.
                </p>
              </div>
              {formError && <p className="font-sans text-[11.5px] text-red-500">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-sts-card-border px-5 py-3">
              <button
                type="button"
                onClick={closeConnect}
                className="h-8 rounded-full border border-sts-card-border px-4 font-sans text-[12.5px] text-sts-muted hover:bg-sts-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={connect}
                disabled={saving || !address.trim() || !teamId}
                className="flex h-8 items-center gap-1.5 rounded-full bg-sts-blue px-4 font-sans text-[12.5px] font-medium text-white disabled:opacity-50 dark:text-gray-900"
              >
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Connection list ── */}
      {noSubDepartments ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-sts-card-border bg-sts-card px-4 py-10 text-center">
          <Mail className="size-6 text-sts-subtle" />
          <p className="font-sans text-[13px] font-medium text-sts-foreground">No sub departments yet</p>
          <p className="max-w-sm font-sans text-[12px] text-sts-muted">
            Add a sub-department to {departmentName} before connecting a shared mailbox — every mailbox files into a sub department.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-sts-card-border bg-sts-card px-4 py-6 text-sts-subtle">
          <Loader2 className="size-4 animate-spin" />
          <span className="font-sans text-[12.5px]">Loading mailboxes…</span>
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-sts-card-border bg-sts-card px-4 py-10 text-center">
          <Mail className="size-6 text-sts-subtle" />
          <p className="font-sans text-[13px] font-medium text-sts-foreground">No mailbox connected yet</p>
          <p className="max-w-sm font-sans text-[12px] text-sts-muted">
            {loadError
              ? "We couldn't load mailboxes. Refresh to try again."
              : `Connect a shared inbox so customer emails become tickets for ${departmentName} automatically.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <ListSearchInput value={mailboxList.query} onChange={mailboxList.setQuery} placeholder="Search mailboxes…" />
          <SortDropdown value={mailboxList.sortKey} onChange={mailboxList.setSortKey} options={mailboxList.sortDropdownOptions} />
        </div>
        {mailboxList.visible.length === 0 && (
          <p className="rounded-2xl border border-dashed border-sts-card-border bg-sts-card px-4 py-8 text-center font-sans text-[12.5px] text-sts-muted">
            No mailboxes match &ldquo;{mailboxList.query.trim()}&rdquo;
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {mailboxList.visible.map((c) => {
            const meta = STATUS[c.status];
            const busy = !!rechecking[c.id];
            return (
              <li key={c.id} className="flex flex-col rounded-2xl border border-sts-card-border bg-sts-card">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sts-surface">
                    <Mail className="size-4 text-sts-muted" />
                  </span>

                  <div className="min-w-0 flex-1">
                    {editingId === c.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(c.id); if (e.key === "Escape") setEditingId(null); }}
                          className="min-w-0 flex-1 rounded-md border border-sts-blue/50 bg-sts-surface px-2 py-1 font-sans text-[13px] text-sts-foreground outline-none"
                        />
                        <Tip label="Save">
                          <button type="button" aria-label="Save address" onClick={() => saveEdit(c.id)} disabled={saving} className="rounded-full p-1 text-sts-green hover:bg-sts-green/10">
                            <Check className="size-4" />
                          </button>
                        </Tip>
                        <Tip label="Cancel">
                          <button type="button" aria-label="Cancel editing" onClick={() => setEditingId(null)} className="rounded-full p-1 text-sts-subtle hover:text-sts-foreground">
                            <X className="size-4" />
                          </button>
                        </Tip>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 truncate font-sans text-[13.5px] font-medium text-sts-foreground">
                          {c.address}
                        </span>
                        <Tip label="Copy address">
                          <button
                            type="button"
                            aria-label="Copy address"
                            onClick={() => copyAddress(c)}
                            className="shrink-0 rounded-full p-1 text-sts-subtle hover:bg-sts-surface hover:text-sts-foreground"
                          >
                            {copiedId === c.id ? <Check className="size-3.5 text-sts-green" /> : <Copy className="size-3.5" />}
                          </button>
                        </Tip>
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[11px] text-sts-subtle">
                      <span className="flex items-center gap-1">
                        Files into
                        <span className="rounded bg-sts-blue/10 px-1.5 py-0.5 font-medium text-sts-blue">
                          {subDeptName(c.subDepartmentId)}
                        </span>
                      </span>
                      <span className="rounded bg-sts-surface px-1.5 py-0.5 font-mono text-[9.5px] text-sts-muted">
                        {c.authType}
                      </span>
                      <span>Checked {relativeTime(c.lastCheckedAt)}</span>
                      {c.failureCount > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {c.failureCount} failed check{c.failureCount === 1 ? "" : "s"}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <span className="text-sts-subtle">Assignment</span>
                        {(() => {
                          const effective = c.assignmentMethod ?? inheritedMethod(c.subDepartmentId);
                          const em = ASSIGNMENT_METHOD_META[effective];
                          const EmIcon = em.icon;
                          return (
                            <span className="inline-flex items-center gap-1 rounded-md border border-sts-card-border bg-sts-surface px-1.5 py-0.5 font-medium text-sts-foreground">
                              <EmIcon className={cn("size-3", em.className)} />
                              {ASSIGNMENT_METHOD_LABEL[effective]}
                              {c.assignmentMethod === null && (
                                <span className="text-[10px] font-normal text-sts-subtle">· inherited</span>
                              )}
                              {c.assignmentMethod === "MANUAL_SELECT" && (
                                <span className="text-[10px] font-normal text-sts-subtle">
                                  · {c.manualAssigneeIds.length} member{c.manualAssigneeIds.length === 1 ? "" : "s"}
                                </span>
                              )}
                            </span>
                          );
                        })()}
                        {canManage && editingAssignmentId !== c.id && (
                          <Tip label="Edit assignment method">
                            <button
                              type="button"
                              aria-label="Edit assignment method"
                              onClick={() => startEditAssignment(c)}
                              className="rounded-full p-0.5 text-sts-subtle hover:bg-sts-surface hover:text-sts-foreground"
                            >
                              <Pencil className="size-3" />
                            </button>
                          </Tip>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                    {c.isActive ? (
                      <span className={cn("flex items-center gap-1.5 rounded-full px-2 py-0.5 font-sans text-[10.5px] font-semibold", meta.chip)}>
                        <span className={cn("size-1.5 rounded-full", meta.dot)} />
                        {meta.label}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 rounded-full bg-sts-surface px-2 py-0.5 font-sans text-[10.5px] font-semibold text-sts-subtle">
                        <span className="size-1.5 rounded-full bg-sts-subtle" />
                        Off
                      </span>
                    )}
                    {canManage && editingId !== c.id && (
                      <div className="flex items-center gap-0.5">
                        <Tip label={c.isActive ? "Turn off — stop opening new tickets" : "Turn on — resume opening tickets"}>
                          <button
                            type="button"
                            onClick={() => (c.isActive ? setConfirmDisable(c) : toggleActive(c))}
                            disabled={!!togglingId[c.id]}
                            className={cn(
                              "flex items-center gap-1 rounded-full px-2 py-1 font-sans text-[11px] font-medium hover:bg-sts-surface disabled:opacity-50",
                              c.isActive ? "text-sts-green hover:text-sts-green" : "text-sts-subtle hover:text-sts-foreground",
                            )}
                          >
                            {togglingId[c.id] ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
                            {c.isActive ? "On" : "Off"}
                          </button>
                        </Tip>
                        <Tip label="Test connection">
                          <button
                            type="button"
                            aria-label="Test connection"
                            onClick={() => recheck(c.id)}
                            disabled={busy}
                            className="rounded-full p-1.5 text-sts-subtle hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-50"
                          >
                            <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
                          </button>
                        </Tip>
                        <Tip label="Edit address">
                          <button
                            type="button"
                            aria-label="Edit address"
                            onClick={() => { setEditingId(c.id); setEditAddress(c.address); }}
                            className="rounded-full p-1.5 text-sts-subtle hover:bg-sts-surface hover:text-sts-foreground"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        </Tip>
                        <Tip label="Disconnect">
                          <button
                            type="button"
                            aria-label="Disconnect mailbox"
                            onClick={() => setConfirmDisconnect(c)}
                            className="rounded-full p-1.5 text-sts-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </Tip>
                      </div>
                    )}
                  </div>
                </div>

                {editingAssignmentId === c.id && (
                  <div className="flex flex-col gap-3 border-t border-sts-card-border px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-sans text-[12px] text-sts-muted">Assignment method</span>
                      <Select
                        value={draftAssignmentMethod}
                        onValueChange={(v) => v && setDraftAssignmentMethod(v as AssignmentMethod | "INHERIT")}
                        disabled={savingAssignment}
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label="Assignment method"
                          className="h-8 min-w-52 gap-2 rounded-lg border-sts-blue/30 bg-sts-surface px-2.5 text-[12px] text-sts-foreground shadow-sm transition-colors hover:border-sts-blue/60"
                        >
                          <SelectValue>
                            {(value: string) => {
                              if (value === "INHERIT") {
                                const m = inheritedMethod(c.subDepartmentId);
                                return (
                                  <span className="flex items-center gap-1.5">
                                    <CornerDownRight className="size-3.5 text-sts-subtle" />
                                    <span className="text-sts-muted">Inherit</span>
                                    <span className="text-sts-subtle">· {ASSIGNMENT_METHOD_LABEL[m]}</span>
                                  </span>
                                );
                              }
                              const meta = ASSIGNMENT_METHOD_META[value as AssignmentMethod];
                              const Icon = meta.icon;
                              return (
                                <span className="flex items-center gap-1.5">
                                  <Icon className={cn("size-3.5", meta.className)} />
                                  <span className="font-medium">{ASSIGNMENT_METHOD_LABEL[value as AssignmentMethod]}</span>
                                </span>
                              );
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="min-w-64 p-1">
                          <SelectItem value="INHERIT" className="items-start gap-2 py-1.5 text-[12px]">
                            <CornerDownRight className="mt-0.5 size-4 shrink-0 text-sts-subtle" />
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="font-medium text-sts-foreground">Inherit</span>
                              <span className="text-[11px] whitespace-normal text-sts-subtle">
                                Sub-department default · {ASSIGNMENT_METHOD_LABEL[inheritedMethod(c.subDepartmentId)]}
                              </span>
                            </span>
                          </SelectItem>
                          <SelectSeparator />
                          {SELECTABLE_ASSIGNMENT_METHODS.map((value) => {
                            const meta = ASSIGNMENT_METHOD_META[value];
                            const Icon = meta.icon;
                            return (
                              <SelectItem key={value} value={value} className="items-start gap-2 py-1.5 text-[12px]">
                                <Icon className={cn("mt-0.5 size-4 shrink-0", meta.className)} />
                                <span className="flex min-w-0 flex-col gap-0.5">
                                  <span className="font-medium text-sts-foreground">{ASSIGNMENT_METHOD_LABEL[value]}</span>
                                  <span className="text-[11px] whitespace-normal text-sts-subtle">{meta.description}</span>
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <Tip label="Save assignment method">
                        <button
                          type="button"
                          onClick={() => saveAssignmentMethod(c)}
                          disabled={savingAssignment}
                          aria-label="Save assignment method"
                          className="flex size-8 items-center justify-center rounded-lg bg-sts-green text-white shadow-sm transition-colors hover:bg-sts-green/90 disabled:opacity-50"
                        >
                          {savingAssignment ? <Loader2 className="size-4 animate-spin" strokeWidth={2.75} /> : <Check className="size-4" strokeWidth={2.75} />}
                        </button>
                      </Tip>
                      <Tip label="Cancel">
                        <button
                          type="button"
                          onClick={() => { setEditingAssignmentId(null); setAssignmentError(null); }}
                          disabled={savingAssignment}
                          aria-label="Cancel"
                          className="flex size-8 items-center justify-center rounded-lg border border-sts-card-border bg-sts-surface text-sts-muted shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
                        >
                          <X className="size-4" strokeWidth={2.75} />
                        </button>
                      </Tip>
                    </div>

                    {/* Member picker — only for the "Manual user" method. One picked
                        member sends every ticket to them; several round-robin. */}
                    {draftAssignmentMethod === "MANUAL_SELECT" && (
                      <div className="flex flex-col gap-2 border-t border-sts-card-border pt-3">
                        <p className="font-sans text-[11.5px] text-sts-muted">
                          Pick who receives tickets from this mailbox. Choose one member to send every
                          ticket to them, or several to round-robin across them.
                        </p>
                        {membersBySubDept[c.subDepartmentId] === undefined ? (
                          <div className="flex items-center gap-2 text-sts-subtle">
                            <Loader2 className="size-3.5 animate-spin" />
                            <span className="font-sans text-[12px]">Loading members…</span>
                          </div>
                        ) : membersBySubDept[c.subDepartmentId]!.length === 0 ? (
                          <p className="font-sans text-[12px] text-sts-subtle">
                            This sub-department has no active members yet.
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {membersBySubDept[c.subDepartmentId]!.map((m) => (
                              <li key={m.id}>
                                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-sts-surface">
                                  <input
                                    type="checkbox"
                                    checked={draftMemberIds.includes(m.id)}
                                    onChange={() => toggleDraftMember(m.id)}
                                    disabled={savingAssignment}
                                    className="size-3.5 accent-sts-blue"
                                  />
                                  <span className="font-sans text-[12.5px] text-sts-foreground">{m.name}</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {assignmentError && (
                      <p className="font-sans text-[11.5px] text-red-500">{assignmentError}</p>
                    )}
                  </div>
                )}

                {c.status !== "ACTIVE" && c.lastErrorMessage && (
                  <div className="flex items-start gap-2 border-t border-sts-card-border bg-red-50/50 px-4 py-2.5 dark:bg-red-900/10">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-500" />
                    <p className="font-sans text-[11.5px] text-red-600 dark:text-red-400">{c.lastErrorMessage}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        </div>
      )}

      {/* ── Received mail (only once a mailbox is connected) ── */}
      {list.length > 0 && (
        <ReceivedMailPanel
          endpoint={`/api/admin/departments/${departmentId}/mailbox-mail`}
          canManage={canManage}
          realtimeTopic={`mailbox-mail:dept:${departmentId}`}
        />
      )}

      {/* ── How it works ── */}
      <div className="rounded-2xl border border-sts-card-border bg-sts-surface/40 p-4">
        <p className="font-sans text-[11px] font-semibold tracking-[0.5px] text-sts-subtle uppercase">
          How shared mailboxes work
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 font-sans text-[12px] text-sts-muted">
          <li>• Mail delivered to a connected address opens a new ticket for the sub department it files into.</li>
          <li>• Replies thread onto the same ticket automatically.</li>
          <li>• We check each connection automatically; use <span className="text-sts-foreground">Test connection</span> to verify one right now.</li>
        </ul>
      </div>
    </div>
  );
}
