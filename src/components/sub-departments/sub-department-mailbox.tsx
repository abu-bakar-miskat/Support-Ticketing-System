"use client";

import { Tip } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  LogIn,
  Mail,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubDepartmentReceivedMail } from "@/components/sub-departments/sub-department-received-mail";
import {
  ExternalMailboxConnectForm,
  MAILBOX_PROVIDER_META,
  isOAuthProvider,
  isPullProvider,
  reconnectMailbox,
  useMailboxOAuthResult,
  scopeReplyMailbox,
  ReplyMailboxNotice,
} from "@/components/mailbox/mailbox-provider-connect";
import {
  getSubDepartmentMailboxConnections,
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

/** Department / sub-department mailboxes always file into a sub-department. */
type DeptMailbox = MailboxConnection & { subDepartmentId: string };
const asDeptMailbox = (c: MailboxConnection) => c as DeptMailbox;

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

type AssignmentMethod = "RULE_BASED" | "ROUND_ROBIN" | "WORKLOAD_BASED" | "MANUAL" | "MANUAL_SELECT";

const ASSIGNMENT_METHOD_LABEL: Record<AssignmentMethod, string> = {
  RULE_BASED: "Rule-based",
  ROUND_ROBIN: "Round-robin",
  WORKLOAD_BASED: "Workload-based",
  MANUAL: "Manual",
  MANUAL_SELECT: "Manual user",
};

type SubDepartmentMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export function SubDepartmentMailboxManager({
  subDepartmentId,
  subDepartmentName,
  prefix,
  assignmentMethod,
  canManage,
  departmentMailbox = null,
}: {
  subDepartmentId: string;
  subDepartmentName: string;
  prefix: string;
  /** The sub-department's resolved default method — shown as the "inherited"
   *  value for any mailbox that has no per-mailbox override of its own. */
  assignmentMethod: AssignmentMethod;
  canManage: boolean;
  /** Address of the parent department's mailbox, used when this sub-department has none of its own. */
  departmentMailbox?: string | null;
}) {
  const [connections, setConnections] = useState<DeptMailbox[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [showConnect, setShowConnect] = useState(false);

  // Assignment method is now per-mailbox (per MailboxConnection). Editing state is
  // keyed by the connection id so changing one inbox never touches another. A
  // connection's own assignmentMethod === null means "inherit the sub-department
  // default" (the `assignmentMethod` prop, which itself falls back to the dept).
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [draftAssignmentMethod, setDraftAssignmentMethod] = useState<AssignmentMethod | "INHERIT">("INHERIT");
  const [draftMemberIds, setDraftMemberIds] = useState<string[]>([]);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [members, setMembers] = useState<SubDepartmentMember[] | null>(null);

  const [rechecking, setRechecking] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<Record<string, boolean>>({});
  const [confirmDisable, setConfirmDisable] = useState<DeptMailbox | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<DeptMailbox | null>(null);

  function loadConnections() {
    getSubDepartmentMailboxConnections(subDepartmentId)
      .then((rows) => { setConnections(rows.filter((c) => c.subDepartmentId).map(asDeptMailbox)); setLoadError(false); })
      .catch(() => {
        setConnections([]);
        setLoadError(true);
      });
  }

  useEffect(loadConnections, [subDepartmentId]);

  // Back from a Microsoft sign-in: toast the outcome and refresh.
  useMailboxOAuthResult(loadConnections);


  // Load the member roster the first time the admin opens the picker for the
  // "Manual user" method — kept lazy so the mailbox view stays cheap otherwise.
  useEffect(() => {
    if (editingAssignmentId === null || draftAssignmentMethod !== "MANUAL_SELECT" || members !== null) return;
    fetch(`/api/sub-departments/${subDepartmentId}/members`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((rows: SubDepartmentMember[]) => setMembers(rows))
      .catch(() => setMembers([]));
  }, [editingAssignmentId, draftAssignmentMethod, members, subDepartmentId]);

  const list = connections ?? [];
  const loading = connections === null;
  const ownMailbox = scopeReplyMailbox(list, { scopeType: "SUB_DEPARTMENT", subDepartmentId });
  const mailboxList = useListControls(list, {
    searchText: (c) => [c.address, STATUS[c.status].label, c.isActive ? "" : "disabled"].join(" "),
    sortOptions: [
      { id: "address", label: "Address (A–Z)", compare: byText((c) => c.address) },
      { id: "newest", label: "Newest first", compare: byDateDesc((c) => c.createdAt) },
      { id: "oldest", label: "Oldest first", compare: byDateAsc((c) => c.createdAt) },
      {
        id: "status",
        label: "Problems first",
        compare: (a, b) => Number(a.status === "ACTIVE") - Number(b.status === "ACTIVE"),
      },
    ],
  });

  function startEditAssignment(c: DeptMailbox) {
    setEditingAssignmentId(c.id);
    setDraftAssignmentMethod(c.assignmentMethod ?? "INHERIT");
    setDraftMemberIds(c.manualAssigneeIds);
    setAssignmentError(null);
  }

  async function saveAssignmentMethod(c: DeptMailbox) {
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
      setConnections((prev) => (prev ?? []).map((x) => (x.id === c.id ? asDeptMailbox(updated) : x)));
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

  async function recheck(id: string) {
    setRechecking((prev) => ({ ...prev, [id]: true }));
    try {
      const updated = await recheckMailboxConnection(id);
      setConnections((prev) => (prev ?? []).map((c) => (c.id === id ? asDeptMailbox(updated) : c)));
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

  // Manual on/off switch. Turning a mailbox off stops new tickets being opened
  // from it (the inbound router skips inactive mailboxes) without touching any
  // existing tickets.
  async function toggleActive(c: DeptMailbox) {
    setTogglingId((prev) => ({ ...prev, [c.id]: true }));
    try {
      const updated = await updateMailboxConnection(c.id, { isActive: !c.isActive });
      setConnections((prev) => (prev ?? []).map((x) => (x.id === c.id ? asDeptMailbox(updated) : x)));
    } catch {
      // leave the current state in place on a failed toggle
    } finally {
      setTogglingId((prev) => ({ ...prev, [c.id]: false }));
    }
  }

  async function copyAddress(c: DeptMailbox) {
    try {
      await navigator.clipboard.writeText(c.address);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId((id) => (id === c.id ? null : id)), 1500);
    } catch {
      // clipboard may be unavailable; silently ignore
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <ConfirmDialog
        open={!!confirmDisable}
        onOpenChange={(open) => { if (!open) setConfirmDisable(null); }}
        title="Turn off mailbox"
        description={
          confirmDisable
            ? `Turn off "${confirmDisable.address}"? New emails to it will stop opening tickets for ${subDepartmentName}. Existing tickets are kept, and you can turn it back on anytime.`
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
            ? `Stop routing mail from "${confirmDisconnect.address}" into ${subDepartmentName}? Existing tickets are kept.`
            : ""
        }
        confirmLabel="Disconnect"
        successMessage={confirmDisconnect ? `Disconnected ${confirmDisconnect.address}` : undefined}
        onConfirm={async () => { if (confirmDisconnect) await disconnect(confirmDisconnect.id); }}
      />

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="sts-text-admin-title">Mailbox</h1>
          <p className="mt-[3px] font-sans text-[13px] text-sts-muted">
            Connect the shared inboxes that open tickets for {subDepartmentName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && !ownMailbox && (
            <button
              type="button"
              onClick={() => setShowConnect(true)}
              className="flex h-8 items-center gap-1.5 rounded-full bg-sts-blue px-3.5 font-sans text-[12.5px] font-medium text-white dark:text-gray-900"
            >
              <Plus className="size-3.5" />
              Connect inbox
            </button>
          )}
        </div>
      </div>

      {!loading && (
        <ReplyMailboxNotice>
          {ownMailbox ? (
            <>
              Customers of {subDepartmentName} email and hear back from{" "}
              <span className="font-medium">{ownMailbox.address}</span>.
            </>
          ) : departmentMailbox ? (
            <>
              Customer email for {subDepartmentName} uses the department mailbox{" "}
              <span className="font-medium">{departmentMailbox}</span>. Optionally connect this sub-department&rsquo;s
              own mailbox to use its own address instead.
            </>
          ) : (
            <>
              No department mailbox is connected yet. Connect one on the department&rsquo;s Mailboxes page, or connect
              an inbox for {subDepartmentName} here.
            </>
          )}
        </ReplyMailboxNotice>
      )}

      {/* ── Connect form ── */}
      {canManage && showConnect && (
        <div className="flex flex-col gap-3 rounded-xl border border-sts-card-border bg-sts-card p-4">
          <ExternalMailboxConnectForm
            teamId={subDepartmentId}
            scopeType="SUB_DEPARTMENT"
            existingAddresses={list.map((c) => c.address)}
            onCancel={() => setShowConnect(false)}
          />
        </div>
      )}

      {/* ── Connection list ── */}
      {loading ? (
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
              : `Connect a shared inbox so customer emails become ${prefix} tickets automatically.`}
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
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 truncate font-sans text-[13.5px] font-medium text-sts-foreground">
                        {c.address}
                      </span>
                      <Tip label={copiedId === c.id ? "Copied" : "Copy address"}>
                        <button
                          aria-label="Copy address"
                          type="button"
                          onClick={() => copyAddress(c)}
                          className="shrink-0 rounded-full p-1 text-sts-subtle hover:bg-sts-surface hover:text-sts-foreground"
                        >
                          {copiedId === c.id ? <Check className="size-3.5 text-sts-green" /> : <Copy className="size-3.5" />}
                        </button>
                      </Tip>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[11px] text-sts-subtle">
                      <span className="rounded bg-sts-surface px-1.5 py-0.5 font-sans text-[10px] font-medium text-sts-muted">
                        {MAILBOX_PROVIDER_META[c.authType].short}
                      </span>
                      {c.authType === "OAUTH_M365" && c.scopeType === "SUB_DEPARTMENT" && (
                        <span className="rounded bg-sts-green/10 px-1.5 py-0.5 font-medium text-sts-green">
                          Sends customer email
                        </span>
                      )}
                      <span>Checked {relativeTime(c.lastCheckedAt)}</span>
                      {isPullProvider(c.authType) && <span>Synced {relativeTime(c.lastSyncedAt)}</span>}
                      {c.failureCount > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {c.failureCount} failed check{c.failureCount === 1 ? "" : "s"}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        Assignment:{" "}
                        <span className="font-medium text-sts-foreground">
                          {ASSIGNMENT_METHOD_LABEL[c.assignmentMethod ?? assignmentMethod]}
                        </span>
                        {c.assignmentMethod === null ? (
                          <span className="text-sts-subtle">(inherited)</span>
                        ) : (
                          c.assignmentMethod === "MANUAL_SELECT" && (
                            <span className="text-sts-subtle">
                              · {c.manualAssigneeIds.length} member{c.manualAssigneeIds.length === 1 ? "" : "s"}
                            </span>
                          )
                        )}
                        {canManage && editingAssignmentId !== c.id && (
                          <Tip label="Edit assignment method">
                            <button
                              aria-label="Edit assignment method"
                              type="button"
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
                    {canManage && (
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
                        {isOAuthProvider(c.authType) && (
                          <Tip label={`Reconnect — sign in with ${MAILBOX_PROVIDER_META[c.authType].label} again`}>
                            <button
                              aria-label="Reconnect mailbox"
                              type="button"
                              onClick={() => reconnectMailbox(c)}
                              className={cn(
                                "rounded-full p-1.5 hover:bg-sts-surface hover:text-sts-foreground",
                                c.status === "ACTIVE" ? "text-sts-subtle" : "text-red-500",
                              )}
                            >
                              <LogIn className="size-3.5" />
                            </button>
                          </Tip>
                        )}
                        <Tip label={isPullProvider(c.authType) ? "Test connection & check for new mail" : "Test connection"}>
                          <button
                            aria-label="Test connection"
                            type="button"
                            onClick={() => recheck(c.id)}
                            disabled={busy}
                            className="rounded-full p-1.5 text-sts-subtle hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-50"
                          >
                            <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
                          </button>
                        </Tip>
                        <Tip label="Disconnect">
                          <button
                            aria-label="Disconnect"
                            type="button"
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
                          className="h-7 border-sts-blue/40 bg-sts-surface px-2 text-[12px] text-sts-foreground"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INHERIT" className="text-[12px]">
                            Inherit · {ASSIGNMENT_METHOD_LABEL[assignmentMethod]}
                          </SelectItem>
                          {Object.entries(ASSIGNMENT_METHOD_LABEL).map(([value, label]) => (
                            <SelectItem key={value} value={value} className="text-[12px]">
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Tip label="Save assignment method">
                        <button
                          aria-label="Save assignment method"
                          type="button"
                          onClick={() => saveAssignmentMethod(c)}
                          disabled={savingAssignment}
                          className="rounded-full p-1 text-sts-green hover:bg-sts-green/10 disabled:opacity-50"
                        >
                          {savingAssignment ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        </button>
                      </Tip>
                      <Tip label="Cancel">
                        <button
                          aria-label="Cancel"
                          type="button"
                          onClick={() => { setEditingAssignmentId(null); setAssignmentError(null); }}
                          disabled={savingAssignment}
                          className="rounded-full p-1 text-sts-subtle hover:text-sts-foreground disabled:opacity-50"
                        >
                          <X className="size-3.5" />
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
                        {members === null ? (
                          <div className="flex items-center gap-2 text-sts-subtle">
                            <Loader2 className="size-3.5 animate-spin" />
                            <span className="font-sans text-[12px]">Loading members…</span>
                          </div>
                        ) : members.length === 0 ? (
                          <p className="font-sans text-[12px] text-sts-subtle">
                            This sub-department has no active members yet.
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {members.map((m) => (
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
        <SubDepartmentReceivedMail subDepartmentId={subDepartmentId} canManage={canManage} />
      )}

      {/* ── How it works ── */}
      <div className="rounded-2xl border border-sts-card-border bg-sts-surface/40 p-4">
        <p className="font-sans text-[11px] font-semibold tracking-[0.5px] text-sts-subtle uppercase">
          How the shared mailbox works
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 font-sans text-[12px] text-sts-muted">
          <li>• Mail delivered to a connected address opens a new ticket for {subDepartmentName}.</li>
          <li>• Tickets are keyed <span className="font-mono text-sts-foreground">{prefix}-###</span>, and replies thread onto the same ticket.</li>
          <li>• Microsoft 365 inboxes are checked for new mail every couple of minutes; mail is only read, never moved or deleted.</li>
          <li>• We check each connection automatically; use <span className="text-sts-foreground">Test connection</span> to verify one right now.</li>
        </ul>
      </div>
    </div>
  );
}
