"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, X, Clock, Timer, FileText, Flag, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { UI_PRIORITY_DOT_HEX, type UiPriority } from "@/components/board/board-types";

const PRIORITIES = ["Low", "Medium", "High", "Critical", "Urgent"] as const;
type Priority = (typeof PRIORITIES)[number];

type SlaPolicy = {
  id: string;
  name: string;
  conditions: { combinator: "AND" | "OR"; conditions: unknown[] };
  firstResponseMins: number;
  resolutionMins: number;
  enabled: boolean;
  order: number;
  formConfigId: string | null;
  subDepartmentId: string | null;
  priority: Priority | null;
};

type SubDepartmentOption = { id: string; name: string };

type FormOption = { id: string; name: string };

function SkeletonRows({ count = 3, height = "h-9" }: { count?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn("animate-pulse rounded-lg bg-sts-surface", height)} />
      ))}
    </div>
  );
}

type SlaConfig = {
  pauseOutsideHours: boolean;
  pauseWhenWaitingForCustomer: boolean;
  atRiskPct: number;
};
type BusinessHours = { timezone: string; workingDays: number[]; workStartTime: string; workEndTime: string };

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

const SUB_DEPT_OPTIONS = (subDepartments: SubDepartmentOption[]) => [
  { value: "", label: "None (form default)" },
  ...subDepartments.map((s) => ({ value: s.id, label: s.name })),
];

