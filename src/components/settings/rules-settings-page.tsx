"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

// ── Types (mirror lib/rules-engine.ts) ───────────────────────────────────────
type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "is_empty";
type Condition = { fieldId: string; operator: ConditionOperator; value?: string };
type ConditionGroup = { combinator: "AND" | "OR"; conditions: Condition[] };
type RuleActionType =
  | "assign_agent"
  | "assign_group"
  | "set_priority"
  | "set_category"
  | "set_tag"
  | "apply_sla"
  | "change_column"
  | "send_notification";
type RuleAction = { type: RuleActionType; params?: Record<string, unknown> };
type Rule = {
  id: string;
  name: string;
  conditions: ConditionGroup;
  actions: RuleAction[];
  order: number;
  enabled: boolean;
  stopProcessing: boolean;
};

type RuleEvaluation = {
  ruleId: string;
  name: string;
  matched: boolean;
  actions: RuleAction[];
  stoppedHere: boolean;
};
type RulesPlan = {
  evaluations: RuleEvaluation[];
  firedActions: RuleAction[];
  stoppedAtRuleId: string | null;
};

type SlaPolicyLite = { id: string; name: string };

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "is_empty", label: "is empty" },
];
const ACTION_TYPES: { value: RuleActionType; label: string }[] = [
  { value: "assign_agent", label: "Assign agent" },
  { value: "assign_group", label: "Assign to group" },
  { value: "set_priority", label: "Set priority" },
  { value: "set_category", label: "Set category" },
  { value: "set_tag", label: "Add tag" },
  { value: "apply_sla", label: "Apply SLA policy" },
  { value: "change_column", label: "Set status" },
  { value: "send_notification", label: "Send notification" },
];
const PRIORITIES = ["Low", "Medium", "High", "Critical", "Urgent"];
const CATEGORIES = ["Bug", "FeatureRequest", "Question", "TechnicalIssue", "AccountAccess", "Billing", "Other"];

