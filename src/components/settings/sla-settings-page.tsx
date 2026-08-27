"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, X, Clock, Timer, User, FileText, Flag, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IssueAssigneeSelect, type MemberOption } from "@/components/ui/issue-assignee-select";
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
  assigneeIds: string[];
};

type SubDepartmentOption = { id: string; name: string };

type FormOption = { id: string; name: string };
type Person = MemberOption;

/** Shape of the /people rows we care about, before mapping to MemberOption. */
type RawPerson = {
  id: string;
  name: string | null;
  avatarUrl?: string | null;
  subDepartment?: { name?: string | null; department?: { name?: string | null } | null } | null;
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

function toMember(p: RawPerson): Person {
  return {
    id: p.id,
    name: p.name ?? "Unknown",
    avatarUrl: p.avatarUrl ?? null,
    departmentName: p.subDepartment?.department?.name ?? null,
    subDepartmentName: p.subDepartment?.name ?? null,
  };
}

type SlaConfig = { pauseOutsideHours: boolean; atRiskPct: number };
type BusinessHours = { timezone: string; workingDays: number[]; workStartTime: string; workEndTime: string };

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Render a minute count as a compact human duration, e.g. 90 → "1h 30m". */
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

export function SlaSettingsPage({
  departmentId,
  departmentName,
  subDepartmentId,
  subDepartmentName,
  subDepartments,
}: {
  departmentId: string;
  departmentName: string;
  /** When set, this surface manages ONLY the given sub-department's SLA. */
  subDepartmentId?: string;
  subDepartmentName?: string;
  /** Sub-departments of this department — powers the department page's scope tabs. */
  subDepartments?: SubDepartmentOption[];
}) {
  const [policies, setPolicies] = useState<SlaPolicy[] | null>(null);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [slaConfig, setSlaConfig] = useState<SlaConfig | null>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHours | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // null = modal closed; "" = open for no particular form; a form id = open
  // pre-scoped to that support form.
  const [newPolicyFor, setNewPolicyFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Department page only: a scope dropdown to view policies sub-department-wise.
  // "all" merges every sub-department, "" is department-wide, else a sub-dept id.
  const showScopeSelect = !subDepartmentId && (subDepartments?.length ?? 0) > 0;
  const [activeScope, setActiveScope] = useState<string>(showScopeSelect ? "all" : "");
  const subDeptNameById = new Map((subDepartments ?? []).map((s) => [s.id, s.name]));

  // Options for the scope dropdown, in display order.
  const scopeOptions = [
    { value: "all", label: "All sub-departments" },
    { value: "", label: "Only Department" },
    ...(subDepartments ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  // Working hours + members stay at the surface's own scope (the sub-department on
  // the scoped surface, else department-wide), independent of the selected scope.
  const settingsScopeQs = subDepartmentId ? `?subDepartmentId=${encodeURIComponent(subDepartmentId)}` : "";
  const settingsScopeBody = subDepartmentId ? { subDepartmentId } : {};

  // Policies + forms follow the selected scope on the department page.
  const policiesScopeQs = subDepartmentId
    ? `?subDepartmentId=${encodeURIComponent(subDepartmentId)}`
    : activeScope === "all"
      ? "?scope=all"
      : activeScope
        ? `?subDepartmentId=${encodeURIComponent(activeScope)}`
        : "";

  // On the merged "All" overview the target scope is ambiguous, so creating is
  // disabled there; otherwise new policies land in the selected scope.
  const creationDisabled = showScopeSelect && activeScope === "all";
  const showPolicySubDept = showScopeSelect && activeScope === "all";
  const createScopeBody = subDepartmentId
    ? { subDepartmentId }
    : activeScope && activeScope !== "all"
      ? { subDepartmentId: activeScope }
      : {};
  const createScopeName =
    subDepartmentName ??
    (activeScope && activeScope !== "all" ? subDeptNameById.get(activeScope) : null) ??
    departmentName;

  const loadSettings = () => {
    Promise.all([
      fetch(`/api/departments/${departmentId}/sla-settings${settingsScopeQs}`).then(jsonOrThrow),
      fetch(`/api/departments/${departmentId}/people`).then(jsonOrThrow),
    ])
      .then(([settingsRes, peopleRes]) => {
        setSlaConfig(settingsRes.slaConfig);
        setBusinessHours(settingsRes.businessHours);
        setPeople(((peopleRes.people ?? []) as RawPerson[]).map(toMember));
      })
      .catch((e) => setError(e.message));
  };

  const loadPolicies = () => {
    setPolicies(null);
    Promise.all([
      fetch(`/api/departments/${departmentId}/sla-policies${policiesScopeQs}`).then(jsonOrThrow),
      fetch(`/api/departments/${departmentId}/forms${policiesScopeQs}`).then(jsonOrThrow),
    ])
      .then(([policiesRes, formsRes]) => {
        setPolicies(policiesRes);
        setForms(formsRes);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(loadSettings, [departmentId, subDepartmentId]);
  useEffect(loadPolicies, [departmentId, policiesScopeQs]);

  async function createPolicy(input: {
    name: string;
    firstResponseMins: number;
    resolutionMins: number;
    formConfigId: string | null;
    priority: Priority | null;
    assigneeIds: string[];
  }) {
    setCreating(true);
    setError(null);
    try {
      const created = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/sla-policies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: input.name,
            conditions: { combinator: "AND", conditions: [] },
            firstResponseMins: input.firstResponseMins,
            resolutionMins: input.resolutionMins,
            formConfigId: input.formConfigId,
            priority: input.priority,
            assigneeIds: input.assigneeIds,
            ...createScopeBody,
          }),
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

  // Explicit save (from a row's Update button). Commits the staged edits and
  // syncs state from the server response. Throws so the row can surface errors.
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

  // Throws on failure so the ConfirmDialog keeps the modal open + toasts.
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
          body: JSON.stringify({ slaConfig, businessHours, ...settingsScopeBody }),
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

  // Bucket policies under their support form; anything with no form (or a form
  // that no longer exists) falls into the trailing "not linked" group.
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
        className={cn(
          "mb-4 inline-flex items-center gap-1.5 font-sans text-[12.5px] text-sts-muted hover:text-sts-foreground",
          subDepartmentId && "hidden",
        )}
      >
        <ArrowLeft className="size-3.5" /> Back to departments
      </Link>

      <h1 className="sts-text-modal-title mb-1">
        SLA policies — {subDepartmentName ?? departmentName}
      </h1>
      <p className="mb-6 font-sans text-[12.5px] text-sts-muted">
        {subDepartmentId
          ? "These policies and business hours run in addition to the parent department's, for this sub-department's tickets only. "
          : ""}
        First-response and resolution targets, matched against submitted form values. When several
        policies match, the strictest target on each metric wins.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-[12.5px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── Sub-department scope selector (department page only) ── */}
      {showScopeSelect && (
        <div className="mb-5 flex items-center gap-2">
          <label className="font-sans text-[12px] font-medium text-sts-muted">Sub-department</label>
          <Select items={scopeOptions} value={activeScope} onValueChange={(v) => setActiveScope(v ?? "")}>
            <SelectTrigger className="w-60 border-sts-blue/30 bg-sts-blue/5 font-sans text-[12.5px] font-medium text-sts-blue hover:bg-sts-blue/10">
              <FileText className="size-3.5 text-sts-blue" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopeOptions.map((opt) => (
                <SelectItem key={opt.value || "dept-wide"} value={opt.value} className="font-sans text-[12.5px]">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Policies, grouped by support form ── */}
      <div className="mb-8">
        <div className="mb-3">
          <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Policies</h2>
          {policies !== null && (
            <p className="mt-0.5 font-sans text-[11px] text-sts-subtle">
              {policies.length} {policies.length === 1 ? "policy" : "policies"} ·{" "}
              {policies.filter((p) => p.enabled).length} active · grouped by support form
              {showPolicySubDept ? " · across all sub-departments" : ""}
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
                people={people}
                canCreate={!creationDisabled}
                showSubDept={showPolicySubDept}
                subDeptNameById={subDeptNameById}
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
                people={people}
                canCreate={!creationDisabled}
                showSubDept={showPolicySubDept}
                subDeptNameById={subDeptNameById}
                onNewPolicy={() => setNewPolicyFor("")}
                onSave={savePolicy}
                onDelete={deletePolicy}
                emptyHint=""
              />
            )}
          </div>
        )}
      </div>

      {/* ── Working-hours settings ── */}
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
                      "rounded-md px-2 py-1 font-sans text-[11px] font-medium",
                      businessHours.workingDays.includes(day)
                        ? "bg-sts-blue text-white"
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
              className="w-fit rounded-md bg-sts-blue px-3 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save working-hours settings"}
            </button>
          </div>
        )}
      </div>

      {newPolicyFor !== null && (
        <NewPolicyModal
          scopeName={createScopeName}
          creating={creating}
          forms={forms}
          people={people}
          initialFormConfigId={newPolicyFor}
          onCancel={() => setNewPolicyFor(null)}
          onCreate={createPolicy}
        />
      )}
    </div>
  );
}

// ── Per-form policy group ────────────────────────────────────────────────────
/** One support form's SLA policies, with its own "New policy" button. */
function PolicyGroup({
  title,
  policies,
  people,
  canCreate,
  showSubDept,
  subDeptNameById,
  onNewPolicy,
  onSave,
  onDelete,
  emptyHint,
}: {
  title: string;
  policies: SlaPolicy[];
  people: Person[];
  /** Whether the "New policy" button shows (hidden on the merged "All" overview). */
  canCreate: boolean;
  /** Show each policy's sub-department, for the cross-sub-department overview. */
  showSubDept: boolean;
  subDeptNameById: Map<string, string>;
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
        {canCreate && (
          <button
            type="button"
            onClick={onNewPolicy}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sts-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90"
          >
            <Plus className="size-3.5" /> New policy
          </button>
        )}
      </div>

      {policies.length === 0 ? (
        emptyHint ? (
          <p className="rounded-lg border border-dashed border-sts-card-border px-3 py-4 text-center font-sans text-[11.5px] text-sts-muted">
            {emptyHint}
          </p>
        ) : null
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-sts-card-border text-left font-sans text-[10.5px] font-medium uppercase tracking-wide text-sts-subtle">
                <th className="px-2 py-2 font-medium">Issue</th>
                <th className="px-2 py-2 font-medium">Priority</th>
                <th className="px-2 py-2 font-medium">Assign to</th>
                <th className="px-2 py-2 font-medium">First response</th>
                <th className="px-2 py-2 font-medium">Resolution</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <PolicyRow
                  key={policy.id}
                  policy={policy}
                  people={people}
                  subDeptName={
                    showSubDept
                      ? policy.subDepartmentId
                        ? subDeptNameById.get(policy.subDepartmentId) ?? null
                        : "Only Department"
                      : null
                  }
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

// ── Single policy row: staged edits committed via an explicit Update button ──
function PolicyRow({
  policy,
  people,
  subDeptName,
  onSave,
  onDelete,
}: {
  policy: SlaPolicy;
  people: Person[];
  /** Sub-department label shown under the name in the "All" overview, else null. */
  subDeptName: string | null;
  onSave: (id: string, patch: Partial<SlaPolicy>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: policy.name,
    priority: policy.priority,
    assigneeIds: policy.assigneeIds,
    firstResponseMins: policy.firstResponseMins,
    resolutionMins: policy.resolutionMins,
  });
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function set<K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  const sameIds = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();

  const dirty =
    draft.name !== policy.name ||
    draft.priority !== policy.priority ||
    !sameIds(draft.assigneeIds, policy.assigneeIds) ||
    draft.firstResponseMins !== policy.firstResponseMins ||
    draft.resolutionMins !== policy.resolutionMins;

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
      await onSave(policy.id, {
        name: draft.name.trim(),
        priority: draft.priority,
        assigneeIds: draft.assigneeIds,
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
        {subDeptName && (
          <span className="mt-1 inline-block rounded-full border border-sts-blue/20 bg-sts-blue/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-sts-blue">
            {subDeptName}
          </span>
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
            aria-label="Priority"
          />
        </div>
      </td>
      <td className={cell}>
        <div className="w-[180px]">
          {people.length === 0 ? (
            <span className="font-sans text-[11.5px] text-sts-subtle">No members</span>
          ) : (
            <IssueAssigneeSelect
              value={draft.assigneeIds}
              onChange={(ids) => set("assigneeIds", ids)}
              members={people}
              className="w-full"
            />
          )}
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
            className="inline-flex items-center gap-1 rounded-md bg-sts-blue px-2 py-1 font-sans text-[11.5px] font-medium text-white transition-opacity hover:bg-sts-blue/90 disabled:opacity-40"
            title="Save changes"
          >
            <Save className="size-3.5" /> {saving ? "Saving…" : "Update"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="rounded-md p-1.5 text-sts-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
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

// ── New-policy modal ─────────────────────────────────────────────────────────
/**
 * Authors a policy from a support form's issue: pick a form, then one of its
 * issues — the issue's name becomes the policy name and its priority + first
 * assignee pre-fill (both still editable). All are optional; a policy with none
 * of them still applies to every ticket in scope.
 */
function NewPolicyModal({
  scopeName,
  creating,
  forms,
  people,
  initialFormConfigId,
  onCancel,
  onCreate,
}: {
  scopeName: string;
  creating: boolean;
  forms: FormOption[];
  people: Person[];
  /** Preselected support form ("" for none) — set when opened from a form's own "New policy" button. */
  initialFormConfigId: string;
  onCancel: () => void;
  onCreate: (input: {
    name: string;
    firstResponseMins: number;
    resolutionMins: number;
    formConfigId: string | null;
    priority: Priority | null;
    assigneeIds: string[];
  }) => void;
}) {
  // Fixed for the modal's lifetime — the form is chosen by which group's
  // "New policy" button opened it, not from inside the modal.
  const formConfigId = initialFormConfigId;
  const [name, setName] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [firstResponseMins, setFirstResponseMins] = useState(60);
  const [resolutionMins, setResolutionMins] = useState(480);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
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
      assigneeIds,
    });

  const formName = forms.find((f) => f.id === formConfigId)?.name ?? null;
  const canSubmit = name.trim().length > 0 && firstResponseMins > 0 && resolutionMins > 0 && !creating;

  const fieldCls =
    "h-9 w-full rounded-[6px] border border-sts-card-border bg-sts-bg px-2.5 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-blue focus:ring-1 focus:ring-sts-blue/30";

  return (
    <div className="sts-overlay-backdrop fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onCancel}>
      <div
        className="sts-glass-panel sts-modal-enter flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[14px] ring-1 ring-white/35 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-sts-card-border px-[22px]">
          <h2 className="sts-text-modal-title">New SLA policy</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={creating}
            className="flex size-7 items-center justify-center rounded-md text-sts-muted hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-50"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 overflow-y-auto px-[22px] py-5">
          <p className="font-sans text-[11.5px] text-sts-muted">
            For <span className="font-medium text-sts-foreground">{scopeName}</span>
            {formName ? (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1 font-medium text-sts-foreground">
                  <FileText className="size-3" /> {formName}
                </span>
              </>
            ) : null}
            . Name the issue this policy covers, then set its priority and assignee.
          </p>

          <div className="space-y-1.5">
            <label className="sts-text-label">Issue</label>
            <input
              autoFocus
              placeholder="e.g. Cannot login"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }}
              className={fieldCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="sts-text-label flex items-center gap-1.5">
                <Flag className="size-3" /> Priority
              </label>
              <SearchableSelect
                value={priority}
                onChange={(v) => setPriority(v as Priority | "")}
                options={PRIORITIES.map((p) => ({
                  value: p,
                  label: p,
                  color: UI_PRIORITY_DOT_HEX[p.toLowerCase() as UiPriority],
                }))}
                placeholder="No priority"
                searchable={false}
                leadingDot
                size="md"
                aria-label="Priority"
              />
            </div>
            <div className="space-y-1.5">
              <label className="sts-text-label flex items-center gap-1.5">
                <User className="size-3" /> Assign to
              </label>
              {people.length === 0 ? (
                <p className="font-sans text-[11.5px] text-sts-subtle">No members to assign.</p>
              ) : (
                <IssueAssigneeSelect
                  value={assigneeIds}
                  onChange={setAssigneeIds}
                  members={people}
                  className="w-full"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="sts-text-label flex items-center gap-1.5">
                <Timer className="size-3" /> First response (mins)
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
                <Clock className="size-3" /> Resolution (mins)
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

        {/* Footer */}
        <div className="flex h-14 shrink-0 items-center justify-end gap-2.5 border-t border-sts-card-border bg-sts-bg px-[22px]">
          <button
            type="button"
            onClick={onCancel}
            disabled={creating}
            className="flex h-8 w-[78px] items-center justify-center rounded-[6px] border border-sts-card-border font-sans text-[12px] font-semibold text-sts-foreground transition-colors hover:bg-sts-card-border disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="flex h-8 items-center gap-1.5 rounded-[6px] bg-sts-blue px-3 font-sans text-[12px] font-medium text-white dark:text-gray-900 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create policy"}
          </button>
        </div>
      </div>
    </div>
  );
}
