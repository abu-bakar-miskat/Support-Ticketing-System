"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, X, Clock, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

type SlaPolicy = {
  id: string;
  name: string;
  conditions: { combinator: "AND" | "OR"; conditions: unknown[] };
  firstResponseMins: number;
  resolutionMins: number;
  enabled: boolean;
  order: number;
};

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
}: {
  departmentId: string;
  departmentName: string;
  /** When set, this surface manages ONLY the given sub-department's SLA. */
  subDepartmentId?: string;
  subDepartmentName?: string;
}) {
  const [policies, setPolicies] = useState<SlaPolicy[] | null>(null);
  const [slaConfig, setSlaConfig] = useState<SlaConfig | null>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHours | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showNewPolicy, setShowNewPolicy] = useState(false);
  const [creating, setCreating] = useState(false);

  // Scope every request to the sub-department when one is provided; otherwise
  // the endpoints operate on department-wide config (subDepartmentId = null).
  const scopeQs = subDepartmentId ? `?subDepartmentId=${encodeURIComponent(subDepartmentId)}` : "";
  const scopeBody = subDepartmentId ? { subDepartmentId } : {};

  const load = () => {
    Promise.all([
      fetch(`/api/departments/${departmentId}/sla-policies${scopeQs}`).then(jsonOrThrow),
      fetch(`/api/departments/${departmentId}/sla-settings${scopeQs}`).then(jsonOrThrow),
    ])
      .then(([policiesRes, settingsRes]) => {
        setPolicies(policiesRes);
        setSlaConfig(settingsRes.slaConfig);
        setBusinessHours(settingsRes.businessHours);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(load, [departmentId, subDepartmentId]);

  async function createPolicy(input: { name: string; firstResponseMins: number; resolutionMins: number }) {
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
            ...scopeBody,
          }),
        }),
      );
      setPolicies((prev) => [...(prev ?? []), created]);
      setShowNewPolicy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create policy");
    } finally {
      setCreating(false);
    }
  }

  async function updatePolicy(id: string, patch: Partial<SlaPolicy>) {
    setError(null);
    setPolicies((prev) => prev?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? null);
    try {
      await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/sla-policies/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update policy");
      load();
    }
  }

  async function deletePolicy(id: string) {
    setError(null);
    const prev = policies;
    setPolicies((p) => p?.filter((x) => x.id !== id) ?? null);
    try {
      await jsonOrThrow(await fetch(`/api/departments/${departmentId}/sla-policies/${id}`, { method: "DELETE" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete policy");
      setPolicies(prev ?? null);
    }
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
          body: JSON.stringify({ slaConfig, businessHours, ...scopeBody }),
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

  return (
    <div className="w-full px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <Link
        href="/settings/departments"
        className={cn(
          "mb-4 inline-flex items-center gap-1.5 font-sans text-[12.5px] text-pen-muted hover:text-pen-foreground",
          subDepartmentId && "hidden",
        )}
      >
        <ArrowLeft className="size-3.5" /> Back to departments
      </Link>

      <h1 className="pen-text-modal-title mb-1">
        SLA policies — {subDepartmentName ?? departmentName}
      </h1>
      <p className="mb-6 font-sans text-[12.5px] text-pen-muted">
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

      {/* ── Policies ── */}
      <div className="mb-8 rounded-2xl border border-pen-card-border bg-pen-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-sans text-[13.5px] font-semibold text-pen-foreground">Policies</h2>
            {policies !== null && policies.length > 0 && (
              <p className="mt-0.5 font-sans text-[11px] text-pen-subtle">
                {policies.length} {policies.length === 1 ? "policy" : "policies"} ·{" "}
                {policies.filter((p) => p.enabled).length} active
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowNewPolicy(true)}
            className="inline-flex items-center gap-1 rounded-md bg-pen-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-pen-blue/90"
          >
            <Plus className="size-3.5" /> New policy
          </button>
        </div>

        {policies === null ? (
          <p className="font-sans text-[12.5px] text-pen-muted">Loading…</p>
        ) : policies.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-pen-card-border py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-pen-blue/10">
              <Timer className="size-5 text-pen-blue" />
            </div>
            <div>
              <p className="font-sans text-[12.5px] font-medium text-pen-foreground">No SLA policies yet</p>
              <p className="mt-0.5 font-sans text-[11.5px] text-pen-muted">
                Tickets here won&apos;t have SLA timers until you add one.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewPolicy(true)}
              className="inline-flex items-center gap-1 rounded-md bg-pen-blue px-3 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-pen-blue/90"
            >
              <Plus className="size-3.5" /> New policy
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {policies.map((policy) => (
              <div
                key={policy.id}
                className={cn(
                  "rounded-lg border border-pen-card-border p-3 transition-opacity",
                  !policy.enabled && "opacity-60",
                )}
              >
                <div className="flex items-center gap-2">
                  <input
                    value={policy.name}
                    onChange={(e) => updatePolicy(policy.id, { name: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-sans text-[13px] font-semibold text-pen-foreground outline-none transition-colors hover:border-pen-card-border focus:border-pen-blue/60 focus:bg-pen-surface focus:ring-2 focus:ring-pen-blue/15"
                  />
                  <label className="flex cursor-pointer items-center gap-2 font-sans text-[11.5px] text-pen-muted">
                    <Switch
                      checked={policy.enabled}
                      onCheckedChange={(v) => updatePolicy(policy.id, { enabled: v })}
                    />
                    {policy.enabled ? "Enabled" : "Disabled"}
                  </label>
                  <button
                    type="button"
                    onClick={() => deletePolicy(policy.id)}
                    className="rounded-md p-1.5 text-pen-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                    title="Delete policy"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 rounded-md bg-pen-surface px-2.5 py-2">
                    <span className="flex items-center gap-1.5 font-sans text-[10.5px] font-medium uppercase tracking-wide text-pen-subtle">
                      <Timer className="size-3" /> First response
                    </span>
                    <span className="flex items-baseline gap-1.5">
                      <input
                        type="number"
                        min={1}
                        value={policy.firstResponseMins}
                        onChange={(e) => updatePolicy(policy.id, { firstResponseMins: Number(e.target.value) })}
                        className="w-20 rounded-md border border-pen-card-border bg-pen-card px-2 py-1 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue/60 focus:ring-2 focus:ring-pen-blue/15"
                      />
                      <span className="font-sans text-[11px] text-pen-muted">mins · {formatMins(policy.firstResponseMins)}</span>
                    </span>
                  </label>
                  <label className="flex flex-col gap-1 rounded-md bg-pen-surface px-2.5 py-2">
                    <span className="flex items-center gap-1.5 font-sans text-[10.5px] font-medium uppercase tracking-wide text-pen-subtle">
                      <Clock className="size-3" /> Resolution
                    </span>
                    <span className="flex items-baseline gap-1.5">
                      <input
                        type="number"
                        min={1}
                        value={policy.resolutionMins}
                        onChange={(e) => updatePolicy(policy.id, { resolutionMins: Number(e.target.value) })}
                        className="w-20 rounded-md border border-pen-card-border bg-pen-card px-2 py-1 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue/60 focus:ring-2 focus:ring-pen-blue/15"
                      />
                      <span className="font-sans text-[11px] text-pen-muted">mins · {formatMins(policy.resolutionMins)}</span>
                    </span>
                  </label>
                </div>
                <p className="mt-2 font-sans text-[11px] text-pen-subtle">
                  {policy.conditions.conditions.length === 0
                    ? "Applies to every ticket in this department (no conditions)."
                    : `${policy.conditions.conditions.length} condition(s) — edit via the API for now.`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Working-hours settings ── */}
      <div className="rounded-2xl border border-pen-card-border bg-pen-card p-5">
        <h2 className="mb-3 font-sans text-[13.5px] font-semibold text-pen-foreground">Working hours (SLA-04)</h2>
        {!slaConfig || !businessHours ? (
          <p className="font-sans text-[12.5px] text-pen-muted">Loading…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex w-fit cursor-pointer items-center gap-2 font-sans text-[12.5px] text-pen-foreground">
              <Switch
                checked={slaConfig.pauseOutsideHours}
                onCheckedChange={(v) => setSlaConfig({ ...slaConfig, pauseOutsideHours: v })}
              />
              Pause SLA timers outside working hours
            </label>

            <label className="flex items-center gap-2 font-sans text-[12.5px] text-pen-foreground">
              At-risk threshold (%)
              <input
                type="number"
                min={1}
                max={100}
                value={slaConfig.atRiskPct}
                onChange={(e) => setSlaConfig({ ...slaConfig, atRiskPct: Number(e.target.value) })}
                className="w-20 rounded-md border border-pen-card-border bg-pen-surface px-2 py-1 font-sans text-[12px] text-pen-foreground outline-none"
              />
            </label>

            <div>
              <p className="mb-1.5 font-sans text-[11.5px] font-medium text-pen-muted">
                Fallback business calendar (used when an assignee has no personal schedule)
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 font-sans text-[11.5px] text-pen-muted">
                  Timezone
                  <input
                    value={businessHours.timezone}
                    onChange={(e) => setBusinessHours({ ...businessHours, timezone: e.target.value })}
                    className="w-40 rounded-md border border-pen-card-border bg-pen-surface px-2 py-1 font-sans text-[12px] text-pen-foreground outline-none"
                  />
                </label>
                <label className="flex items-center gap-1.5 font-sans text-[11.5px] text-pen-muted">
                  Start
                  <input
                    value={businessHours.workStartTime}
                    onChange={(e) => setBusinessHours({ ...businessHours, workStartTime: e.target.value })}
                    className="w-20 rounded-md border border-pen-card-border bg-pen-surface px-2 py-1 font-sans text-[12px] text-pen-foreground outline-none"
                  />
                </label>
                <label className="flex items-center gap-1.5 font-sans text-[11.5px] text-pen-muted">
                  End
                  <input
                    value={businessHours.workEndTime}
                    onChange={(e) => setBusinessHours({ ...businessHours, workEndTime: e.target.value })}
                    className="w-20 rounded-md border border-pen-card-border bg-pen-surface px-2 py-1 font-sans text-[12px] text-pen-foreground outline-none"
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
                        ? "bg-pen-blue text-white"
                        : "bg-pen-surface text-pen-muted",
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
              className="w-fit rounded-md bg-pen-blue px-3 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-pen-blue/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save working-hours settings"}
            </button>
          </div>
        )}
      </div>

      {showNewPolicy && (
        <NewPolicyModal
          scopeName={subDepartmentName ?? departmentName}
          creating={creating}
          onCancel={() => setShowNewPolicy(false)}
          onCreate={createPolicy}
        />
      )}
    </div>
  );
}

// ── New-policy modal ─────────────────────────────────────────────────────────
function NewPolicyModal({
  scopeName,
  creating,
  onCancel,
  onCreate,
}: {
  scopeName: string;
  creating: boolean;
  onCancel: () => void;
  onCreate: (input: { name: string; firstResponseMins: number; resolutionMins: number }) => void;
}) {
  const [name, setName] = useState("");
  const [firstResponseMins, setFirstResponseMins] = useState(60);
  const [resolutionMins, setResolutionMins] = useState(480);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const canSubmit = name.trim().length > 0 && firstResponseMins > 0 && resolutionMins > 0 && !creating;

  const fieldCls =
    "h-9 w-full rounded-[6px] border border-pen-card-border bg-pen-bg px-2.5 font-sans text-[13px] text-pen-foreground outline-none focus:border-pen-blue focus:ring-1 focus:ring-pen-blue/30";

  return (
    <div className="pen-overlay-backdrop fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onCancel}>
      <div
        className="pen-glass-panel pen-modal-enter flex w-full max-w-md flex-col overflow-hidden rounded-[14px] ring-1 ring-white/35 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-pen-card-border px-[22px]">
          <h2 className="pen-text-modal-title">New SLA policy</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={creating}
            className="flex size-7 items-center justify-center rounded-md text-pen-muted hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-50"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-[22px] py-5">
          <p className="font-sans text-[11.5px] text-pen-muted">
            Applies to every ticket in <span className="font-medium text-pen-foreground">{scopeName}</span>. You can add
            matching conditions later.
          </p>

          <div className="space-y-1.5">
            <label className="pen-text-label">Policy name</label>
            <input
              autoFocus
              placeholder="e.g. Priority response"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) onCreate({ name: name.trim(), firstResponseMins, resolutionMins }); }}
              className={fieldCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="pen-text-label flex items-center gap-1.5">
                <Timer className="size-3" /> First response (mins)
              </label>
              <input
                type="number"
                min={1}
                value={firstResponseMins}
                onChange={(e) => setFirstResponseMins(Number(e.target.value))}
                className={fieldCls}
              />
              <p className="font-sans text-[11px] text-pen-subtle">{formatMins(firstResponseMins)}</p>
            </div>
            <div className="space-y-1.5">
              <label className="pen-text-label flex items-center gap-1.5">
                <Clock className="size-3" /> Resolution (mins)
              </label>
              <input
                type="number"
                min={1}
                value={resolutionMins}
                onChange={(e) => setResolutionMins(Number(e.target.value))}
                className={fieldCls}
              />
              <p className="font-sans text-[11px] text-pen-subtle">{formatMins(resolutionMins)}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex h-14 shrink-0 items-center justify-end gap-2.5 border-t border-pen-card-border bg-pen-bg px-[22px]">
          <button
            type="button"
            onClick={onCancel}
            disabled={creating}
            className="flex h-8 w-[78px] items-center justify-center rounded-[6px] border border-pen-card-border font-sans text-[12px] font-semibold text-pen-foreground transition-colors hover:bg-pen-card-border disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onCreate({ name: name.trim(), firstResponseMins, resolutionMins })}
            disabled={!canSubmit}
            className="flex h-8 items-center gap-1.5 rounded-[6px] bg-pen-blue px-3 font-sans text-[12px] font-medium text-white dark:text-gray-900 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create policy"}
          </button>
        </div>
      </div>
    </div>
  );
}
