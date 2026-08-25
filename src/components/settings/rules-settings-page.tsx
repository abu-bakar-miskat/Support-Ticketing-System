"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  FlaskConical,
  X,
  Zap,
  ChevronRight,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
type FormLite = { id: string; name: string };

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
  "h-8 rounded-lg border border-sts-card-border bg-sts-surface px-2.5 font-sans text-[12.5px] text-sts-foreground outline-none transition-colors focus:border-sts-blue/60 focus:ring-2 focus:ring-sts-blue/15";

const actionLabel = (t: RuleActionType) => ACTION_TYPES.find((x) => x.value === t)?.label ?? t;

function conditionsSummary(c: ConditionGroup): string {
  if (c.conditions.length === 0) return "Any ticket";
  return `${c.combinator === "AND" ? "All" : "Any"} of ${c.conditions.length} condition${c.conditions.length === 1 ? "" : "s"}`;
}
function actionsSummary(actions: RuleAction[]): string {
  if (actions.length === 0) return "No actions";
  return actions.map((a) => actionLabel(a.type)).join(", ");
}

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
  subDepartments,
}: {
  departmentId: string;
  departmentName: string;
  /** When set, this surface manages ONLY the given sub-department's rules,
   *  organised support-form wise (one table per form). */
  subDepartmentId?: string;
  subDepartmentName?: string;
  /** Sub-departments of this department — powers the department page's scope dropdown. */
  subDepartments?: { id: string; name: string }[];
}) {
  // Department page only: a dropdown to view/manage a specific sub-department's
  // rules. "" = the department-wide list; a sub-department id = that sub-dept's
  // form-wise surface. (The dedicated sub-department route sets subDepartmentId.)
  const showScopeSelect = !subDepartmentId && (subDepartments?.length ?? 0) > 0;
  const [activeScope, setActiveScope] = useState<string>("");
  const subDeptNameById = new Map((subDepartments ?? []).map((s) => [s.id, s.name] as const));
  const scopeOptions = [
    { value: "", label: "Only Department" },
    ...(subDepartments ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  // The effective sub-department in play: the prop (dedicated surface) or the
  // dropdown selection (department page).
  const activeSubId = subDepartmentId ?? (activeScope || undefined);
  const activeSubName = subDepartmentName ?? (activeScope ? subDeptNameById.get(activeScope) : undefined);

  // Sub-department surfaces are support-form wise; the department surface keeps
  // the flat, department-wide rule list.
  const formWise = !!activeSubId;
  const scopeQs = activeSubId ? `?subDepartmentId=${encodeURIComponent(activeSubId)}` : "";

  // Department-scope rule list (formWise === false).
  const [rules, setRules] = useState<Rule[] | null>(null);
  // Form-wise: forms for this sub-department + their rules keyed by form id.
  const [forms, setForms] = useState<FormLite[] | null>(null);
  const [rulesByForm, setRulesByForm] = useState<Record<string, Rule[]>>({});

  const [slaPolicies, setSlaPolicies] = useState<SlaPolicyLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // The form a "new rule" modal is being created for (form-wise); or a boolean
  // flag for the department surface.
  const [newRuleForm, setNewRuleForm] = useState<FormLite | null>(null);
  const [showNewRule, setShowNewRule] = useState(false);
  const [creating, setCreating] = useState(false);
  // Rule pending deletion — drives the confirmation modal.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; formId: string | null; name: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Test panel
  const [testFields, setTestFields] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [testResult, setTestResult] = useState<RulesPlan | null>(null);
  const [testing, setTesting] = useState(false);

  const load = () => {
    // Reset to loading state so a scope switch doesn't flash the old scope's rules.
    setRules(null);
    setForms(null);
    setRulesByForm({});
    setExpandedId(null);
    setTestResult(null);
    if (formWise) {
      Promise.all([
        fetch(`/api/departments/${departmentId}/forms${scopeQs}`).then(jsonOrThrow),
        fetch(`/api/departments/${departmentId}/sla-policies${scopeQs}`).then(jsonOrThrow).catch(() => []),
      ])
        .then(([formsRes, slaRes]: [FormLite[], SlaPolicyLite[]]) => {
          setForms(formsRes);
          setSlaPolicies(slaRes.map((p) => ({ id: p.id, name: p.name })));
          return Promise.all(
            formsRes.map((f) =>
              fetch(`/api/departments/${departmentId}/rules?formConfigId=${encodeURIComponent(f.id)}`)
                .then(jsonOrThrow)
                .then((rs: Rule[]) => [f.id, rs] as const),
            ),
          );
        })
        .then((entries) => setRulesByForm(Object.fromEntries(entries)))
        .catch((e) => setError(e.message));
    } else {
      Promise.all([
        fetch(`/api/departments/${departmentId}/rules`).then(jsonOrThrow),
        fetch(`/api/departments/${departmentId}/sla-policies`).then(jsonOrThrow).catch(() => []),
      ])
        .then(([rulesRes, slaRes]: [Rule[], SlaPolicyLite[]]) => {
          setRules(rulesRes);
          setSlaPolicies(slaRes.map((p) => ({ id: p.id, name: p.name })));
        })
        .catch((e) => setError(e.message));
    }
  };
  useEffect(load, [departmentId, activeSubId]);

  // ── Local mutation helpers (work on either the flat list or a form bucket) ──
  function patchLocalDept(id: string, updater: (r: Rule) => Rule) {
    setRules((prev) => prev?.map((r) => (r.id === id ? updater(r) : r)) ?? null);
  }
  function patchLocalForm(formId: string, id: string, updater: (r: Rule) => Rule) {
    setRulesByForm((prev) => ({ ...prev, [formId]: (prev[formId] ?? []).map((r) => (r.id === id ? updater(r) : r)) }));
  }

  async function createRule(input: { name: string; enabled: boolean; stopProcessing: boolean }, form: FormLite | null) {
    setCreating(true);
    setError(null);
    try {
      const created: Rule = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: input.name,
            conditions: { combinator: "AND", conditions: [] },
            actions: [],
            enabled: input.enabled,
            stopProcessing: input.stopProcessing,
            ...(form ? { formConfigId: form.id } : activeSubId ? { subDepartmentId: activeSubId } : {}),
          }),
        }),
      );
      if (form) {
        setRulesByForm((prev) => ({ ...prev, [form.id]: [...(prev[form.id] ?? []), created] }));
      } else {
        setRules((prev) => [...(prev ?? []), created]);
      }
      setExpandedId(created.id);
      setShowNewRule(false);
      setNewRuleForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create rule");
    } finally {
      setCreating(false);
    }
  }

  async function saveRule(rule: Rule, formId: string | null) {
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
      if (formId) patchLocalForm(formId, rule.id, () => updated);
      else patchLocalDept(rule.id, () => updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save rule");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRule(id: string, formId: string | null) {
    setError(null);
    if (formId) {
      const prev = rulesByForm[formId];
      setRulesByForm((p) => ({ ...p, [formId]: (p[formId] ?? []).filter((r) => r.id !== id) }));
      try {
        await jsonOrThrow(await fetch(`/api/departments/${departmentId}/rules/${id}`, { method: "DELETE" }));
      } catch (e) {
        setRulesByForm((p) => ({ ...p, [formId]: prev ?? [] }));
        throw e instanceof Error ? e : new Error("Failed to delete rule");
      }
    } else {
      const prev = rules;
      setRules((p) => p?.filter((r) => r.id !== id) ?? null);
      try {
        await jsonOrThrow(await fetch(`/api/departments/${departmentId}/rules/${id}`, { method: "DELETE" }));
      } catch (e) {
        setRules(prev ?? null);
        throw e instanceof Error ? e : new Error("Failed to delete rule");
      }
    }
  }

  async function move(index: number, dir: -1 | 1, formId: string | null) {
    const list = formId ? rulesByForm[formId] ?? [] : rules ?? [];
    const next = [...list];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    if (formId) setRulesByForm((p) => ({ ...p, [formId]: next }));
    else setRules(next);
    try {
      await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/rules/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ruleIds: next.map((r) => r.id),
            ...(formId ? { formConfigId: formId } : activeSubId ? { subDepartmentId: activeSubId } : {}),
          }),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reorder");
      load();
    }
  }

  async function runTest() {
    // Test against every rule currently loaded on this surface.
    const allRules = formWise ? Object.values(rulesByForm).flat() : rules ?? [];
    setTesting(true);
    setError(null);
    const values: Record<string, string> = {};
    for (const f of testFields) if (f.key.trim()) values[f.key.trim()] = f.value;
    try {
      const plan: RulesPlan = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/rules/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values, rules: allRules, ...(activeSubId ? { subDepartmentId: activeSubId } : {}) }),
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
          className="mb-4 inline-flex items-center gap-1.5 font-sans text-[12.5px] text-sts-muted hover:text-sts-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to departments
        </Link>
      )}

      <h1 className="sts-text-modal-title mb-1">Automation rules — {activeSubName ?? departmentName}</h1>
      <p className="mb-6 font-sans text-[12.5px] text-sts-muted">
        {formWise
          ? "Rules are organised per support form: each form's rules run (in order) on tickets submitted through that form, in addition to the parent department's rules. "
          : ""}
        A matching rule fires its actions; enable &ldquo;stop after this&rdquo; to halt later rules. Test against
        sample field values before turning a rule on.
      </p>

      {showScopeSelect && (
        <div className="mb-5 flex items-center gap-2">
          <label className="font-sans text-[12px] font-medium text-sts-muted">Sub-department</label>
          <Select items={scopeOptions} value={activeScope} onValueChange={(v) => setActiveScope(v ?? "")}>
            <SelectTrigger className="w-60 border-sts-blue/30 bg-sts-blue/5 font-sans text-[12.5px] font-medium text-sts-blue hover:bg-sts-blue/10">
              <Zap className="size-3.5 text-sts-blue" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopeOptions.map((opt) => (
                <SelectItem key={opt.value || "dept"} value={opt.value} className="font-sans text-[12.5px]">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-[12.5px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── Rules ── */}
      {formWise ? (
        <div className="mb-8 flex flex-col gap-5">
          {forms === null ? (
            <p className="font-sans text-[12.5px] text-sts-muted">Loading…</p>
          ) : forms.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-sts-card-border py-12 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-sts-blue/10">
                <FileText className="size-5 text-sts-blue" />
              </div>
              <p className="font-sans text-[12.5px] font-medium text-sts-foreground">No support forms yet</p>
              <p className="max-w-xs font-sans text-[11.5px] text-sts-muted">
                Create a support form for this sub-department, then add automation rules to it here.
              </p>
            </div>
          ) : (
            forms.map((form) => (
              <FormRulesTable
                key={form.id}
                form={form}
                rules={rulesByForm[form.id]}
                slaPolicies={slaPolicies}
                savingId={savingId}
                expandedId={expandedId}
                onToggleExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
                onNewRule={() => {
                  setNewRuleForm(form);
                  setShowNewRule(true);
                }}
                onChange={(r) => patchLocalForm(form.id, r.id, () => r)}
                onSave={(r) => saveRule(r, form.id)}
                onDelete={(id) =>
                  setPendingDelete({
                    id,
                    formId: form.id,
                    name: rulesByForm[form.id]?.find((r) => r.id === id)?.name ?? "this rule",
                  })
                }
                onMove={(index, dir) => move(index, dir, form.id)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="mb-8 rounded-2xl border border-sts-card-border bg-sts-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Rules</h2>
              {rules !== null && rules.length > 0 && (
                <p className="mt-0.5 font-sans text-[11px] text-sts-subtle">
                  {rules.length} {rules.length === 1 ? "rule" : "rules"} · {rules.filter((r) => r.enabled).length} active
                  · run top to bottom
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setNewRuleForm(null);
                setShowNewRule(true);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-sts-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90"
            >
              <Plus className="size-3.5" /> New rule
            </button>
          </div>

          {rules === null ? (
            <p className="font-sans text-[12.5px] text-sts-muted">Loading…</p>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-sts-card-border py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-sts-blue/10">
                <Zap className="size-5 text-sts-blue" />
              </div>
              <div>
                <p className="font-sans text-[12.5px] font-medium text-sts-foreground">No automation rules yet</p>
                <p className="mt-0.5 font-sans text-[11.5px] text-sts-muted">
                  Add a rule to auto-assign, prioritise, or tag new tickets.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewRuleForm(null);
                  setShowNewRule(true);
                }}
                className="inline-flex items-center gap-1 rounded-md bg-sts-blue px-3 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90"
              >
                <Plus className="size-3.5" /> New rule
              </button>
            </div>
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
                  onChange={(r) => patchLocalDept(rule.id, () => r)}
                  onSave={() => saveRule(rule, null)}
                  onDelete={() => setPendingDelete({ id: rule.id, formId: null, name: rule.name })}
                  onMove={(dir) => move(index, dir, null)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Test panel (RE-04) ── */}
      <div className="rounded-2xl border border-sts-card-border bg-sts-card p-5">
        <h2 className="mb-1 flex items-center gap-1.5 font-sans text-[13.5px] font-semibold text-sts-foreground">
          <FlaskConical className="size-3.5" /> Test with sample data
        </h2>
        <p className="mb-3 font-sans text-[11.5px] text-sts-muted">
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
              <span className="text-sts-subtle">=</span>
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
                className="rounded-md p-1.5 text-sts-subtle hover:text-red-500"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTestFields((prev) => [...prev, { key: "", value: "" }])}
              className="inline-flex items-center gap-1 rounded-md border border-sts-card-border px-2 py-1 font-sans text-[11.5px] text-sts-muted hover:text-sts-foreground"
            >
              <Plus className="size-3" /> Add field
            </button>
            <button
              type="button"
              onClick={runTest}
              disabled={testing}
              className="inline-flex items-center gap-1 rounded-md bg-sts-blue px-3 py-1 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90 disabled:opacity-60"
            >
              {testing ? "Running…" : "Run test"}
            </button>
          </div>
        </div>

        {testResult && (
          <div className="mt-4 rounded-lg border border-sts-card-border bg-sts-surface p-3">
            <p className="mb-2 font-sans text-[12px] font-semibold text-sts-foreground">
              {testResult.firedActions.length} action(s) would fire
              {testResult.stoppedAtRuleId ? " (stopped early)" : ""}
            </p>
            <div className="flex flex-col gap-1">
              {testResult.evaluations.map((ev) => (
                <div key={ev.ruleId} className="flex items-center gap-2 font-sans text-[11.5px]">
                  <span
                    className={cn(
                      "inline-flex w-16 justify-center rounded px-1.5 py-0.5 font-medium",
                      ev.matched ? "bg-sts-green/15 text-sts-green" : "bg-sts-surface text-sts-subtle",
                    )}
                  >
                    {ev.matched ? "matched" : "no match"}
                  </span>
                  <span className="text-sts-foreground">{ev.name}</span>
                  {ev.matched && ev.actions.length > 0 && (
                    <span className="text-sts-muted">→ {ev.actions.map((a) => a.type).join(", ")}</span>
                  )}
                  {ev.stoppedHere && <span className="text-sts-subtle">(stops here)</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showNewRule && (
        <NewRuleModal
          scopeName={newRuleForm?.name ?? activeSubName ?? departmentName}
          creating={creating}
          onCancel={() => {
            setShowNewRule(false);
            setNewRuleForm(null);
          }}
          onCreate={(input) => createRule(input, newRuleForm)}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title="Delete rule?"
        description={`"${pendingDelete?.name ?? "This rule"}" will be permanently removed. This can't be undone.`}
        confirmLabel="Delete rule"
        successMessage="Rule deleted"
        onConfirm={async () => {
          if (pendingDelete) await deleteRule(pendingDelete.id, pendingDelete.formId);
        }}
      />
    </div>
  );
}

// ── Per-form rules table (support form wise) ─────────────────────────────────
function FormRulesTable({
  form,
  rules,
  slaPolicies,
  savingId,
  expandedId,
  onToggleExpand,
  onNewRule,
  onChange,
  onSave,
  onDelete,
  onMove,
}: {
  form: FormLite;
  rules: Rule[] | undefined;
  slaPolicies: SlaPolicyLite[];
  savingId: string | null;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onNewRule: () => void;
  onChange: (r: Rule) => void;
  onSave: (r: Rule) => void;
  onDelete: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  return (
    <section className="rounded-2xl border border-sts-card-border bg-sts-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sts-blue/10 text-sts-blue">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-sans text-[13.5px] font-semibold text-sts-foreground">{form.name}</h2>
            {rules && rules.length > 0 && (
              <p className="mt-0.5 font-sans text-[11px] text-sts-subtle">
                {rules.length} {rules.length === 1 ? "rule" : "rules"} · {rules.filter((r) => r.enabled).length} active ·
                run top to bottom
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onNewRule}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sts-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90"
        >
          <Plus className="size-3.5" /> New rule
        </button>
      </div>

      {rules === undefined ? (
        <p className="font-sans text-[12.5px] text-sts-muted">Loading…</p>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sts-card-border px-4 py-8 text-center">
          <p className="font-sans text-[12.5px] font-medium text-sts-foreground">No rules for this form yet</p>
          <p className="mx-auto mt-0.5 max-w-xs font-sans text-[11.5px] text-sts-muted">
            Add a rule to auto-assign, prioritise, or tag tickets submitted through this form.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-sts-card-border">
          <table className="w-full border-collapse font-sans text-[12.5px]">
            <thead>
              <tr className="border-b border-sts-card-border bg-sts-surface/50 text-left">
                <th className="w-10 px-3 py-2 font-medium text-sts-subtle">#</th>
                <th className="px-3 py-2 font-medium text-sts-subtle">Rule</th>
                <th className="px-3 py-2 font-medium text-sts-subtle">When</th>
                <th className="px-3 py-2 font-medium text-sts-subtle">Then</th>
                <th className="w-20 px-3 py-2 text-center font-medium text-sts-subtle">Enabled</th>
                <th className="w-28 px-3 py-2 text-right font-medium text-sts-subtle">Order</th>
                <th className="w-10 px-3 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, index) => {
                const expanded = expandedId === rule.id;
                return (
                  <RuleTableRows
                    key={rule.id}
                    rule={rule}
                    index={index}
                    total={rules.length}
                    expanded={expanded}
                    slaPolicies={slaPolicies}
                    saving={savingId === rule.id}
                    onToggleExpand={() => onToggleExpand(rule.id)}
                    onChange={onChange}
                    onSave={() => onSave(rule)}
                    onDelete={() => onDelete(rule.id)}
                    onMove={(dir) => onMove(index, dir)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// A summary row plus (when expanded) an editor row spanning the table width.
function RuleTableRows({
  rule,
  index,
  total,
  expanded,
  slaPolicies,
  saving,
  onToggleExpand,
  onChange,
  onSave,
  onDelete,
  onMove,
}: {
  rule: Rule;
  index: number;
  total: number;
  expanded: boolean;
  slaPolicies: SlaPolicyLite[];
  saving: boolean;
  onToggleExpand: () => void;
  onChange: (r: Rule) => void;
  onSave: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <>
      <tr className={cn("border-b border-sts-card-border last:border-0", expanded && "bg-sts-surface/30")}>
        <td className="px-3 py-2 align-middle">
          <span className="flex size-6 items-center justify-center rounded-md bg-sts-surface font-mono text-[11px] font-semibold text-sts-subtle ring-1 ring-sts-card-border">
            {index + 1}
          </span>
        </td>
        <td className="px-3 py-2 align-middle">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex items-center gap-1.5 text-left font-medium text-sts-foreground hover:text-sts-blue"
          >
            <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-90")} />
            <span className="truncate">{rule.name || "Untitled rule"}</span>
          </button>
        </td>
        <td className="px-3 py-2 align-middle text-sts-muted">{conditionsSummary(rule.conditions)}</td>
        <td className="px-3 py-2 align-middle text-sts-muted">
          <span className="line-clamp-1">{actionsSummary(rule.actions)}</span>
        </td>
        <td className="px-3 py-2 text-center align-middle">
          <div className="flex justify-center">
            <Switch checked={rule.enabled} onCheckedChange={(v) => onChange({ ...rule, enabled: v })} />
          </div>
        </td>
        <td className="px-3 py-2 align-middle">
          <div className="flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={index === 0}
              className="rounded-md p-1 text-sts-subtle hover:text-sts-foreground disabled:opacity-30"
              title="Move up"
            >
              <ArrowUp className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={index === total - 1}
              className="rounded-md p-1 text-sts-subtle hover:text-sts-foreground disabled:opacity-30"
              title="Move down"
            >
              <ArrowDown className="size-3.5" />
            </button>
          </div>
        </td>
        <td className="px-3 py-2 text-right align-middle">
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1.5 text-sts-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
            title="Delete rule"
          >
            <Trash2 className="size-3.5" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-sts-card-border last:border-0 bg-sts-surface/30">
          <td colSpan={7} className="px-3 pb-4 pt-1">
            <RuleEditor
              rule={rule}
              slaPolicies={slaPolicies}
              saving={saving}
              onChange={onChange}
              onSave={onSave}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ── New-rule modal ───────────────────────────────────────────────────────────
function NewRuleModal({
  scopeName,
  creating,
  onCancel,
  onCreate,
}: {
  scopeName: string;
  creating: boolean;
  onCancel: () => void;
  onCreate: (input: { name: string; enabled: boolean; stopProcessing: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [stopProcessing, setStopProcessing] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const canSubmit = name.trim().length > 0 && !creating;

  return (
    <div className="sts-overlay-backdrop fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onCancel}>
      <div
        className="sts-glass-panel sts-modal-enter flex w-full max-w-md flex-col overflow-hidden rounded-[14px] ring-1 ring-white/35 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-sts-card-border px-[22px]">
          <h2 className="sts-text-modal-title">New automation rule</h2>
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
        <div className="flex flex-col gap-4 px-[22px] py-5">
          <p className="font-sans text-[11.5px] text-sts-muted">
            Create the rule for <span className="font-medium text-sts-foreground">{scopeName}</span>, then add its
            conditions and actions on the card.
          </p>

          <div className="space-y-1.5">
            <label className="sts-text-label">Rule name</label>
            <input
              autoFocus
              placeholder="e.g. Route billing to Finance"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) onCreate({ name: name.trim(), enabled, stopProcessing });
              }}
              className="h-9 w-full rounded-[6px] border border-sts-card-border bg-sts-bg px-2.5 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-blue focus:ring-1 focus:ring-sts-blue/30"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-sts-surface px-3 py-2.5">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="flex flex-col">
              <span className="font-sans text-[12.5px] font-medium text-sts-foreground">Enabled</span>
              <span className="font-sans text-[11px] text-sts-muted">Start evaluating this rule on new tickets right away.</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-sts-surface px-3 py-2.5">
            <Switch checked={stopProcessing} onCheckedChange={setStopProcessing} />
            <span className="flex flex-col">
              <span className="font-sans text-[12.5px] font-medium text-sts-foreground">Stop after this rule matches</span>
              <span className="font-sans text-[11px] text-sts-muted">Skip all later rules once this one fires.</span>
            </span>
          </label>
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
            onClick={() => onCreate({ name: name.trim(), enabled, stopProcessing })}
            disabled={!canSubmit}
            className="flex h-8 items-center gap-1.5 rounded-[6px] bg-sts-blue px-3 font-sans text-[12px] font-medium text-white dark:text-gray-900 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Per-rule editor card (department surface) ────────────────────────────────
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
  return (
    <div className="rounded-lg border border-sts-card-border p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-sts-subtle">#{index + 1}</span>
        <input
          value={rule.name}
          onChange={(e) => onChange({ ...rule, name: e.target.value })}
          className={cn(inputCls, "min-w-0 flex-1 font-medium")}
        />
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className="rounded-md p-1 text-sts-subtle hover:text-sts-foreground disabled:opacity-30"
          title="Move up"
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          className="rounded-md p-1 text-sts-subtle hover:text-sts-foreground disabled:opacity-30"
          title="Move down"
        >
          <ArrowDown className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1.5 text-sts-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
          title="Delete rule"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-5">
        <label className="flex cursor-pointer items-center gap-2 font-sans text-[12px] text-sts-foreground">
          <Switch checked={rule.enabled} onCheckedChange={(v) => onChange({ ...rule, enabled: v })} />
          Enabled
        </label>
        <label className="flex cursor-pointer items-center gap-2 font-sans text-[12px] text-sts-foreground">
          <Switch checked={rule.stopProcessing} onCheckedChange={(v) => onChange({ ...rule, stopProcessing: v })} />
          Stop after this rule matches
        </label>
      </div>

      <ConditionsEditor conditions={rule.conditions} onChange={(conditions) => onChange({ ...rule, conditions })} />
      <ActionsEditor
        actions={rule.actions}
        slaPolicies={slaPolicies}
        onChange={(actions) => onChange({ ...rule, actions })}
      />

      <div className="mt-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-sts-blue px-3 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save rule"}
        </button>
      </div>
    </div>
  );
}

// ── Compact editor used inside the per-form table (name/enabled/move/delete
//    live in the summary row, so this shows only conditions/actions/stop/save). ─
function RuleEditor({
  rule,
  slaPolicies,
  saving,
  onChange,
  onSave,
}: {
  rule: Rule;
  slaPolicies: SlaPolicyLite[];
  saving: boolean;
  onChange: (r: Rule) => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-lg border border-sts-card-border bg-sts-card p-3">
      <label className="flex w-fit cursor-pointer items-center gap-2 font-sans text-[12px] text-sts-foreground">
        <Switch checked={rule.stopProcessing} onCheckedChange={(v) => onChange({ ...rule, stopProcessing: v })} />
        Stop after this rule matches
      </label>

      <ConditionsEditor conditions={rule.conditions} onChange={(conditions) => onChange({ ...rule, conditions })} />
      <ActionsEditor
        actions={rule.actions}
        slaPolicies={slaPolicies}
        onChange={(actions) => onChange({ ...rule, actions })}
      />

      <div className="mt-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-sts-blue px-3 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save rule"}
        </button>
      </div>
    </div>
  );
}

// ── Conditions editor ─────────────────────────────────────────────────────────
function ConditionsEditor({
  conditions,
  onChange,
}: {
  conditions: ConditionGroup;
  onChange: (c: ConditionGroup) => void;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-sts-subtle">When</span>
        <select
          value={conditions.combinator}
          onChange={(e) => onChange({ ...conditions, combinator: e.target.value as "AND" | "OR" })}
          className={inputCls}
        >
          <option value="AND">all (AND)</option>
          <option value="OR">any (OR)</option>
        </select>
        <span className="font-sans text-[11px] text-sts-subtle">of these match</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {conditions.conditions.map((c, ci) => (
          <div key={ci} className="flex items-center gap-2">
            <input
              placeholder="field id"
              value={c.fieldId}
              onChange={(e) =>
                onChange({
                  ...conditions,
                  conditions: conditions.conditions.map((x, xi) => (xi === ci ? { ...x, fieldId: e.target.value } : x)),
                })
              }
              className={cn(inputCls, "w-40")}
            />
            <select
              value={c.operator}
              onChange={(e) =>
                onChange({
                  ...conditions,
                  conditions: conditions.conditions.map((x, xi) =>
                    xi === ci ? { ...x, operator: e.target.value as ConditionOperator } : x,
                  ),
                })
              }
              className={inputCls}
            >
              {OPERATORS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {c.operator !== "is_empty" && (
              <input
                placeholder="value"
                value={c.value ?? ""}
                onChange={(e) =>
                  onChange({
                    ...conditions,
                    conditions: conditions.conditions.map((x, xi) => (xi === ci ? { ...x, value: e.target.value } : x)),
                  })
                }
                className={cn(inputCls, "flex-1")}
              />
            )}
            <button
              type="button"
              onClick={() =>
                onChange({ ...conditions, conditions: conditions.conditions.filter((_, xi) => xi !== ci) })
              }
              className="rounded-md p-1.5 text-sts-subtle hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...conditions,
              conditions: [...conditions.conditions, { fieldId: "", operator: "equals", value: "" }],
            })
          }
          className="inline-flex w-fit items-center gap-1 rounded-md border border-sts-card-border px-2 py-1 font-sans text-[11px] text-sts-muted hover:text-sts-foreground"
        >
          <Plus className="size-3" /> Add condition
        </button>
        {conditions.conditions.length === 0 && (
          <p className="font-sans text-[11px] text-sts-subtle">No conditions — matches every ticket.</p>
        )}
      </div>
    </div>
  );
}

// ── Actions editor ─────────────────────────────────────────────────────────────
function ActionsEditor({
  actions,
  slaPolicies,
  onChange,
}: {
  actions: RuleAction[];
  slaPolicies: SlaPolicyLite[];
  onChange: (a: RuleAction[]) => void;
}) {
  return (
    <div className="mt-3">
      <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-sts-subtle">Then</span>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {actions.map((a, ai) => (
          <div key={ai} className="flex items-center gap-2">
            <select
              value={a.type}
              onChange={(e) =>
                onChange(actions.map((x, xi) => (xi === ai ? { type: e.target.value as RuleActionType, params: {} } : x)))
              }
              className={inputCls}
            >
              {ACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <ActionParams
              action={a}
              slaPolicies={slaPolicies}
              onChange={(params) => onChange(actions.map((x, xi) => (xi === ai ? { ...x, params } : x)))}
            />
            <button
              type="button"
              onClick={() => onChange(actions.filter((_, xi) => xi !== ai))}
              className="rounded-md p-1.5 text-sts-subtle hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...actions, { type: "set_priority", params: {} }])}
          className="inline-flex w-fit items-center gap-1 rounded-md border border-sts-card-border px-2 py-1 font-sans text-[11px] text-sts-muted hover:text-sts-foreground"
        >
          <Plus className="size-3" /> Add action
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
          {PRIORITIES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      );
    case "set_category":
      return (
        <select value={p.category ?? ""} onChange={(e) => set("category", e.target.value)} className={cn(inputCls, "flex-1")}>
          <option value="">Select category…</option>
          {CATEGORIES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      );
    case "set_tag":
      return <input placeholder="tag / label" value={p.tag ?? ""} onChange={(e) => set("tag", e.target.value)} className={cn(inputCls, "flex-1")} />;
    case "apply_sla":
      return (
        <select value={p.slaPolicyId ?? ""} onChange={(e) => set("slaPolicyId", e.target.value)} className={cn(inputCls, "flex-1")}>
          <option value="">Select SLA policy…</option>
          {slaPolicies.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
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
