"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ReceivedMailPanel } from "@/components/mailbox/received-mail-panel";
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
    dot: "bg-pen-green",
    chip: "bg-pen-green/10 text-pen-green",
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

export function DepartmentMailboxesPage({
  departmentId,
  departmentName,
  subDepartments,
  canManage,
}: {
  departmentId: string;
  departmentName: string;
  subDepartments: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [connections, setConnections] = useState<MailboxConnection[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [showConnect, setShowConnect] = useState(false);
  const [address, setAddress] = useState("");
  const [teamId, setTeamId] = useState(subDepartments[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAddress, setEditAddress] = useState("");
  const [rechecking, setRechecking] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<MailboxConnection | null>(null);

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
  const noTeams = subDepartments.length === 0;
  const subDeptName = (id: string) => subDepartments.find((s) => s.id === id)?.name ?? "—";

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
      setFormError("Choose which team this mailbox files into.");
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
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
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
          <h1 className="pen-text-admin-title">Shared Mailboxes</h1>
          <p className="mt-[3px] font-sans text-[13px] text-pen-muted">
            Connect the shared inboxes that open tickets for {departmentName}.
          </p>
        </div>
        {canManage && !noTeams && (
          <button
            type="button"
            onClick={openConnect}
            className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-[7px] bg-pen-blue px-3.5 font-sans text-xs font-medium text-white transition-opacity hover:opacity-90 dark:text-gray-900"
          >
            <Plus className="size-[13px]" strokeWidth={2.5} />
            Connect mailbox
          </button>
        )}
      </div>

      {/* ── Connect mailbox modal ── */}
      {canManage && showConnect && !noTeams && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pen-overlay-backdrop" onClick={closeConnect}>
          <div
            className="w-full max-w-md rounded-2xl border border-pen-card-border bg-pen-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-pen-card-border px-5 py-4">
              <p className="font-sans text-[14px] font-semibold text-pen-foreground">Connect mailbox</p>
              <button type="button" onClick={closeConnect} aria-label="Close">
                <X className="size-4 text-pen-muted" />
              </button>
            </div>
            <div className="flex flex-col gap-4 px-5 py-4">
              <div>
                <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">
                  Mailbox address
                </label>
                <input
                  autoFocus
                  type="email"
                  value={address}
                  onChange={(e) => { setAddress(e.target.value); setFormError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") connect(); if (e.key === "Escape") closeConnect(); }}
                  placeholder="support@yourcompany.com"
                  className="h-9 w-full rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-blue/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block font-sans text-[11.5px] font-medium text-pen-muted">
                  Files into
                </label>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-blue/50"
                >
                  {subDepartments.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <p className="mt-1.5 font-sans text-[11px] text-pen-subtle">
                  Each new email to this address opens a ticket for the chosen team.
                </p>
              </div>
              {formError && <p className="font-sans text-[11.5px] text-red-500">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-pen-card-border px-5 py-3">
              <button
                type="button"
                onClick={closeConnect}
                className="h-8 rounded-lg border border-pen-card-border px-4 font-sans text-[12.5px] text-pen-muted hover:bg-pen-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={connect}
                disabled={saving || !address.trim() || !teamId}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-pen-blue px-4 font-sans text-[12.5px] font-medium text-white disabled:opacity-50 dark:text-gray-900"
              >
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Connection list ── */}
      {noTeams ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-pen-card-border bg-pen-card px-4 py-10 text-center">
          <Mail className="size-6 text-pen-subtle" />
          <p className="font-sans text-[13px] font-medium text-pen-foreground">No teams yet</p>
          <p className="max-w-sm font-sans text-[12px] text-pen-muted">
            Add a sub-department to {departmentName} before connecting a shared mailbox — every mailbox files into a team.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-pen-card-border bg-pen-card px-4 py-6 text-pen-subtle">
          <Loader2 className="size-4 animate-spin" />
          <span className="font-sans text-[12.5px]">Loading mailboxes…</span>
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-pen-card-border bg-pen-card px-4 py-10 text-center">
          <Mail className="size-6 text-pen-subtle" />
          <p className="font-sans text-[13px] font-medium text-pen-foreground">No mailbox connected yet</p>
          <p className="max-w-sm font-sans text-[12px] text-pen-muted">
            {loadError
              ? "We couldn't load mailboxes. Refresh to try again."
              : `Connect a shared inbox so customer emails become tickets for ${departmentName} automatically.`}
          </p>
          {canManage && !loadError && (
            <button
              type="button"
              onClick={openConnect}
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-pen-blue px-3.5 py-2 font-sans text-[12.5px] font-medium text-white dark:text-gray-900"
            >
              <Plus className="size-3.5" />
              Connect mailbox
            </button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((c) => {
            const meta = STATUS[c.status];
            const busy = !!rechecking[c.id];
            return (
              <li key={c.id} className="flex flex-col rounded-2xl border border-pen-card-border bg-pen-card">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-pen-surface">
                    <Mail className="size-4 text-pen-muted" />
                  </span>

                  <div className="min-w-0 flex-1">
                    {editingId === c.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(c.id); if (e.key === "Escape") setEditingId(null); }}
                          className="min-w-0 flex-1 rounded-md border border-pen-blue/50 bg-pen-surface px-2 py-1 font-sans text-[13px] text-pen-foreground outline-none"
                        />
                        <button type="button" onClick={() => saveEdit(c.id)} disabled={saving} title="Save" className="rounded-md p-1 text-pen-green hover:bg-pen-green/10">
                          <Check className="size-4" />
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} title="Cancel" className="rounded-md p-1 text-pen-subtle hover:text-pen-foreground">
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 truncate font-sans text-[13.5px] font-medium text-pen-foreground">
                          {c.address}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyAddress(c)}
                          title="Copy address"
                          className="shrink-0 rounded-md p-1 text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground"
                        >
                          {copiedId === c.id ? <Check className="size-3.5 text-pen-green" /> : <Copy className="size-3.5" />}
                        </button>
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[11px] text-pen-subtle">
                      <span className="flex items-center gap-1">
                        Files into
                        <span className="rounded bg-pen-blue/10 px-1.5 py-0.5 font-medium text-pen-blue">
                          {subDeptName(c.subDepartmentId)}
                        </span>
                      </span>
                      <span className="rounded bg-pen-surface px-1.5 py-0.5 font-mono text-[9.5px] text-pen-muted">
                        {c.authType}
                      </span>
                      <span>Checked {relativeTime(c.lastCheckedAt)}</span>
                      {c.failureCount > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {c.failureCount} failed check{c.failureCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                    <span className={cn("flex items-center gap-1.5 rounded-full px-2 py-0.5 font-sans text-[10.5px] font-semibold", meta.chip)}>
                      <span className={cn("size-1.5 rounded-full", meta.dot)} />
                      {meta.label}
                    </span>
                    {canManage && editingId !== c.id && (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => recheck(c.id)}
                          disabled={busy}
                          title="Test connection"
                          className="rounded-md p-1.5 text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-50"
                        >
                          <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingId(c.id); setEditAddress(c.address); }}
                          title="Edit address"
                          className="rounded-md p-1.5 text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDisconnect(c)}
                          title="Disconnect"
                          className="rounded-md p-1.5 text-pen-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {c.status !== "ACTIVE" && c.lastErrorMessage && (
                  <div className="flex items-start gap-2 border-t border-pen-card-border bg-red-50/50 px-4 py-2.5 dark:bg-red-900/10">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-500" />
                    <p className="font-sans text-[11.5px] text-red-600 dark:text-red-400">{c.lastErrorMessage}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Received mail ── */}
      {!noTeams && (
        <ReceivedMailPanel
          endpoint={`/api/admin/departments/${departmentId}/mailbox-mail`}
          canManage={canManage}
        />
      )}

      {/* ── How it works ── */}
      <div className="rounded-2xl border border-pen-card-border bg-pen-surface/40 p-4">
        <p className="font-sans text-[11px] font-semibold tracking-[0.5px] text-pen-subtle uppercase">
          How shared mailboxes work
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 font-sans text-[12px] text-pen-muted">
          <li>• Mail delivered to a connected address opens a new ticket for the team it files into.</li>
          <li>• Replies thread onto the same ticket automatically.</li>
          <li>• We check each connection automatically; use <span className="text-pen-foreground">Test connection</span> to verify one right now.</li>
        </ul>
      </div>
    </div>
  );
}