export function SlaSettingsPage({
  departmentId,
  departmentName,
  subDepartments,
}: {
  departmentId: string;
  departmentName: string;
  subDepartments?: SubDepartmentOption[];
}) {
  const [policies, setPolicies] = useState<SlaPolicy[] | null>(null);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [slaConfig, setSlaConfig] = useState<SlaConfig | null>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHours | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPolicyFor, setNewPolicyFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const subDeptList = subDepartments ?? [];

  const loadSettings = () => {
    fetch(`/api/departments/${departmentId}/sla-settings`)
      .then(jsonOrThrow)
      .then((settingsRes) => {
        setSlaConfig(settingsRes.slaConfig);
        setBusinessHours(settingsRes.businessHours);
      })
      .catch((e) => setError(e.message));
  };

  const loadPolicies = () => {
    setPolicies(null);
    Promise.all([
      fetch(`/api/departments/${departmentId}/sla-policies`).then(jsonOrThrow),
      fetch(`/api/departments/${departmentId}/forms`).then(jsonOrThrow),
    ])
      .then(([policiesRes, formsRes]) => {
        setPolicies(policiesRes);
        setForms(formsRes);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(loadSettings, [departmentId]);
  useEffect(loadPolicies, [departmentId]);

  async function createPolicy(input: {
    name: string;
    firstResponseMins: number;
    resolutionMins: number;
    formConfigId: string | null;
    priority: Priority | null;
    subDepartmentId: string | null;
  }) {
    setCreating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: input.name,
        firstResponseMins: input.firstResponseMins,
        resolutionMins: input.resolutionMins,
        formConfigId: input.formConfigId,
        priority: input.priority,
      };
      if (input.subDepartmentId) body.subDepartmentId = input.subDepartmentId;

      const created = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/sla-policies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      setPolicies((prev) => [...(prev ?? []), created]);
      setNewPolicyFor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create policy");
    } finally {
      setCreating(false);
    }
  }

  async function savePolicy(id: string, patch: Partial<SlaPolicy>) {
    setError(null);
    const updated = await jsonOrThrow(
      await fetch(`/api/departments/${departmentId}/sla-policies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    );
    setPolicies((prev) => prev?.map((p) => (p.id === id ? { ...p, ...updated } : p)) ?? null);
  }

  async function deletePolicy(id: string) {
    const res = await fetch(`/api/departments/${departmentId}/sla-policies/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to delete policy");
    }
    setPolicies((p) => p?.filter((x) => x.id !== id) ?? null);
  }

  async function saveSettings() {
    if (!slaConfig || !businessHours) return;
    setSaving(true);
    setError(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/sla-settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slaConfig, businessHours }),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save SLA settings");
    } finally {
      setSaving(false);
    }
  }

  function toggleWorkingDay(day: number) {
    if (!businessHours) return;
    const has = businessHours.workingDays.includes(day);
    setBusinessHours({
      ...businessHours,
      workingDays: has
        ? businessHours.workingDays.filter((d) => d !== day)
        : [...businessHours.workingDays, day].sort(),
    });
  }

  const policiesByForm = new Map<string, SlaPolicy[]>();
  const noFormPolicies: SlaPolicy[] = [];
  for (const p of policies ?? []) {
    if (p.formConfigId && forms.some((f) => f.id === p.formConfigId)) {
      const arr = policiesByForm.get(p.formConfigId) ?? [];
      arr.push(p);
      policiesByForm.set(p.formConfigId, arr);
    } else {
      noFormPolicies.push(p);
    }
  }

  return (
    <div className="w-full px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <Link
        href="/settings/departments"
        className="mb-4 inline-flex items-center gap-1.5 font-sans text-[12.5px] text-sts-muted hover:text-sts-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back to departments
      </Link>

      <h1 className="sts-text-modal-title mb-1">SLA policies — {departmentName}</h1>
      <p className="mb-6 font-sans text-[12.5px] text-sts-muted">
        Policies are configured at the department level; sub-departments inherit them. First-response
        and resolution targets are matched against submitted form values. When several policies match,
        the strictest target on each metric wins.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-[12.5px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-8">
        <div className="mb-3">
          <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Policies</h2>
          {policies !== null && (
            <p className="mt-0.5 font-sans text-[11px] text-sts-subtle">
              {policies.length} {policies.length === 1 ? "policy" : "policies"} ·{" "}
              {policies.filter((p) => p.enabled).length} active · grouped by support form
            </p>
          )}
        </div>

        {policies === null ? (
          <SkeletonRows count={3} height="h-44" />
        ) : forms.length === 0 && noFormPolicies.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-sts-card-border py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-sts-blue/10">
              <FileText className="size-5 text-sts-blue" />
            </div>
            <p className="font-sans text-[12.5px] font-medium text-sts-foreground">No support forms yet</p>
            <p className="font-sans text-[11.5px] text-sts-muted">
              Create a support form for this department first, then add SLA policies to it.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {forms.map((form) => (
              <PolicyGroup
                key={form.id}
                title={form.name}
                policies={policiesByForm.get(form.id) ?? []}
                subDepartments={subDeptList}
                onNewPolicy={() => setNewPolicyFor(form.id)}
                onSave={savePolicy}
                onDelete={deletePolicy}
                emptyHint="No SLA policies for this form yet."
              />
            ))}

            {noFormPolicies.length > 0 && (
              <PolicyGroup
                title="Not linked to a form"
                policies={noFormPolicies}
                subDepartments={subDeptList}
                onNewPolicy={() => setNewPolicyFor("")}
                onSave={savePolicy}
                onDelete={deletePolicy}
                emptyHint=""
              />
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-sts-card-border bg-sts-card p-5">
        <h2 className="mb-3 font-sans text-[13.5px] font-semibold text-sts-foreground">Working hours (SLA-04)</h2>
        {!slaConfig || !businessHours ? (
          <SkeletonRows count={4} height="h-10" />
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex w-fit cursor-pointer items-center gap-2 font-sans text-[12.5px] text-sts-foreground">
              <Switch
                checked={slaConfig.pauseOutsideHours}
                onCheckedChange={(v) => setSlaConfig({ ...slaConfig, pauseOutsideHours: v })}
              />
              Pause SLA timers outside working hours
            </label>

            <label className="flex w-fit cursor-pointer items-center gap-2 font-sans text-[12.5px] text-sts-foreground">
              <Switch
                checked={slaConfig.pauseWhenWaitingForCustomer}
                onCheckedChange={(v) =>
                  setSlaConfig({ ...slaConfig, pauseWhenWaitingForCustomer: v })
                }
              />
              Pause resolution SLA while waiting for customer
            </label>

            <label className="flex items-center gap-2 font-sans text-[12.5px] text-sts-foreground">
              At-risk threshold (%)
              <input
                type="number"
                min={1}
                max={100}
                value={slaConfig.atRiskPct}
                onChange={(e) => setSlaConfig({ ...slaConfig, atRiskPct: Number(e.target.value) })}
                className="w-20 rounded-md border border-sts-card-border bg-sts-surface px-2 py-1 font-sans text-[12px] text-sts-foreground outline-none"
              />
            </label>

            <div>
              <p className="mb-1.5 font-sans text-[11.5px] font-medium text-sts-muted">
                Fallback business calendar (used when an assignee has no personal schedule)
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 font-sans text-[11.5px] text-sts-muted">
                  Timezone
                  <input
                    value={businessHours.timezone}
                    onChange={(e) => setBusinessHours({ ...businessHours, timezone: e.target.value })}
                    className="w-40 rounded-md border border-sts-card-border bg-sts-surface px-2 py-1 font-sans text-[12px] text-sts-foreground outline-none"
                  />
                </label>
                <label className="flex items-center gap-1.5 font-sans text-[11.5px] text-sts-muted">
                  Start
                  <input
                    value={businessHours.workStartTime}
                    onChange={(e) => setBusinessHours({ ...businessHours, workStartTime: e.target.value })}
                    className="w-20 rounded-md border border-sts-card-border bg-sts-surface px-2 py-1 font-sans text-[12px] text-sts-foreground outline-none"
                  />
                </label>
                <label className="flex items-center gap-1.5 font-sans text-[11.5px] text-sts-muted">
                  End
                  <input
                    value={businessHours.workEndTime}
                    onChange={(e) => setBusinessHours({ ...businessHours, workEndTime: e.target.value })}
                    className="w-20 rounded-md border border-sts-card-border bg-sts-surface px-2 py-1 font-sans text-[12px] text-sts-foreground outline-none"
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWorkingDay(day)}
                    className={cn(
                      "rounded-full px-2 py-1 font-sans text-[11px] font-medium",
                      businessHours.workingDays.includes(day)
                        ? "bg-sts-blue text-sts-blue-fg"
                        : "bg-sts-surface text-sts-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={saveSettings}
              disabled={saving}
              className="w-fit rounded-full bg-sts-blue px-3 py-1.5 font-sans text-[12px] font-medium text-sts-blue-fg hover:bg-sts-blue/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save working-hours settings"}
            </button>
          </div>
        )}
      </div>

      {newPolicyFor !== null && (
        <NewPolicyModal
          departmentName={departmentName}
          creating={creating}
          forms={forms}
          subDepartments={subDeptList}
          initialFormConfigId={newPolicyFor}
          onCancel={() => setNewPolicyFor(null)}
          onCreate={createPolicy}
        />
      )}
    </div>
  );
}

function PolicyGroup({
  title,
  policies,
  subDepartments,
  onNewPolicy,
  onSave,
  onDelete,
  emptyHint,
}: {
  title: string;
  policies: SlaPolicy[];
  subDepartments: SubDepartmentOption[];
  onNewPolicy: () => void;
  onSave: (id: string, patch: Partial<SlaPolicy>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  emptyHint: string;
}) {
  return (
    <div className="rounded-2xl border border-sts-card-border bg-sts-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <FileText className="size-3.5 shrink-0 text-sts-subtle" />
          <h3 className="truncate font-sans text-[13px] font-semibold text-sts-foreground">{title}</h3>
          <span className="shrink-0 font-sans text-[11px] text-sts-subtle">
            · {policies.length} {policies.length === 1 ? "policy" : "policies"}
          </span>
        </div>
        <button
          type="button"
          onClick={onNewPolicy}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sts-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90"
        >
          <Plus className="size-3.5" /> New policy
        </button>
      </div>

      {policies.length === 0 ? (
        emptyHint ? (
          <p className="rounded-lg border border-dashed border-sts-card-border px-3 py-4 text-center font-sans text-[11.5px] text-sts-muted">
            {emptyHint}
          </p>
        ) : null
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="border-b border-sts-card-border text-left font-sans text-[10.5px] font-medium uppercase tracking-wide text-sts-subtle">
                <th className="px-2 py-2 font-medium">Issue</th>
                <th className="px-2 py-2 font-medium">Sub-department</th>
                <th className="px-2 py-2 font-medium">Priority goal</th>
                <th className="px-2 py-2 font-medium">Time to first response</th>
                <th className="px-2 py-2 font-medium">Time to resolution</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <PolicyRow
                  key={policy.id}
                  policy={policy}
                  subDepartments={subDepartments}
                  onSave={onSave}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PolicyRow({
  policy,
  subDepartments,
  onSave,
  onDelete,
}: {
  policy: SlaPolicy;
  subDepartments: SubDepartmentOption[];
  onSave: (id: string, patch: Partial<SlaPolicy>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: policy.name,
    priority: policy.priority,
    firstResponseMins: policy.firstResponseMins,
    resolutionMins: policy.resolutionMins,
    subDepartmentId: policy.subDepartmentId,
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
    draft.resolutionMins !== policy.resolutionMins ||
    draft.subDepartmentId !== policy.subDepartmentId;

  const canSave =
    dirty &&
    !saving &&
    draft.name.trim().length > 0 &&
    draft.firstResponseMins > 0 &&
    draft.resolutionMins > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const patch: Partial<SlaPolicy> = {
        name: draft.name.trim(),
        priority: draft.priority,
        firstResponseMins: draft.firstResponseMins,
        resolutionMins: draft.resolutionMins,
      };
      if (draft.subDepartmentId) {
        patch.subDepartmentId = draft.subDepartmentId;
      } else {
        patch.subDepartmentId = null;
      }
      await onSave(policy.id, patch);
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
        {subDepartments.length > 0 ? (
          <div className="w-[150px]">
            <SearchableSelect
              value={draft.subDepartmentId ?? ""}
              onChange={(v) => set("subDepartmentId", v || null)}
              options={SUB_DEPT_OPTIONS(subDepartments)}
              placeholder="None (form default)"
              searchable={false}
              size="sm"
              aria-label="Sub-department concerned"
            />
          </div>
        ) : (
          <span className="font-sans text-[11.5px] text-sts-subtle">—</span>
        )}
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
          <span className="whitespace-nowrap font-sans text-[10.5px] text-sts-subtle">{formatMins(draft.firstResponseMins)}</span>
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
          <span className="whitespace-nowrap font-sans text-[10.5px] text-sts-subtle">{formatMins(draft.resolutionMins)}</span>
        </div>
      </td>
      <td className={cell}>
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="inline-flex items-center gap-1 rounded-full bg-sts-blue px-2 py-1 font-sans text-[11.5px] font-medium text-white transition-opacity hover:bg-sts-blue/90 disabled:opacity-40"
            title="Save changes"
          >
            <Save className="size-3.5" /> {saving ? "Saving…" : "Update"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="rounded-full p-1.5 text-sts-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
            title="Delete policy"
          >
            <Trash2 className="size-3.5" />
          </button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete SLA policy"
            description={`Delete "${policy.name}"? Tickets it matches will no longer get its SLA targets. This can't be undone.`}
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
  departmentName,
  creating,
  forms,
  subDepartments,
  initialFormConfigId,
  onCancel,
  onCreate,
}: {
  departmentName: string;
  creating: boolean;
  forms: FormOption[];
  subDepartments: SubDepartmentOption[];
  initialFormConfigId: string;
  onCancel: () => void;
  onCreate: (input: {
    name: string;
    firstResponseMins: number;
    resolutionMins: number;
    formConfigId: string | null;
    priority: Priority | null;
    subDepartmentId: string | null;
  }) => void;
}) {
  const formConfigId = initialFormConfigId;
  const [name, setName] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [firstResponseMins, setFirstResponseMins] = useState(60);
  const [resolutionMins, setResolutionMins] = useState(480);
  const [subDepartmentId, setSubDepartmentId] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = () =>
    onCreate({
      name: name.trim(),
      firstResponseMins,
      resolutionMins,
      formConfigId: formConfigId || null,
      priority: priority || null,
      subDepartmentId: subDepartmentId || null,
    });

  const formName = forms.find((f) => f.id === formConfigId)?.name ?? null;
  const canSubmit = name.trim().length > 0 && firstResponseMins > 0 && resolutionMins > 0 && !creating;

  const fieldCls =
    "h-9 w-full rounded-[6px] border border-sts-card-border bg-sts-bg px-2.5 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-blue focus:ring-1 focus:ring-sts-blue/30";

  return (
    <div className="sts-overlay-backdrop fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onCancel}>
      <div
        className="sts-glass-panel sts-modal-enter flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[8px] ring-1 ring-white/35 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-sts-card-border px-[22px]">
          <h2 className="sts-text-modal-title">New SLA policy</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={creating}
            className="flex size-7 items-center justify-center rounded-full text-sts-muted hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-50"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-[22px] py-5">
          <p className="font-sans text-[11.5px] text-sts-muted">
            For <span className="font-medium text-sts-foreground">{departmentName}</span>
            {formName ? (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1 font-medium text-sts-foreground">
                  <FileText className="size-3" /> {formName}
                </span>
              </>
            ) : null}
            . Name the issue this policy covers, then set its priority goal (targets apply when the
            ticket priority matches).
          </p>

          <div className="space-y-1.5">
            <label className="sts-text-label">Issue</label>
            <input
              autoFocus
              placeholder="e.g. Cannot login"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) submit();
              }}
              className={fieldCls}
            />
          </div>

          {subDepartments.length > 0 && (
            <div className="space-y-1.5">
              <label className="sts-text-label">Sub-department concerned (optional)</label>
              <SearchableSelect
                value={subDepartmentId}
                onChange={(v) => setSubDepartmentId(v ?? "")}
                options={SUB_DEPT_OPTIONS(subDepartments)}
                placeholder="None (form default)"
                searchable={false}
                size="md"
                aria-label="Sub-department concerned"
              />
              <p className="font-sans text-[11px] text-sts-subtle">
                When set, tickets for this issue land in that sub-department. Otherwise the form or
                department default applies.
              </p>
            </div>
          )}

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
