"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, X, Clock, Timer, FileText, Flag, Save, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenantHref } from "@/hooks/use-tenant-href";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TimezoneSelect } from "@/components/settings/timezone-select";
import { UI_PRIORITY_DOT_HEX, type UiPriority } from "@/components/board/board-types";
import { Tip } from "@/components/ui/tooltip";
import { ListSearchInput, SortDropdown, byText, useListControls } from "@/components/ui/list-controls";

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

/** Parse a "HH:MM" (24-hour) string to minutes since midnight, or null if malformed. */
function parseTimeToMins(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** "17:00" → "5:00 PM". Returns the raw value if it can't be parsed. */
function formatTime12(value: string): string {
  const mins = parseTimeToMins(value);
  if (mins === null) return value || "—";
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
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
  subDepartments,
  hideBackLink = false,
  showSubDepartment = true,
  canEditPolicies = true,
  showMailboxSla = true,
}: {
  departmentId: string;
  departmentName: string;
  subDepartments?: SubDepartmentOption[];
  /** Hide the "Back to departments" link when embedded (e.g. behind a picker). */
  hideBackLink?: boolean;
  /**
   * When false, this is the department-wide SLA surface: the sub-department
   * column/field is hidden and only department-level policies (no
   * `subDepartmentId`) are shown and created. Sub-department-scoped policies are
   * managed on the department's own settings page instead.
   */
  showSubDepartment?: boolean;
  /**
   * False for department managers: they may only set the shared-mailbox SLA;
   * form policies and working hours are shown read-only.
   */
  canEditPolicies?: boolean;
  /** Shared mailbox configuration belongs only on department settings. */
  showMailboxSla?: boolean;
}) {
  const [policies, setPolicies] = useState<SlaPolicy[] | null>(null);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [slaConfig, setSlaConfig] = useState<SlaConfig | null>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHours | null>(null);
  // Snapshot of the last-saved settings, used to detect unsaved changes.
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPolicyFor, setNewPolicyFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Department-wide mode never surfaces sub-departments.
  const subDeptList = showSubDepartment ? subDepartments ?? [] : [];

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/departments/${departmentId}/sla-settings`)
      .then(jsonOrThrow)
      .then((settingsRes) => {
        if (cancelled) return;
        setSlaConfig(settingsRes.slaConfig);
        setBusinessHours(settingsRes.businessHours);
        setSavedSnapshot(
          JSON.stringify({ slaConfig: settingsRes.slaConfig, businessHours: settingsRes.businessHours }),
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/departments/${departmentId}/sla-policies`).then(jsonOrThrow),
      fetch(`/api/departments/${departmentId}/forms`).then(jsonOrThrow),
    ])
      .then(([policiesRes, formsRes]) => {
        if (cancelled) return;
        setPolicies(policiesRes);
        setForms(formsRes);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

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
    const startMins = parseTimeToMins(businessHours.workStartTime);
    const endMins = parseTimeToMins(businessHours.workEndTime);
    if (startMins === null || endMins === null || endMins <= startMins) {
      setError("Fix the working-hours start and end times before saving.");
      return;
    }
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
      setSavedSnapshot(JSON.stringify({ slaConfig, businessHours }));
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

  // Working-hours start/end validation + derived day length (for the summary line).
  const startMins = businessHours ? parseTimeToMins(businessHours.workStartTime) : null;
  const endMins = businessHours ? parseTimeToMins(businessHours.workEndTime) : null;
  const hoursError =
    !businessHours
      ? null
      : startMins === null || endMins === null
        ? "Enter both times as HH:MM."
        : endMins <= startMins
          ? "End time must be after the start time."
          : null;
  const workdayMins =
    startMins !== null && endMins !== null && endMins > startMins ? endMins - startMins : null;

  // Only enable the save button once the user has changed something.
  const isDirty =
    savedSnapshot !== null && JSON.stringify({ slaConfig, businessHours }) !== savedSnapshot;
  useUnsavedChangesGuard(isDirty);
  const tenantHref = useTenantHref();

  // In department-wide mode only department-level policies (no sub-department)
  // are managed here; sub-department-scoped ones live on the sub-department page.
  const visiblePolicies =
    policies === null
      ? null
      : showSubDepartment
        ? policies
        : policies.filter((p) => !p.subDepartmentId);

  // Display-only search/sort — when several policies match a ticket the strictest target wins,
  // so list order has no effect on which policy applies.
  const policyList = useListControls(visiblePolicies ?? [], {
    searchText: (p) =>
      [
        p.name,
        p.priority ?? "",
        subDeptList.find((s) => s.id === p.subDepartmentId)?.name ?? "",
        forms.find((f) => f.id === p.formConfigId)?.name ?? "",
        p.enabled ? "enabled active" : "disabled",
      ].join(" "),
    sortOptions: [
      { id: "default", label: "Default order", compare: (a, b) => a.order - b.order },
      { id: "name", label: "Name A–Z", compare: byText((p: SlaPolicy) => p.name) },
      { id: "priority", label: "Highest priority", compare: (a, b) => priorityRank(b.priority) - priorityRank(a.priority) },
      { id: "first-response", label: "Fastest first response", compare: (a, b) => a.firstResponseMins - b.firstResponseMins },
      { id: "resolution", label: "Fastest resolution", compare: (a, b) => a.resolutionMins - b.resolutionMins },
    ],
  });
  const filteringPolicies = policyList.isFiltering;

  const policiesByForm = new Map<string, SlaPolicy[]>();
  const noFormPolicies: SlaPolicy[] = [];
  // Policies authored against a support form that has since been deleted. No
  // ticket can match them, so they're surfaced separately for clean-up rather
  // than mislabelled as department-level SLA.
  const deletedFormPolicies: SlaPolicy[] = [];
  for (const p of visiblePolicies === null ? [] : policyList.visible) {
    if (!p.formConfigId) {
      noFormPolicies.push(p);
    } else if (forms.some((f) => f.id === p.formConfigId)) {
      const arr = policiesByForm.get(p.formConfigId) ?? [];
      arr.push(p);
      policiesByForm.set(p.formConfigId, arr);
    } else {
      deletedFormPolicies.push(p);
    }
  }

  return (
    <div className="w-full px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      {!hideBackLink && (
        <Link
          href={tenantHref("/settings/departments")}
          className="mb-4 inline-flex items-center gap-1.5 font-sans text-[12.5px] text-sts-muted hover:text-sts-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to departments
        </Link>
      )}

      <h1 className="sts-text-modal-title mb-1">SLA policies — {departmentName}</h1>
      <p className="mb-6 font-sans text-[12.5px] text-sts-muted">
        {showSubDepartment
          ? "Policies are configured at the department level; sub-departments inherit them unless they have their own. First-response and resolution targets are matched against submitted form values. When several policies match, the strictest target on each metric wins."
          : "Department-wide SLA policies. A ticket uses its sub-department's own policies when it has any; otherwise these department-level targets apply. First-response and resolution targets are matched against submitted form values. When several policies match, the strictest target on each metric wins."}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-[12.5px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {showMailboxSla && <MailboxSlaCard departmentId={departmentId} />}

      <div className="mb-8">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Policies</h2>
          {visiblePolicies !== null && (
            <p className="mt-0.5 font-sans text-[11px] text-sts-subtle">
              {visiblePolicies.length} {visiblePolicies.length === 1 ? "policy" : "policies"} ·{" "}
              {visiblePolicies.filter((p) => p.enabled).length} active
              {showSubDepartment ? " · grouped by support form" : ""}
            </p>
          )}
        </div>
        {visiblePolicies !== null && visiblePolicies.length > 0 && (
          <div className="flex items-center gap-2">
            <ListSearchInput value={policyList.query} onChange={policyList.setQuery} placeholder="Search policies…" />
            <SortDropdown value={policyList.sortKey} onChange={policyList.setSortKey} options={policyList.sortDropdownOptions} />
          </div>
        )}
        </div>

        {visiblePolicies === null ? (
          <SkeletonRows count={3} height="h-44" />
        ) : filteringPolicies && policyList.visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-sts-card-border px-3 py-8 text-center font-sans text-[12.5px] text-sts-muted">
            No policies match &ldquo;{policyList.query.trim()}&rdquo;
          </p>
        ) : !showSubDepartment ? (
          // Department-wide: one flat list of the department's SLA policies —
          // not split by support form. Each policy is created directly under the
          // department and applies to its forms via the SLA tier fallback.
          <PolicyGroup
            title={`${departmentName} SLA policies`}
            policies={visiblePolicies}
            subDepartments={subDeptList}
            showSubDepartment={showSubDepartment}
            onNewPolicy={() => setNewPolicyFor("")}
            onSave={savePolicy}
            onDelete={deletePolicy}
            emptyHint="No SLA policies yet. Add one to set first-response and resolution targets for this department."
            readOnly={!canEditPolicies}
          />
        ) : forms.length === 0 && noFormPolicies.length === 0 && deletedFormPolicies.length === 0 ? (
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
            {forms.filter((form) => !filteringPolicies || policiesByForm.has(form.id)).map((form) => (
              <PolicyGroup
                key={form.id}
                title={form.name}
                policies={policiesByForm.get(form.id) ?? []}
                subDepartments={subDeptList}
                showSubDepartment={showSubDepartment}
                onNewPolicy={() => setNewPolicyFor(form.id)}
                onSave={savePolicy}
                onDelete={deletePolicy}
                emptyHint="No SLA policies for this form yet."
                readOnly={!canEditPolicies}
              />
            ))}

            {noFormPolicies.length > 0 && (
              <PolicyGroup
                title="Department SLA"
                policies={noFormPolicies}
                subDepartments={subDeptList}
                showSubDepartment={false}
                onNewPolicy={() => setNewPolicyFor("")}
                onSave={savePolicy}
                onDelete={deletePolicy}
                emptyHint=""
                readOnly
              />
            )}

            {deletedFormPolicies.length > 0 && (
              <PolicyGroup
                title="Deleted support form — no longer applied"
                policies={deletedFormPolicies}
                subDepartments={subDeptList}
                showSubDepartment={showSubDepartment}
                onNewPolicy={() => {}}
                onSave={savePolicy}
                onDelete={deletePolicy}
                emptyHint=""
                hideNewPolicy
                readOnly={!canEditPolicies}
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
          <fieldset disabled={!canEditPolicies} className="flex min-w-0 flex-col gap-4">
            {!canEditPolicies && (
              <p className="font-sans text-[11.5px] text-sts-muted">
                Only admins can change working hours.
              </p>
            )}
            <label className="flex w-fit cursor-pointer items-start gap-2.5 font-sans text-[12.5px] text-sts-foreground">
              <Switch
                className="mt-0.5"
                checked={slaConfig.pauseOutsideHours}
                onCheckedChange={(v) => setSlaConfig({ ...slaConfig, pauseOutsideHours: v })}
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">Only count SLA time during working hours</span>
                <span className="text-[11.5px] text-sts-muted">
                  {slaConfig.pauseOutsideHours
                    ? "On — timers pause overnight and on weekends. A ticket that arrives after hours doesn't start burning SLA until the next working period."
                    : "Off — timers run 24/7 on real elapsed time. SLA keeps counting overnight, on weekends, and on holidays even when no one is working."}
                </span>
              </span>
            </label>

            <label className="flex w-fit cursor-pointer items-start gap-2.5 font-sans text-[12.5px] text-sts-foreground">
              <Switch
                className="mt-0.5"
                checked={slaConfig.pauseWhenWaitingForCustomer}
                onCheckedChange={(v) =>
                  setSlaConfig({ ...slaConfig, pauseWhenWaitingForCustomer: v })
                }
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">Pause the resolution timer while waiting on the customer</span>
                <span className="text-[11.5px] text-sts-muted">
                  {slaConfig.pauseWhenWaitingForCustomer
                    ? "On — after your team replies, the resolution timer stops until the customer responds. Time spent waiting on them isn't counted against you."
                    : "Off — the resolution timer keeps running even while you're waiting for the customer to reply."}
                </span>
              </span>
            </label>

            <div className="h-px bg-sts-card-border/70" />

            <label className="flex items-center justify-between gap-3 font-sans text-[12.5px] text-sts-foreground">
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">At-risk threshold</span>
                <span className="text-[11.5px] text-sts-muted">
                  Flag a ticket as at-risk once it has used this share of its SLA budget.
                </span>
              </span>
              <span className="relative shrink-0">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={slaConfig.atRiskPct}
                  onChange={(e) => setSlaConfig({ ...slaConfig, atRiskPct: Number(e.target.value) })}
                  className="h-8 w-[4.5rem] rounded-md border border-sts-card-border bg-sts-surface pl-2.5 pr-6 font-sans text-[12px] text-sts-foreground outline-none focus:border-sts-blue/60"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-sans text-[11px] text-sts-subtle">
                  %
                </span>
              </span>
            </label>

            <div className="rounded-xl border border-sts-card-border p-4">
              <p className="font-sans text-[12px] font-semibold text-sts-foreground">
                Fallback business calendar
              </p>
              <p className="mt-0.5 font-sans text-[11.5px] text-sts-muted">
                Used when an assignee has no personal schedule.
              </p>

              <div className="mt-3.5 flex flex-wrap items-start gap-3">
                <div className="flex flex-col">
                  <span className="mb-1.5 font-sans text-[10.5px] font-semibold uppercase tracking-[0.5px] text-sts-subtle">
                    Timezone
                  </span>
                  <TimezoneSelect
                    value={businessHours.timezone}
                    onChange={(v) => setBusinessHours({ ...businessHours, timezone: v })}
                  />
                </div>
                <label className="flex flex-col">
                  <span className="mb-1.5 font-sans text-[10.5px] font-semibold uppercase tracking-[0.5px] text-sts-subtle">
                    Start
                  </span>
                  <input
                    type="time"
                    value={businessHours.workStartTime}
                    aria-invalid={hoursError !== null}
                    onChange={(e) => setBusinessHours({ ...businessHours, workStartTime: e.target.value })}
                    className={cn(
                      "h-8 w-28 rounded-md border bg-sts-surface px-2.5 font-sans text-[12px] text-sts-foreground outline-none",
                      hoursError ? "border-sts-red" : "border-sts-card-border focus:border-sts-blue/60",
                    )}
                  />
                </label>
                <label className="flex flex-col">
                  <span className="mb-1.5 font-sans text-[10.5px] font-semibold uppercase tracking-[0.5px] text-sts-subtle">
                    End
                  </span>
                  <input
                    type="time"
                    value={businessHours.workEndTime}
                    aria-invalid={hoursError !== null}
                    onChange={(e) => setBusinessHours({ ...businessHours, workEndTime: e.target.value })}
                    className={cn(
                      "h-8 w-28 rounded-md border bg-sts-surface px-2.5 font-sans text-[12px] text-sts-foreground outline-none",
                      hoursError ? "border-sts-red" : "border-sts-card-border focus:border-sts-blue/60",
                    )}
                  />
                </label>
              </div>

              <p
                className={cn(
                  "mt-2 font-sans text-[11.5px]",
                  hoursError ? "text-sts-red" : "text-sts-muted",
                )}
              >
                {hoursError ?? (
                  <>
                    {formatTime12(businessHours.workStartTime)} – {formatTime12(businessHours.workEndTime)}
                    <span className="mx-1.5 text-sts-subtle">·</span>
                    <span className="font-medium text-sts-foreground">{formatMins(workdayMins ?? 0)}</span> per
                    working day
                  </>
                )}
              </p>

              <div className="mt-4">
                <p className="mb-2 font-sans text-[10.5px] font-semibold uppercase tracking-[0.5px] text-sts-subtle">
                  Working days
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_LABELS.map((label, day) => {
                    const on = businessHours.workingDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleWorkingDay(day)}
                        className={cn(
                          "rounded-full px-2.5 py-1 font-sans text-[11px] font-medium transition-colors",
                          on
                            ? "bg-sts-blue text-sts-blue-fg"
                            : "border border-sts-card-border bg-sts-surface text-sts-muted hover:text-sts-foreground",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {canEditPolicies && (
              <div className="mt-1 flex justify-end border-t border-sts-card-border pt-4">
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={saving || hoursError !== null || !isDirty}
                  className="shrink-0 rounded-full bg-sts-blue px-4 py-1.5 font-sans text-[12px] font-medium text-sts-blue-fg transition-colors hover:bg-sts-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save working hours"}
                </button>
              </div>
            )}
          </fieldset>
        )}
      </div>

      {newPolicyFor !== null && (
        <NewPolicyModal
          departmentName={departmentName}
          creating={creating}
          forms={forms}
          subDepartments={subDeptList}
          showSubDepartment={showSubDepartment}
          initialFormConfigId={newPolicyFor}
          onCancel={() => setNewPolicyFor(null)}
          onCreate={createPolicy}
        />
      )}
    </div>
  );
}

type MailboxSla = {
  firstResponseMins: number | null; resolutionMins: number | null; canEdit: boolean; activeStatuses: string[]; availableStatuses: string[];
  mailboxes: { id: string; address: string; firstResponseMins: number | null; resolutionMins: number | null }[];
};

/**
 * Department-wide SLA for tickets created from the department's shared
 * mailboxes. Form policies never apply to those tickets, so this is their only
 * SLA. Editable by the department's managers as well as admins.
 */
function MailboxSlaCard({ departmentId }: { departmentId: string }) {
  const [saved, setSaved] = useState<MailboxSla | null>(null);
  const [activeStatuses, setActiveStatuses] = useState<string[]>(["In Progress"]);
  const [draft, setDraft] = useState<{ firstResponseMins: number | ""; resolutionMins: number | "" }>({
    firstResponseMins: "",
    resolutionMins: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/departments/${departmentId}/mailbox-sla`)
      .then(jsonOrThrow)
      .then((res: MailboxSla) => {
        if (cancelled) return;
        setSaved(res);
        setActiveStatuses(res.activeStatuses);
        setDraft({ firstResponseMins: res.firstResponseMins ?? "", resolutionMins: res.resolutionMins ?? "" });
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  const dirty =
    saved !== null &&
    (JSON.stringify([...activeStatuses].sort()) !== JSON.stringify([...saved.activeStatuses].sort()) || draft.firstResponseMins !== (saved.firstResponseMins ?? "") ||
      draft.resolutionMins !== (saved.resolutionMins ?? ""));
  useUnsavedChangesGuard(dirty);

  const bothSet = Number(draft.firstResponseMins) > 0 && Number(draft.resolutionMins) > 0;
  const bothEmpty = draft.firstResponseMins === "" && draft.resolutionMins === "";
  const valid = (bothSet || bothEmpty) && activeStatuses.length > 0 && activeStatuses.every((status) => saved?.availableStatuses.includes(status));
  const enabled = saved?.firstResponseMins != null && saved?.resolutionMins != null;
  const readOnly = saved !== null && !saved.canEdit;

  async function save(next: { firstResponseMins: number | null; resolutionMins: number | null }) {
    setSaving(true);
    setError(null);
    try {
      const res: MailboxSla = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/mailbox-sla`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...next, activeStatuses }),
        }),
      );
      setSaved(res);
      setActiveStatuses(res.activeStatuses);
      setDraft({ firstResponseMins: res.firstResponseMins ?? "", resolutionMins: res.resolutionMins ?? "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save mailbox SLA");
    } finally {
      setSaving(false);
    }
  }

  const numCls =
    "h-8 w-24 rounded-md border border-sts-card-border bg-sts-surface px-2.5 font-sans text-[12px] text-sts-foreground outline-none focus:border-sts-blue/60 focus:ring-2 focus:ring-sts-blue/15 read-only:cursor-default read-only:focus:ring-0";

  return (
    <div className="mb-8 rounded-2xl border border-sts-card-border bg-sts-card p-5">
      <div className="mb-1 flex items-center gap-1.5">
        <Mail className="size-3.5 shrink-0 text-sts-subtle" />
        <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Shared mailbox SLA</h2>
        {saved !== null && (
          <span
            className={cn(
              "ml-1 rounded-full px-2 py-0.5 font-sans text-[10.5px] font-medium",
              enabled ? "bg-sts-blue/10 text-sts-blue" : "bg-sts-surface text-sts-subtle",
            )}
          >
            {enabled ? "Department defaults" : "Department targets off"}
          </span>
        )}
      </div>
      <p className="mb-4 font-sans text-[11.5px] text-sts-muted">
        Each mailbox can override these department targets. Shared mailbox SLA is configured only within the department.
        When neither has targets, no shared mailbox SLA applies.
        Changes affect new tickets only. Mailbox clocks always count configured working hours and pause while waiting for the customer.
      </p>

      {error && (
        <p className="mb-3 font-sans text-[11.5px] text-sts-red">{error}</p>
      )}

      {saved === null ? (
        <SkeletonRows count={1} height="h-10" />
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col">
            <span className="mb-1.5 font-sans text-[10.5px] font-semibold uppercase tracking-[0.5px] text-sts-subtle">
              Time to first response (mins)
            </span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                placeholder="e.g. 60"
                value={draft.firstResponseMins}
                readOnly={readOnly}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, firstResponseMins: e.target.value === "" ? "" : Number(e.target.value) }))
                }
                className={numCls}
              />
              {draft.firstResponseMins !== "" && (
                <span className="whitespace-nowrap font-sans text-[10.5px] text-sts-subtle">
                  {formatMins(draft.firstResponseMins)}
                </span>
              )}
            </span>
          </label>
          <label className="flex flex-col">
            <span className="mb-1.5 font-sans text-[10.5px] font-semibold uppercase tracking-[0.5px] text-sts-subtle">
              Time to resolution (mins)
            </span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                placeholder="e.g. 480"
                value={draft.resolutionMins}
                readOnly={readOnly}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, resolutionMins: e.target.value === "" ? "" : Number(e.target.value) }))
                }
                className={numCls}
              />
              {draft.resolutionMins !== "" && (
                <span className="whitespace-nowrap font-sans text-[10.5px] text-sts-subtle">
                  {formatMins(draft.resolutionMins)}
                </span>
              )}
            </span>
          </label>

          {!readOnly && (
            <div className="ml-auto flex items-center gap-2">
              {enabled && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save({ firstResponseMins: null, resolutionMins: null })}
                  className="rounded-full border border-sts-card-border px-3.5 py-1.5 font-sans text-[12px] font-medium text-sts-muted transition-colors hover:text-sts-foreground disabled:opacity-60"
                >
                  Turn off department targets
                </button>
              )}
              <button
                type="button"
                disabled={saving || !dirty || !valid}
                onClick={() =>
                  save(
                    bothEmpty
                      ? { firstResponseMins: null, resolutionMins: null }
                      : {
                          firstResponseMins: Number(draft.firstResponseMins),
                          resolutionMins: Number(draft.resolutionMins),
                        },
                  )
                }
                className="rounded-full bg-sts-blue px-4 py-1.5 font-sans text-[12px] font-medium text-sts-blue-fg transition-colors hover:bg-sts-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save mailbox SLA"}
              </button>
            </div>
          )}
        </div>
      )}
      {!valid && (
        <p className="mt-2 font-sans text-[11.5px] text-sts-red">
          Set both targets (greater than 0), or clear both. Select at least one current active status.
        </p>
      )}
      {saved && (
        <div className="mt-5 space-y-4 border-t border-sts-card-border pt-4">
          <div className="flex flex-col gap-1.5 font-sans text-[11.5px] text-sts-muted">
            <span id={`mailbox-active-statuses-${departmentId}`}>Active statuses that stop first response</span>
            <Select multiple value={activeStatuses} onValueChange={setActiveStatuses} disabled={readOnly}>
              <SelectTrigger aria-labelledby={`mailbox-active-statuses-${departmentId}`} className="w-full font-sans text-[12px]">
                <SelectValue>{activeStatuses.length ? activeStatuses.join(", ") : "Select active statuses"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...saved.availableStatuses, ...activeStatuses])].map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}{saved.availableStatuses.includes(status) ? "" : " (no longer available)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p>Select one or more statuses from this department&apos;s workflows.</p>
          </div>
          {saved.mailboxes.map((mailbox) => (
            <MailboxTargetRow key={mailbox.id} mailbox={mailbox} departmentId={departmentId} canEdit={saved.canEdit}
              onSaved={(updated) => setSaved(updated)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PolicyGroup({
  title,
  policies,
  subDepartments,
  showSubDepartment,
  onNewPolicy,
  onSave,
  onDelete,
  emptyHint,
  readOnly = false,
  hideNewPolicy = false,
}: {
  title: string;
  policies: SlaPolicy[];
  subDepartments: SubDepartmentOption[];
  showSubDepartment: boolean;
  onNewPolicy: () => void;
  onSave: (id: string, patch: Partial<SlaPolicy>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  emptyHint: string;
  readOnly?: boolean;
  /** Hide "New policy" while keeping rows editable/deletable. */
  hideNewPolicy?: boolean;
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
        {!readOnly && !hideNewPolicy && (
          <button
            type="button"
            onClick={onNewPolicy}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sts-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90"
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
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="border-b border-sts-card-border text-left font-sans text-[10.5px] font-medium uppercase tracking-wide text-sts-subtle">
                <th className="px-2 py-2 font-medium">Issue</th>
                {showSubDepartment && <th className="px-2 py-2 font-medium">Sub-department</th>}
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
                  showSubDepartment={showSubDepartment}
                  onSave={onSave}
                  onDelete={onDelete}
                  readOnly={readOnly}
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
  showSubDepartment,
  onSave,
  onDelete,
  readOnly = false,
}: {
  policy: SlaPolicy;
  subDepartments: SubDepartmentOption[];
  showSubDepartment: boolean;
  onSave: (id: string, patch: Partial<SlaPolicy>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState<{
    name: string;
    priority: Priority | null;
    firstResponseMins: number | "";
    resolutionMins: number | "";
    subDepartmentId: string | null;
  }>({
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
  useUnsavedChangesGuard(dirty);

  // Sub-department is required whenever the department has sub-departments to
  // pick from (mirrors the create path).
  const subDepartmentRequired = showSubDepartment && subDepartments.length > 0;
  const canSave =
    dirty &&
    !saving &&
    draft.name.trim().length > 0 &&
    Number(draft.firstResponseMins) > 0 &&
    Number(draft.resolutionMins) > 0 &&
    (!subDepartmentRequired || Boolean(draft.subDepartmentId));

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const patch: Partial<SlaPolicy> = {
        name: draft.name.trim(),
        priority: draft.priority,
        firstResponseMins: Number(draft.firstResponseMins),
        resolutionMins: Number(draft.resolutionMins),
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
          readOnly={readOnly}
          className={cn(
            "w-full min-w-[140px] rounded-md border border-sts-card-border bg-sts-surface px-2 py-1 font-sans text-[12.5px] font-medium text-sts-foreground outline-none focus:border-sts-blue/60 focus:ring-2 focus:ring-sts-blue/15",
            readOnly && "cursor-default focus:border-sts-card-border focus:ring-0",
          )}
        />
      </td>
      {showSubDepartment && (
        <td className={cell}>
          {subDepartments.length > 0 ? (
            <div className="w-[150px]">
              <SearchableSelect
                value={draft.subDepartmentId ?? ""}
                onChange={(v) => set("subDepartmentId", v || null)}
                options={subDepartments.map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Select a sub-department"
                searchable={false}
                size="sm"
                aria-label="Sub-department concerned"
              />
            </div>
          ) : (
            <span className="font-sans text-[11.5px] text-sts-subtle">—</span>
          )}
        </td>
      )}
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
            disabled={readOnly}
            aria-label="Priority goal"
          />
        </div>
      </td>
      <td className={cell}>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            placeholder="e.g. 60"
            value={draft.firstResponseMins}
            onChange={(e) => set("firstResponseMins", e.target.value === "" ? "" : Number(e.target.value))}
            readOnly={readOnly}
            className={cn(numCls, readOnly && "cursor-default focus:border-sts-card-border focus:ring-0")}
          />
          {draft.firstResponseMins !== "" && (
            <span className="whitespace-nowrap font-sans text-[10.5px] text-sts-subtle">{formatMins(draft.firstResponseMins)}</span>
          )}
        </div>
      </td>
      <td className={cell}>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            placeholder="e.g. 480"
            value={draft.resolutionMins}
            onChange={(e) => set("resolutionMins", e.target.value === "" ? "" : Number(e.target.value))}
            readOnly={readOnly}
            className={cn(numCls, readOnly && "cursor-default focus:border-sts-card-border focus:ring-0")}
          />
          {draft.resolutionMins !== "" && (
            <span className="whitespace-nowrap font-sans text-[10.5px] text-sts-subtle">{formatMins(draft.resolutionMins)}</span>
          )}
        </div>
      </td>
      <td className={cell}>
        {!readOnly && (
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
              title="Delete SLA policy"
              description={`Delete "${policy.name}"? Tickets it matches will no longer get its SLA targets. This can't be undone.`}
              confirmLabel="Delete"
              successMessage="Policy deleted"
              onConfirm={() => onDelete(policy.id)}
            />
          </div>
        )}
      </td>
    </tr>
  );
}

function NewPolicyModal({
  departmentName,
  creating,
  forms,
  subDepartments,
  showSubDepartment,
  initialFormConfigId,
  onCancel,
  onCreate,
}: {
  departmentName: string;
  creating: boolean;
  forms: FormOption[];
  subDepartments: SubDepartmentOption[];
  showSubDepartment: boolean;
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
  const [firstResponseMins, setFirstResponseMins] = useState<number | "">("");
  const [resolutionMins, setResolutionMins] = useState<number | "">("");
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
      firstResponseMins: Number(firstResponseMins),
      resolutionMins: Number(resolutionMins),
      formConfigId: formConfigId || null,
      priority: priority || null,
      subDepartmentId: subDepartmentId || null,
    });

  const formName = forms.find((f) => f.id === formConfigId)?.name ?? null;
  // Sub-department is required whenever the department has sub-departments to pick
  // from. Departments with none fall back to department-level policies.
  const subDepartmentRequired = showSubDepartment && subDepartments.length > 0;
  const canSubmit =
    name.trim().length > 0 &&
    Number(firstResponseMins) > 0 &&
    Number(resolutionMins) > 0 &&
    (!subDepartmentRequired || subDepartmentId.length > 0) &&
    !creating;

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

          {showSubDepartment && subDepartments.length > 0 && (
            <div className="space-y-1.5">
              <label className="sts-text-label">Sub-department concerned</label>
              <SearchableSelect
                value={subDepartmentId}
                onChange={(v) => setSubDepartmentId(v ?? "")}
                options={subDepartments.map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Select a sub-department"
                searchable={false}
                size="md"
                aria-label="Sub-department concerned"
              />
              <p className="font-sans text-[11px] text-sts-subtle">
                Tickets for this issue land in the selected sub-department.
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
                placeholder="e.g. 60"
                value={firstResponseMins}
                onChange={(e) => setFirstResponseMins(e.target.value === "" ? "" : Number(e.target.value))}
                className={fieldCls}
              />
              {firstResponseMins !== "" && (
                <p className="font-sans text-[11px] text-sts-subtle">{formatMins(firstResponseMins)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="sts-text-label flex items-center gap-1.5">
                <Clock className="size-3" /> Time to resolution (mins)
              </label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 480"
                value={resolutionMins}
                onChange={(e) => setResolutionMins(e.target.value === "" ? "" : Number(e.target.value))}
                className={fieldCls}
              />
              {resolutionMins !== "" && (
                <p className="font-sans text-[11px] text-sts-subtle">{formatMins(resolutionMins)}</p>
              )}
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


function MailboxTargetRow({ mailbox, departmentId, canEdit, onSaved }: {
  mailbox: MailboxSla["mailboxes"][number]; departmentId: string; canEdit: boolean; onSaved: (saved: MailboxSla) => void;
}) {
  const [first, setFirst] = useState(mailbox.firstResponseMins?.toString() ?? "");
  const [resolution, setResolution] = useState(mailbox.resolutionMins?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = first !== (mailbox.firstResponseMins?.toString() ?? "") || resolution !== (mailbox.resolutionMins?.toString() ?? "");
  useUnsavedChangesGuard(dirty);
  async function save() {
    setSaving(true); setError(null);
    try {
      const updated = await jsonOrThrow(await fetch(`/api/departments/${departmentId}/mailbox-sla`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailboxConnectionId: mailbox.id, firstResponseMins: first === "" ? null : Number(first), resolutionMins: resolution === "" ? null : Number(resolution) }),
      }));
      onSaved(updated);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save mailbox targets"); }
    finally { setSaving(false); }
  }
  return (
    <div className="space-y-2 font-sans text-[11.5px]">
      <p className="font-medium text-sts-foreground">{mailbox.address}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sts-muted">First response (mins)
          <input type="number" min={1} value={first} readOnly={!canEdit} placeholder="Inherit" onChange={(event) => setFirst(event.target.value)} className="h-8 w-28 rounded-md border border-sts-card-border bg-sts-surface px-2 text-sts-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-sts-muted">Resolution (mins)
          <input type="number" min={1} value={resolution} readOnly={!canEdit} placeholder="Inherit" onChange={(event) => setResolution(event.target.value)} className="h-8 w-28 rounded-md border border-sts-card-border bg-sts-surface px-2 text-sts-foreground" />
        </label>
        {canEdit && <button onClick={save} disabled={saving || !dirty} className="rounded-full bg-sts-blue px-3 py-1.5 text-sts-blue-fg disabled:opacity-50">{saving ? "Saving…" : "Save targets"}</button>}
      </div>
      <p className="text-sts-subtle">Leave both empty to inherit department targets. If department targets are off, no SLA applies.</p>
      {error && <p className="text-sts-red">{error}</p>}
    </div>
  );
}
