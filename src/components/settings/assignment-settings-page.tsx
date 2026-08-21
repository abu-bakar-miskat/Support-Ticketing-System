"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type AssignmentMethod = "RULE_BASED" | "ROUND_ROBIN" | "WORKLOAD_BASED" | "MANUAL";

type AssignmentRule = {
  id: string;
  name: string;
  conditions: { combinator: "AND" | "OR"; conditions: unknown[] };
  agentId: string;
  enabled: boolean;
  order: number;
};

const METHODS: { value: AssignmentMethod; label: string; description: string }[] = [
  { value: "RULE_BASED", label: "Rule-based", description: "Conditions decide which specific agent gets each ticket." },
  { value: "ROUND_ROBIN", label: "Round-robin", description: "Strict rotation through the team, in order." },
  { value: "WORKLOAD_BASED", label: "Workload-based", description: "Always goes to whoever has the fewest open tickets." },
  { value: "MANUAL", label: "Manual", description: "Tickets are created unassigned; a human picks the agent." },
];

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function AssignmentSettingsPage({
  departmentId,
  departmentName,
  subDepartmentId,
  subDepartmentName,
  backHref = "/settings/departments",
  backLabel = "Back to departments",
}: {
  departmentId: string;
  departmentName: string;
  /** When set, the page edits this sub-department's override instead of the department. */
  subDepartmentId?: string;
  subDepartmentName?: string;
  backHref?: string;
  backLabel?: string;
}) {
  // `undefined` = still loading; `null` = "inherit from parent" (sub-dept only).
  const [method, setMethod] = useState<AssignmentMethod | null | undefined>(undefined);
  const [parentMethod, setParentMethod] = useState<AssignmentMethod | null>(null);
  const [rules, setRules] = useState<AssignmentRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const scopeQs = subDepartmentId
    ? `?subDepartmentId=${encodeURIComponent(subDepartmentId)}`
    : "";
  const scopeName = subDepartmentName ?? departmentName;

  const load = () => {
    Promise.all([
      fetch(`/api/departments/${departmentId}/assignment-settings${scopeQs}`).then(jsonOrThrow),
      fetch(`/api/departments/${departmentId}/assignment-rules${scopeQs}`).then(jsonOrThrow),
    ])
      .then(([settingsRes, rulesRes]) => {
        setMethod(settingsRes.assignmentMethod ?? null);
        setParentMethod(settingsRes.parentMethod ?? null);
        setRules(rulesRes);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(load, [departmentId, subDepartmentId]);

  async function changeMethod(next: AssignmentMethod | null) {
    setError(null);
    const prev = method;
    setMethod(next);
    setSaving(true);
    try {
      await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/assignment-settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            subDepartmentId
              ? { assignmentMethod: next, subDepartmentId }
              : { assignmentMethod: next },
          ),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update assignment method");
      setMethod(prev);
    } finally {
      setSaving(false);
    }
  }

  async function addRule() {
    setError(null);
    try {
      const created = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/assignment-rules${scopeQs}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New rule",
            conditions: { combinator: "AND", conditions: [] },
            agentId: "",
            ...(subDepartmentId ? { subDepartmentId } : {}),
          }),
        }),
      );
      setRules((prev) => [...(prev ?? []), created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create rule");
    }
  }

  async function updateRule(id: string, patch: Partial<AssignmentRule>) {
    setError(null);
    setRules((prev) => prev?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? null);
    try {
      await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/assignment-rules/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update rule");
      load();
    }
  }

  async function deleteRule(id: string) {
    setError(null);
    const prev = rules;
    setRules((r) => r?.filter((x) => x.id !== id) ?? null);
    try {
      await jsonOrThrow(await fetch(`/api/departments/${departmentId}/assignment-rules/${id}`, { method: "DELETE" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete rule");
      setRules(prev ?? null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1.5 font-sans text-[12.5px] text-pen-muted hover:text-pen-foreground"
      >
        <ArrowLeft className="size-3.5" /> {backLabel}
      </Link>

      <h1 className="pen-text-modal-title mb-1">Assignment methods — {scopeName}</h1>
      <p className="mb-6 font-sans text-[12.5px] text-pen-muted">
        {subDepartmentId
          ? "How new tickets for this sub-department are routed to agents. Inherit the parent department's method, or set one here to override it."
          : "How new tickets are routed to agents."}{" "}
        When no eligible agent can be found, tickets are left unassigned and department admins are
        notified immediately.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-[12.5px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── Method selector ── */}
      <div className="mb-8 rounded-2xl border border-pen-card-border bg-pen-card p-5">
        <h2 className="mb-3 font-sans text-[13.5px] font-semibold text-pen-foreground">Method</h2>
        {method === undefined ? (
          <p className="font-sans text-[12.5px] text-pen-muted">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {subDepartmentId && (
              <button
                type="button"
                disabled={saving}
                onClick={() => changeMethod(null)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors disabled:opacity-60 sm:col-span-2",
                  method === null
                    ? "border-pen-blue bg-pen-blue-tint"
                    : "border-pen-card-border hover:bg-pen-surface",
                )}
              >
                <p className="font-sans text-[12.5px] font-semibold text-pen-foreground">
                  Inherit from parent department
                </p>
                <p className="mt-0.5 font-sans text-[11px] text-pen-muted">
                  Use the department&apos;s method
                  {parentMethod
                    ? ` (currently ${METHODS.find((m) => m.value === parentMethod)?.label ?? parentMethod})`
                    : ""}
                  .
                </p>
              </button>
            )}
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                disabled={saving}
                onClick={() => changeMethod(m.value)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
                  method === m.value
                    ? "border-pen-blue bg-pen-blue-tint"
                    : "border-pen-card-border hover:bg-pen-surface",
                )}
              >
                <p className="font-sans text-[12.5px] font-semibold text-pen-foreground">{m.label}</p>
                <p className="mt-0.5 font-sans text-[11px] text-pen-muted">{m.description}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Rule-based rules ── */}
      {method === "RULE_BASED" && (
        <div className="rounded-2xl border border-pen-card-border bg-pen-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-sans text-[13.5px] font-semibold text-pen-foreground">Rules</h2>
            <button
              type="button"
              onClick={addRule}
              className="inline-flex items-center gap-1 rounded-md bg-pen-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-pen-blue/90"
            >
              <Plus className="size-3.5" /> Add rule
            </button>
          </div>

          {rules === null ? (
            <p className="font-sans text-[12.5px] text-pen-muted">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="font-sans text-[12.5px] text-pen-muted">
              No rules yet — every ticket will fail to auto-assign until one is added.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {rules.map((rule) => (
                <div key={rule.id} className="rounded-lg border border-pen-card-border p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={rule.name}
                      onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                      className="min-w-0 flex-1 rounded-md border border-pen-card-border bg-pen-surface px-2 py-1 font-sans text-[12.5px] font-medium text-pen-foreground outline-none"
                    />
                    <label className="flex items-center gap-1.5 font-sans text-[11.5px] text-pen-muted">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                      />
                      Enabled
                    </label>
                    <button
                      type="button"
                      onClick={() => deleteRule(rule.id)}
                      className="rounded-md p-1.5 text-pen-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      title="Delete rule"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <label className="mt-2 flex items-center gap-1.5 font-sans text-[11.5px] text-pen-muted">
                    Agent (user id)
                    <input
                      value={rule.agentId}
                      onChange={(e) => updateRule(rule.id, { agentId: e.target.value })}
                      className="w-64 rounded-md border border-pen-card-border bg-pen-surface px-2 py-1 font-sans text-[12px] text-pen-foreground outline-none"
                    />
                  </label>
                  <p className="mt-2 font-sans text-[11px] text-pen-subtle">
                    {rule.conditions.conditions.length === 0
                      ? "Applies to every ticket (no conditions)."
                      : `${rule.conditions.conditions.length} condition(s) — edit via the API for now.`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
