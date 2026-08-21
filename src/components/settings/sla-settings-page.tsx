"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
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

  async function addPolicy() {
    setError(null);
    try {
      const created = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/sla-policies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New policy",
            conditions: { combinator: "AND", conditions: [] },
            firstResponseMins: 60,
            resolutionMins: 480,
            ...scopeBody,
          }),
        }),
      );
      setPolicies((prev) => [...(prev ?? []), created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create policy");
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
          <h2 className="font-sans text-[13.5px] font-semibold text-pen-foreground">Policies</h2>
          <button
            type="button"
            onClick={addPolicy}
            className="inline-flex items-center gap-1 rounded-md bg-pen-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-pen-blue/90"
          >
            <Plus className="size-3.5" /> Add policy
          </button>
        </div>

        {policies === null ? (
          <p className="font-sans text-[12.5px] text-pen-muted">Loading…</p>
        ) : policies.length === 0 ? (
          <p className="font-sans text-[12.5px] text-pen-muted">
            No SLA policies yet — tickets in this department won&apos;t have SLA timers until one is added.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {policies.map((policy) => (
              <div key={policy.id} className="rounded-lg border border-pen-card-border p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={policy.name}
                    onChange={(e) => updatePolicy(policy.id, { name: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-pen-card-border bg-pen-surface px-2 py-1 font-sans text-[12.5px] font-medium text-pen-foreground outline-none"
                  />
                  <label className="flex cursor-pointer items-center gap-2 font-sans text-[11.5px] text-pen-muted">
                    <Switch
                      checked={policy.enabled}
                      onCheckedChange={(v) => updatePolicy(policy.id, { enabled: v })}
                    />
                    Enabled
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
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1.5 font-sans text-[11.5px] text-pen-muted">
                    First response (mins)
                    <input
                      type="number"
                      min={1}
                      value={policy.firstResponseMins}
                      onChange={(e) => updatePolicy(policy.id, { firstResponseMins: Number(e.target.value) })}
                      className="w-20 rounded-md border border-pen-card-border bg-pen-surface px-2 py-1 font-sans text-[12px] text-pen-foreground outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 font-sans text-[11.5px] text-pen-muted">
                    Resolution (mins)
                    <input
                      type="number"
                      min={1}
                      value={policy.resolutionMins}
                      onChange={(e) => updatePolicy(policy.id, { resolutionMins: Number(e.target.value) })}
                      className="w-20 rounded-md border border-pen-card-border bg-pen-surface px-2 py-1 font-sans text-[12px] text-pen-foreground outline-none"
                    />
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
    </div>
  );
}
