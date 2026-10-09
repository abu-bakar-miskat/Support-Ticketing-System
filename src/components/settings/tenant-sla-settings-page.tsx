"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X, Clock, Timer, Flag, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { UI_PRIORITY_DOT_HEX, type UiPriority } from "@/components/board/board-types";
import { Tip } from "@/components/ui/tooltip";
import { ListSearchInput, SortDropdown, byDateAsc, byDateDesc, byText, useListControls } from "@/components/ui/list-controls";

const PRIORITIES = ["Low", "Medium", "High", "Critical", "Urgent"] as const;
type Priority = (typeof PRIORITIES)[number];
/** Highest priority first; policies with no priority goal sort last. */
const priorityRank = (p: Priority | null) => (p ? PRIORITIES.length - PRIORITIES.indexOf(p) : 0);

type SlaPolicy = {
  id: string;
  name: string;
  conditions: { combinator: "AND" | "OR"; conditions: unknown[] };
  firstResponseMins: number;
  resolutionMins: number;
  enabled: boolean;
  order: number;
  priority: Priority | null;
  /** ISO timestamp — drives the Newest / Oldest sorts. */
  createdAt?: string;
};

function SkeletonRows({ count = 3, height = "h-9" }: { count?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn("animate-pulse rounded-lg bg-sts-surface", height)} />
      ))}
    </div>
  );
}