const inputCls =
  "h-8 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12.5px] text-pen-foreground outline-none transition-colors focus:border-pen-blue/60 focus:ring-2 focus:ring-pen-blue/15";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function RulesSettingsPage({
  departmentId,
  departmentName,
  subDepartmentId,
  subDepartmentName,
}: {
  departmentId: string;
  departmentName: string;
  /** When set, this surface manages ONLY the given sub-department's rules. */
  subDepartmentId?: string;
  subDepartmentName?: string;
}) {
  // Scope every request to the sub-department when one is provided; otherwise
  // the endpoints default to department-wide rules (subDepartmentId = null).
  const scopeQs = subDepartmentId ? `?subDepartmentId=${encodeURIComponent(subDepartmentId)}` : "";
  const scopeBody = subDepartmentId ? { subDepartmentId } : {};
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicyLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Test panel
  const [testFields, setTestFields] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [testResult, setTestResult] = useState<RulesPlan | null>(null);
  const [testing, setTesting] = useState(false);

  const load = () => {
    Promise.all([
      fetch(`/api/departments/${departmentId}/rules${scopeQs}`).then(jsonOrThrow),
      fetch(`/api/departments/${departmentId}/sla-policies${scopeQs}`).then(jsonOrThrow).catch(() => []),
    ])
      .then(([rulesRes, slaRes]) => {
        setRules(rulesRes);
        setSlaPolicies((slaRes as SlaPolicyLite[]).map((p) => ({ id: p.id, name: p.name })));
      })
      .catch((e) => setError(e.message));
  };
  useEffect(load, [departmentId, subDepartmentId]);

  function patchLocal(id: string, updater: (r: Rule) => Rule) {
    setRules((prev) => prev?.map((r) => (r.id === id ? updater(r) : r)) ?? null);
  }

  async function addRule() {
    setError(null);
    try {
      const created: Rule = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New rule",
            conditions: { combinator: "AND", conditions: [] },
            actions: [],
            ...scopeBody,
          }),
        }),
      );
      setRules((prev) => [...(prev ?? []), created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create rule");
    }
  }

  async function saveRule(rule: Rule) {
    setSavingId(rule.id);
    setError(null);
    try {
      const updated: Rule = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/rules/${rule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: rule.name,
            conditions: rule.conditions,
            actions: rule.actions,
            enabled: rule.enabled,
            stopProcessing: rule.stopProcessing,
          }),
        }),
      );
      patchLocal(rule.id, () => updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save rule");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRule(id: string) {
    setError(null);
    const prev = rules;
    setRules((p) => p?.filter((r) => r.id !== id) ?? null);
    try {
      await jsonOrThrow(await fetch(`/api/departments/${departmentId}/rules/${id}`, { method: "DELETE" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete rule");
      setRules(prev ?? null);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    if (!rules) return;
    const next = [...rules];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRules(next);
    try {
      await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/rules/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ruleIds: next.map((r) => r.id), ...scopeBody }),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reorder");
      load();
    }
  }

  async function runTest() {
    if (!rules) return;
    setTesting(true);
    setError(null);
    const values: Record<string, string> = {};
    for (const f of testFields) if (f.key.trim()) values[f.key.trim()] = f.value;
    try {
      const plan: RulesPlan = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/rules/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values, rules, ...scopeBody }),
        }),
      );
      setTestResult(plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="w-full px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      {!subDepartmentId && (
        <Link
          href="/settings/departments"
          className="mb-4 inline-flex items-center gap-1.5 font-sans text-[12.5px] text-pen-muted hover:text-pen-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to departments
        </Link>
      )}

      <h1 className="pen-text-modal-title mb-1">
        Automation rules — {subDepartmentName ?? departmentName}
      </h1>
      <p className="mb-6 font-sans text-[12.5px] text-pen-muted">
        {subDepartmentId
          ? "These rules run in addition to the parent department's rules, on this sub-department's tickets only. "
          : ""}
        Rules run in order on every new ticket. A matching rule fires its actions; enable
        &ldquo;stop after this&rdquo; to halt later rules. Test against sample field values before turning a rule on.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-[12.5px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-8 rounded-2xl border border-pen-card-border bg-pen-card p-5">
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
          <p className="font-sans text-[12.5px] text-pen-muted">No rules yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {rules.map((rule, index) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={index}
                total={rules.length}
                slaPolicies={slaPolicies}
                saving={savingId === rule.id}
                onChange={(r) => patchLocal(rule.id, () => r)}
                onSave={() => saveRule(rule)}
                onDelete={() => deleteRule(rule.id)}
                onMove={(dir) => move(index, dir)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Test panel (RE-04) ── */}
      <div className="rounded-2xl border border-pen-card-border bg-pen-card p-5">
        <h2 className="mb-1 flex items-center gap-1.5 font-sans text-[13.5px] font-semibold text-pen-foreground">
          <FlaskConical className="size-3.5" /> Test with sample data
        </h2>
        <p className="mb-3 font-sans text-[11.5px] text-pen-muted">
          Enter sample form field values to see which rules match — dry-run, nothing is changed.
        </p>
        <div className="flex flex-col gap-2">
          {testFields.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                placeholder="field id (e.g. priority)"
                value={f.key}
                onChange={(e) =>
                  setTestFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, key: e.target.value } : x)))
                }
                className={cn(inputCls, "w-48")}
              />
              <span className="text-pen-subtle">=</span>
              <input
                placeholder="value"
                value={f.value}
                onChange={(e) =>
                  setTestFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, value: e.target.value } : x)))
                }
                className={cn(inputCls, "flex-1")}
              />
              <button
                type="button"
                onClick={() => setTestFields((prev) => prev.filter((_, xi) => xi !== i))}
                className="rounded-md p-1.5 text-pen-subtle hover:text-red-500"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTestFields((prev) => [...prev, { key: "", value: "" }])}
              className="inline-flex items-center gap-1 rounded-md border border-pen-card-border px-2 py-1 font-sans text-[11.5px] text-pen-muted hover:text-pen-foreground"
            >
              <Plus className="size-3" /> Add field
            </button>
            <button
              type="button"
              onClick={runTest}
              disabled={testing || !rules}
              className="inline-flex items-center gap-1 rounded-md bg-pen-blue px-3 py-1 font-sans text-[12px] font-medium text-white hover:bg-pen-blue/90 disabled:opacity-60"
            >
              {testing ? "Running…" : "Run test"}
            </button>
          </div>
        </div>

        {testResult && (
          <div className="mt-4 rounded-lg border border-pen-card-border bg-pen-surface p-3">
            <p className="mb-2 font-sans text-[12px] font-semibold text-pen-foreground">
              {testResult.firedActions.length} action(s) would fire
              {testResult.stoppedAtRuleId ? " (stopped early)" : ""}
            </p>
            <div className="flex flex-col gap-1">
              {testResult.evaluations.map((ev) => (
                <div key={ev.ruleId} className="flex items-center gap-2 font-sans text-[11.5px]">
                  <span
                    className={cn(
                      "inline-flex w-16 justify-center rounded px-1.5 py-0.5 font-medium",
                      ev.matched
                        ? "bg-pen-green/15 text-pen-green"
                        : "bg-pen-surface text-pen-subtle",
                    )}
                  >
                    {ev.matched ? "matched" : "no match"}
                  </span>
                  <span className="text-pen-foreground">{ev.name}</span>
                  {ev.matched && ev.actions.length > 0 && (
                    <span className="text-pen-muted">
                      → {ev.actions.map((a) => a.type).join(", ")}
                    </span>
                  )}
                  {ev.stoppedHere && <span className="text-pen-subtle">(stops here)</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Per-rule editor card ─────────────────────────────────────────────────────
function RuleCard({
  rule,
  index,
  total,
  slaPolicies,
  saving,
  onChange,
  onSave,
  onDelete,
  onMove,
}: {
  rule: Rule;
  index: number;
  total: number;
  slaPolicies: SlaPolicyLite[];
  saving: boolean;
  onChange: (r: Rule) => void;
  onSave: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const setConditions = (conditions: ConditionGroup) => onChange({ ...rule, conditions });
  const setActions = (actions: RuleAction[]) => onChange({ ...rule, actions });

  return (
    <div className="rounded-lg border border-pen-card-border p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-pen-subtle">#{index + 1}</span>
        <input
          value={rule.name}
          onChange={(e) => onChange({ ...rule, name: e.target.value })}
          className={cn(inputCls, "min-w-0 flex-1 font-medium")}
        />
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="rounded-md p-1 text-pen-subtle hover:text-pen-foreground disabled:opacity-30" title="Move up">
          <ArrowUp className="size-3.5" />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="rounded-md p-1 text-pen-subtle hover:text-pen-foreground disabled:opacity-30" title="Move down">
          <ArrowDown className="size-3.5" />
        </button>
        <button type="button" onClick={onDelete} className="rounded-md p-1.5 text-pen-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20" title="Delete rule">
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-5">
        <label className="flex cursor-pointer items-center gap-2 font-sans text-[12px] text-pen-foreground">
          <Switch checked={rule.enabled} onCheckedChange={(v) => onChange({ ...rule, enabled: v })} />
          Enabled
        </label>
        <label className="flex cursor-pointer items-center gap-2 font-sans text-[12px] text-pen-foreground">
          <Switch checked={rule.stopProcessing} onCheckedChange={(v) => onChange({ ...rule, stopProcessing: v })} />
          Stop after this rule matches
        </label>
      </div>

      {/* Conditions */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">When</span>
          <select
            value={rule.conditions.combinator}
            onChange={(e) => setConditions({ ...rule.conditions, combinator: e.target.value as "AND" | "OR" })}
            className={inputCls}
          >
            <option value="AND">all (AND)</option>
            <option value="OR">any (OR)</option>
          </select>
          <span className="font-sans text-[11px] text-pen-subtle">of these match</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {rule.conditions.conditions.map((c, ci) => (
            <div key={ci} className="flex items-center gap-2">
              <input
                placeholder="field id"
                value={c.fieldId}
                onChange={(e) =>
                  setConditions({
                    ...rule.conditions,
                    conditions: rule.conditions.conditions.map((x, xi) => (xi === ci ? { ...x, fieldId: e.target.value } : x)),
                  })
                }
                className={cn(inputCls, "w-40")}
              />
              <select
                value={c.operator}
                onChange={(e) =>
                  setConditions({
                    ...rule.conditions,
                    conditions: rule.conditions.conditions.map((x, xi) => (xi === ci ? { ...x, operator: e.target.value as ConditionOperator } : x)),
                  })
                }
                className={inputCls}
              >
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {c.operator !== "is_empty" && (
                <input
                  placeholder="value"
                  value={c.value ?? ""}
                  onChange={(e) =>
                    setConditions({
                      ...rule.conditions,
                      conditions: rule.conditions.conditions.map((x, xi) => (xi === ci ? { ...x, value: e.target.value } : x)),
                    })
                  }
                  className={cn(inputCls, "flex-1")}
                />
              )}
              <button
                type="button"
                onClick={() =>
                  setConditions({ ...rule.conditions, conditions: rule.conditions.conditions.filter((_, xi) => xi !== ci) })
                }
                className="rounded-md p-1.5 text-pen-subtle hover:text-red-500"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setConditions({ ...rule.conditions, conditions: [...rule.conditions.conditions, { fieldId: "", operator: "equals", value: "" }] })
            }
            className="inline-flex w-fit items-center gap-1 rounded-md border border-pen-card-border px-2 py-1 font-sans text-[11px] text-pen-muted hover:text-pen-foreground"
          >
            <Plus className="size-3" /> Add condition
          </button>
          {rule.conditions.conditions.length === 0 && (
            <p className="font-sans text-[11px] text-pen-subtle">No conditions — matches every ticket.</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">Then</span>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {rule.actions.map((a, ai) => (
            <div key={ai} className="flex items-center gap-2">
              <select
                value={a.type}
                onChange={(e) =>
                  setActions(rule.actions.map((x, xi) => (xi === ai ? { type: e.target.value as RuleActionType, params: {} } : x)))
                }
                className={inputCls}
              >
                {ACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ActionParams
                action={a}
                slaPolicies={slaPolicies}
                onChange={(params) => setActions(rule.actions.map((x, xi) => (xi === ai ? { ...x, params } : x)))}
              />
              <button
                type="button"
                onClick={() => setActions(rule.actions.filter((_, xi) => xi !== ai))}
                className="rounded-md p-1.5 text-pen-subtle hover:text-red-500"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setActions([...rule.actions, { type: "set_priority", params: {} }])}
            className="inline-flex w-fit items-center gap-1 rounded-md border border-pen-card-border px-2 py-1 font-sans text-[11px] text-pen-muted hover:text-pen-foreground"
          >
            <Plus className="size-3" /> Add action
          </button>
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-pen-blue px-3 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-pen-blue/90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save rule"}
        </button>
      </div>
    </div>
  );
}

// ── Per-action param inputs ──────────────────────────────────────────────────
function ActionParams({
  action,
  slaPolicies,
  onChange,
}: {
  action: RuleAction;
  slaPolicies: SlaPolicyLite[];
  onChange: (params: Record<string, unknown>) => void;
}) {
  const p = (action.params ?? {}) as Record<string, string>;
  const set = (key: string, value: string) => onChange({ ...p, [key]: value });

  switch (action.type) {
    case "assign_agent":
      return <input placeholder="agent user id" value={p.agentId ?? ""} onChange={(e) => set("agentId", e.target.value)} className={cn(inputCls, "flex-1")} />;
    case "assign_group":
      return <input placeholder="sub-department id" value={p.subDepartmentId ?? ""} onChange={(e) => set("subDepartmentId", e.target.value)} className={cn(inputCls, "flex-1")} />;
    case "set_priority":
      return (
        <select value={p.priority ?? ""} onChange={(e) => set("priority", e.target.value)} className={cn(inputCls, "flex-1")}>
          <option value="">Select priority…</option>
          {PRIORITIES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      );
    case "set_category":
      return (
        <select value={p.category ?? ""} onChange={(e) => set("category", e.target.value)} className={cn(inputCls, "flex-1")}>
          <option value="">Select category…</option>
          {CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      );
    case "set_tag":
      return <input placeholder="tag / label" value={p.tag ?? ""} onChange={(e) => set("tag", e.target.value)} className={cn(inputCls, "flex-1")} />;
    case "apply_sla":
      return (
        <select value={p.slaPolicyId ?? ""} onChange={(e) => set("slaPolicyId", e.target.value)} className={cn(inputCls, "flex-1")}>
          <option value="">Select SLA policy…</option>
          {slaPolicies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      );
    case "change_column":
      return <input placeholder="status label (e.g. IN PROGRESS)" value={p.status ?? ""} onChange={(e) => set("status", e.target.value)} className={cn(inputCls, "flex-1")} />;
    case "send_notification":
      return (
        <>
          <input placeholder="recipient user id" value={p.recipientId ?? ""} onChange={(e) => set("recipientId", e.target.value)} className={cn(inputCls, "w-40")} />
          <input placeholder="message (optional)" value={p.message ?? ""} onChange={(e) => set("message", e.target.value)} className={cn(inputCls, "flex-1")} />
        </>
      );
    default:
      return null;
  }
}