function formatMins(mins: number): string {
  if (!Number.isFinite(mins) || mins <= 0) return "—";
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ") || "0m";
}

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function TenantSlaSettingsPage() {
  const [policies, setPolicies] = useState<SlaPolicy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // Display-only — the strictest matching target wins, so list order doesn't affect which policy applies.
  const list = useListControls(policies ?? [], {
    searchText: (p) => `${p.name} ${p.priority ?? ""} ${p.enabled ? "enabled active" : "disabled"}`,
    sortOptions: [
      { id: "default", label: "Default order", compare: (a, b) => a.order - b.order },
      { id: "name", label: "Name A–Z", compare: byText((p: SlaPolicy) => p.name) },
      { id: "newest", label: "Newest first", compare: byDateDesc((p: SlaPolicy) => p.createdAt) },
      { id: "oldest", label: "Oldest first", compare: byDateAsc((p: SlaPolicy) => p.createdAt) },
      { id: "priority", label: "Highest priority", compare: (a, b) => priorityRank(b.priority) - priorityRank(a.priority) },
      { id: "first-response", label: "Fastest first response", compare: (a, b) => a.firstResponseMins - b.firstResponseMins },
      { id: "resolution", label: "Fastest resolution", compare: (a, b) => a.resolutionMins - b.resolutionMins },
    ],
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tenant/sla-policies`)
      .then(jsonOrThrow)
      .then((res) => {
        if (!cancelled) setPolicies(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createPolicy(input: {
    name: string;
    firstResponseMins: number;
    resolutionMins: number;
    priority: Priority | null;
  }) {
    setCreating(true);
    setError(null);
    try {
      const created = await jsonOrThrow(
        await fetch(`/api/tenant/sla-policies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      );
      setPolicies((prev) => [...(prev ?? []), created]);
      setNewOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create policy");
    } finally {
      setCreating(false);
    }
  }

  async function savePolicy(id: string, patch: Partial<SlaPolicy>) {
    setError(null);
    const updated = await jsonOrThrow(
      await fetch(`/api/tenant/sla-policies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    );
    setPolicies((prev) => prev?.map((p) => (p.id === id ? { ...p, ...updated } : p)) ?? null);
  }

  async function deletePolicy(id: string) {
    const res = await fetch(`/api/tenant/sla-policies/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to delete policy");
    }
    setPolicies((p) => p?.filter((x) => x.id !== id) ?? null);
  }

  return (
    <div className="w-full px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <h1 className="sts-text-modal-title mb-1">SLA defaults</h1>
      <p className="mb-6 max-w-2xl font-sans text-[12.5px] text-sts-muted">
        Tenant-wide default SLA policies. Every department inherits these unless it configures its
        own SLA policies, which then override the defaults for that department. First-response and
        resolution targets are matched against submitted form values; when several policies match,
        the strictest target on each metric wins.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-[12.5px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-sts-card-border bg-sts-card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Default policies</h2>
            {policies !== null && (
              <p className="mt-0.5 font-sans text-[11px] text-sts-subtle">
                {policies.length} {policies.length === 1 ? "policy" : "policies"} ·{" "}
                {policies.filter((p) => p.enabled).length} active
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {policies !== null && policies.length > 0 && (
              <>
                <ListSearchInput value={list.query} onChange={list.setQuery} placeholder="Search policies…" />
                <SortDropdown value={list.sortKey} onChange={list.setSortKey} options={list.sortDropdownOptions} />
              </>
            )}
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sts-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90"
            >
              <Plus className="size-3.5" /> New policy
            </button>
          </div>
        </div>

        {policies === null ? (
          <SkeletonRows count={3} height="h-11" />
        ) : policies.length === 0 ? (
          <p className="rounded-lg border border-dashed border-sts-card-border px-3 py-6 text-center font-sans text-[11.5px] text-sts-muted">
            No tenant-level SLA defaults yet. Add one to apply an SLA to every department that
            hasn&apos;t set its own.
          </p>
        ) : list.visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-sts-card-border px-3 py-6 text-center font-sans text-[11.5px] text-sts-muted">
            No policies match &ldquo;{list.query.trim()}&rdquo;
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-sts-card-border text-left font-sans text-[10.5px] font-medium uppercase tracking-wide text-sts-subtle">
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Priority goal</th>
                  <th className="px-2 py-2 font-medium">Time to first response</th>
                  <th className="px-2 py-2 font-medium">Time to resolution</th>
                  <th className="px-2 py-2 font-medium">Active</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {list.visible.map((policy) => (
                  <PolicyRow key={policy.id} policy={policy} onSave={savePolicy} onDelete={deletePolicy} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {newOpen && (
        <NewPolicyModal creating={creating} onCancel={() => setNewOpen(false)} onCreate={createPolicy} />
      )}
    </div>
  );
}

function PolicyRow({
  policy,
  onSave,
  onDelete,
}: {
  policy: SlaPolicy;
  onSave: (id: string, patch: Partial<SlaPolicy>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: policy.name,
    priority: policy.priority,
    firstResponseMins: policy.firstResponseMins,
    resolutionMins: policy.resolutionMins,
  });
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function set<K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  const dirty =
    draft.name !== policy.name ||
    draft.priority !== policy.priority ||
    draft.firstResponseMins !== policy.firstResponseMins ||
    draft.resolutionMins !== policy.resolutionMins;

  const canSave =
    dirty && !saving && draft.name.trim().length > 0 && draft.firstResponseMins > 0 && draft.resolutionMins > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(policy.id, {
        name: draft.name.trim(),
        priority: draft.priority,
        firstResponseMins: draft.firstResponseMins,
        resolutionMins: draft.resolutionMins,
      });
    } finally {
      setSaving(false);
    }
  }

  const cell = "px-2 py-2 align-middle";
  const numCls =
    "w-20 rounded-md border border-sts-card-border bg-sts-surface px-2 py-1 font-sans text-[12px] text-sts-foreground outline-none focus:border-sts-blue/60 focus:ring-2 focus:ring-sts-blue/15";

  return (
    <tr className={cn("border-b border-sts-card-border/60", !policy.enabled && "opacity-60")}>
      <td className={cell}>
        <input
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          className="w-full min-w-[140px] rounded-md border border-sts-card-border bg-sts-surface px-2 py-1 font-sans text-[12.5px] font-medium text-sts-foreground outline-none focus:border-sts-blue/60 focus:ring-2 focus:ring-sts-blue/15"
        />
      </td>
      <td className={cell}>
        <div className="w-[130px]">
          <SearchableSelect
            value={draft.priority ?? ""}
            onChange={(v) => set("priority", (v || null) as Priority | null)}
            options={PRIORITIES.map((p) => ({
              value: p,
              label: p,
              color: UI_PRIORITY_DOT_HEX[p.toLowerCase() as UiPriority],
            }))}
            placeholder="No priority"
            searchable={false}
            leadingDot
            size="sm"
            aria-label="Priority goal"
          />
        </div>
      </td>
      <td className={cell}>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            value={draft.firstResponseMins}
            onChange={(e) => set("firstResponseMins", Number(e.target.value))}
            className={numCls}
          />
          <span className="whitespace-nowrap font-sans text-[10.5px] text-sts-subtle">
            {formatMins(draft.firstResponseMins)}
          </span>
        </div>
      </td>
      <td className={cell}>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            value={draft.resolutionMins}
            onChange={(e) => set("resolutionMins", Number(e.target.value))}
            className={numCls}
          />
          <span className="whitespace-nowrap font-sans text-[10.5px] text-sts-subtle">
            {formatMins(draft.resolutionMins)}
          </span>
        </div>
      </td>
      <td className={cell}>
        <Switch
          checked={policy.enabled}
          onCheckedChange={(v) => onSave(policy.id, { enabled: v })}
          aria-label="Enable policy"
        />
      </td>
      <td className={cell}>
        <div className="flex items-center justify-end gap-1.5">
          <Tip label="Save changes">
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="inline-flex items-center gap-1 rounded-full bg-sts-blue px-2 py-1 font-sans text-[11.5px] font-medium text-white transition-opacity hover:bg-sts-blue/90 disabled:opacity-40"
            >
              <Save className="size-3.5" /> {saving ? "Saving…" : "Update"}
            </button>
          </Tip>
          <Tip label="Delete policy">
            <button
              aria-label="Delete policy"
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="rounded-full p-1.5 text-sts-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
            >
              <Trash2 className="size-3.5" />
            </button>
          </Tip>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete SLA default"
            description={`Delete "${policy.name}"? Departments inheriting the tenant defaults will no longer get its SLA targets. This can't be undone.`}
            confirmLabel="Delete"
            successMessage="Policy deleted"
            onConfirm={() => onDelete(policy.id)}
          />
        </div>
      </td>
    </tr>
  );
}

function NewPolicyModal({
  creating,
  onCancel,
  onCreate,
}: {
  creating: boolean;
  onCancel: () => void;
  onCreate: (input: {
    name: string;
    firstResponseMins: number;
    resolutionMins: number;
    priority: Priority | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [firstResponseMins, setFirstResponseMins] = useState(60);
  const [resolutionMins, setResolutionMins] = useState(480);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const canSubmit = name.trim().length > 0 && firstResponseMins > 0 && resolutionMins > 0 && !creating;
  const submit = () =>
    onCreate({ name: name.trim(), firstResponseMins, resolutionMins, priority: priority || null });

  const fieldCls =
    "h-9 w-full rounded-[6px] border border-sts-card-border bg-sts-bg px-2.5 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-blue focus:ring-1 focus:ring-sts-blue/30";

  return (
    <div className="sts-overlay-backdrop fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onCancel}>
      <div
        className="sts-glass-panel sts-modal-enter flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[8px] ring-1 ring-white/35 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-sts-card-border px-[22px]">
          <h2 className="sts-text-modal-title">New SLA default</h2>
          <Tip label="Close">
            <button
              aria-label="Close"
              type="button"
              onClick={onCancel}
              disabled={creating}
              className="flex size-7 items-center justify-center rounded-full text-sts-muted hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-50"
            >
              <X size={17} strokeWidth={2} />
            </button>
          </Tip>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-[22px] py-5">
          <p className="font-sans text-[11.5px] text-sts-muted">
            Applies tenant-wide to every department that has not configured its own SLA policies.
            Name it, then set its priority goal (targets apply when the ticket priority matches).
          </p>

          <div className="space-y-1.5">
            <label className="sts-text-label">Name</label>
            <input
              autoFocus
              placeholder="e.g. Standard response"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) submit();
              }}
              className={fieldCls}
            />
          </div>

          <div className="space-y-1.5">
            <label className="sts-text-label flex items-center gap-1.5">
              <Flag className="size-3" /> Priority goal
            </label>
            <SearchableSelect
              value={priority}
              onChange={(v) => setPriority(v as Priority | "")}
              options={PRIORITIES.map((p) => ({
                value: p,
                label: p,
                color: UI_PRIORITY_DOT_HEX[p.toLowerCase() as UiPriority],
              }))}
              placeholder="Any priority (catch-all)"
              searchable={false}
              leadingDot
              size="md"
              aria-label="Priority goal"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="sts-text-label flex items-center gap-1.5">
                <Timer className="size-3" /> Time to first response (mins)
              </label>
              <input
                type="number"
                min={1}
                value={firstResponseMins}
                onChange={(e) => setFirstResponseMins(Number(e.target.value))}
                className={fieldCls}
              />
              <p className="font-sans text-[11px] text-sts-subtle">{formatMins(firstResponseMins)}</p>
            </div>
            <div className="space-y-1.5">
              <label className="sts-text-label flex items-center gap-1.5">
                <Clock className="size-3" /> Time to resolution (mins)
              </label>
              <input
                type="number"
                min={1}
                value={resolutionMins}
                onChange={(e) => setResolutionMins(Number(e.target.value))}
                className={fieldCls}
              />
              <p className="font-sans text-[11px] text-sts-subtle">{formatMins(resolutionMins)}</p>
            </div>
          </div>
        </div>

        <div className="flex h-14 shrink-0 items-center justify-end gap-2.5 border-t border-sts-card-border bg-sts-bg px-[22px]">
          <button
            type="button"
            onClick={onCancel}
            disabled={creating}
            className="flex h-8 w-[78px] items-center justify-center rounded-full border border-sts-card-border font-sans text-[12px] font-semibold text-sts-foreground transition-colors hover:bg-sts-card-border disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="flex h-8 items-center gap-1.5 rounded-full bg-sts-blue px-3 font-sans text-[12px] font-medium text-white dark:text-gray-900 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create policy"}
          </button>
        </div>
      </div>
    </div>
  );
}
