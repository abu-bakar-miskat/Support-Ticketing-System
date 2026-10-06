"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTenantHref } from "@/hooks/use-tenant-href";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  FlaskConical,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  RuleConditionsEditor,
  toRuleFormField,
  type RuleConditionGroup,
  type RuleFormField,
} from "@/components/settings/rule-conditions-editor";
import { TicketCategory, TicketPriority } from "@/generated/prisma/enums";

// ── Types (mirror lib/rules-engine.ts) ───────────────────────────────────────
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
  conditions: RuleConditionGroup;
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
type MemberOption = { id: string; name: string; subDepartmentName?: string | null };
type SubDepartmentOption = { id: string; name: string };

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
const PRIORITIES = Object.values(TicketPriority);
const CATEGORIES = Object.values(TicketCategory);

function defaultParamsForAction(
  type: RuleActionType,
  members: readonly MemberOption[],
  subDepartments: readonly SubDepartmentOption[],
): Record<string, unknown> {
  if (type === "set_priority") return { priority: TicketPriority.Medium };
  if (type === "assign_agent") return { agentId: members[0]?.id ?? "" };
  if (type === "assign_group") return { subDepartmentId: subDepartments[0]?.id ?? "" };
  return {};
}

const inputCls =
  "h-8 rounded-lg border border-sts-card-border bg-sts-surface px-2.5 font-sans text-[12.5px] text-sts-foreground outline-none transition-colors focus:border-sts-blue/60 focus:ring-2 focus:ring-sts-blue/15";

const actionLabel = (t: RuleActionType) => ACTION_TYPES.find((x) => x.value === t)?.label ?? t;

function SkeletonRows({ count = 3, height = "h-9" }: { count?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn("animate-pulse rounded-lg bg-sts-surface", height)} />
      ))}
    </div>
  );
}

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

/**
 * Department-scoped automation rules. Sub-departments inherit these rules —
 * there is no per-sub-department rule surface.
 */
export function RulesSettingsPage({
  departmentId,
  departmentName,
  members = [],
  subDepartments = [],
}: {
  departmentId: string;
  departmentName: string;
  members?: MemberOption[];
  subDepartments?: SubDepartmentOption[];
}) {
  const tenantHref = useTenantHref();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [departmentFields, setDepartmentFields] = useState<RuleFormField[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicyLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showNewRule, setShowNewRule] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const [testFields, setTestFields] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [testResult, setTestResult] = useState<RulesPlan | null>(null);
  const [testing, setTesting] = useState(false);

  const load = () => {
    setRules(null);
    setDepartmentFields([]);
    setTestResult(null);
    Promise.all([
      fetch(`/api/departments/${departmentId}/rules`).then(jsonOrThrow),
      fetch(`/api/departments/${departmentId}/sla-policies`).then(jsonOrThrow).catch(() => []),
      fetch(`/api/departments/${departmentId}/forms`).then(jsonOrThrow).catch(() => [] as FormLite[]),
    ])
      .then(async ([rulesRes, slaRes, formsRes]: [Rule[], SlaPolicyLite[], FormLite[]]) => {
        setRules(rulesRes);
        setSlaPolicies(slaRes.map((p) => ({ id: p.id, name: p.name })));
        const fieldLists = await Promise.all(
          formsRes.map(async (f) => {
            const rawFields = await fetch(`/api/intake/forms/${f.id}/fields`)
              .then(jsonOrThrow)
              .catch(() => [] as { id: string; label: string; type: string; options?: unknown }[]);
            return (rawFields as { id: string; label: string; type: string; options?: unknown }[]).map((field) =>
              toRuleFormField(field, f.name),
            );
          }),
        );
        setDepartmentFields(fieldLists.flat());
      })
      .catch((e) => setError(e.message));
  };
  useEffect(load, [departmentId]);

  function patchLocal(id: string, updater: (r: Rule) => Rule) {
    setRules((prev) => prev?.map((r) => (r.id === id ? updater(r) : r)) ?? null);
  }

  async function createRule(input: { name: string; enabled: boolean; stopProcessing: boolean }) {
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
          }),
        }),
      );
      setRules((prev) => [...(prev ?? []), created]);
      setShowNewRule(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create rule");
    } finally {
      setCreating(false);
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
      setRules(prev ?? null);
      throw e instanceof Error ? e : new Error("Failed to delete rule");
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const list = rules ?? [];
    const next = [...list];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRules(next);
    try {
      await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/rules/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ruleIds: next.map((r) => r.id) }),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reorder");
      load();
    }
  }

  async function runTest() {
    setTesting(true);
    setError(null);
    const values: Record<string, string> = {};
    for (const f of testFields) if (f.key.trim()) values[f.key.trim()] = f.value;
    try {
      const plan: RulesPlan = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/rules/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values, rules: rules ?? [] }),
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
      <Link
        href={tenantHref("/settings/departments")}
        className="mb-4 inline-flex items-center gap-1.5 font-sans text-[12.5px] text-sts-muted hover:text-sts-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back to departments
      </Link>

      <h1 className="sts-text-modal-title mb-1">Automation rules — {departmentName}</h1>
      <p className="mb-6 font-sans text-[12.5px] text-sts-muted">
        Rules are configured at the department level. Every sub-department inherits them: on each
        support-form submission the matching rule fires its actions. Enable &ldquo;stop after
        this&rdquo; to halt later rules. Test against sample field values before turning a rule on.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-[12.5px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-8 rounded-2xl border border-sts-card-border bg-sts-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Rules</h2>
            {rules !== null && rules.length > 0 && (
              <p className="mt-0.5 font-sans text-[11px] text-sts-subtle">
                {rules.length} {rules.length === 1 ? "rule" : "rules"} ·{" "}
                {rules.filter((r) => r.enabled).length} active · run top to bottom
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowNewRule(true)}
            className="inline-flex items-center gap-1 rounded-full bg-sts-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90"
          >
            <Plus className="size-3.5" /> New rule
          </button>
        </div>

        {rules === null ? (
          <SkeletonRows count={3} height="h-[92px]" />
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-sts-card-border py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-sts-blue/10">
              <Zap className="size-5 text-sts-blue" />
            </div>
            <div>
              <p className="font-sans text-[12.5px] font-medium text-sts-foreground">No automation rules yet</p>
              <p className="mt-0.5 font-sans text-[11.5px] text-sts-muted">
                Add a rule to auto-assign, prioritise, or tag new tickets across this department.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewRule(true)}
              className="inline-flex items-center gap-1 rounded-full bg-sts-blue px-3 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90"
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
                fields={departmentFields}
                slaPolicies={slaPolicies}
                members={members}
                subDepartments={subDepartments}
                saving={savingId === rule.id}
                onChange={(r) => patchLocal(rule.id, () => r)}
                onSave={() => saveRule(rule)}
                onDelete={() => setPendingDelete({ id: rule.id, name: rule.name })}
                onMove={(dir) => move(index, dir)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-sts-card-border bg-sts-card p-5">
        <h2 className="mb-1 flex items-center gap-1.5 font-sans text-[13.5px] font-semibold text-sts-foreground">
          <FlaskConical className="size-3.5" /> Test with sample data
        </h2>
        <p className="mb-3 font-sans text-[11.5px] text-sts-muted">
          Enter sample form field values to see which rules match — dry-run, nothing is changed.
        </p>
        <div className="flex flex-col gap-2">
          {testFields.map((f, i) => {
            const selected = departmentFields.find((x) => x.id === f.key);
            const choices =
              selected && selected.options.length > 0
                ? selected.options
                : selected?.type === "checkbox"
                  ? ["true", "false"]
                  : null;
            return (
              <div key={i} className="flex items-center gap-2">
                {departmentFields.length > 0 ? (
                  <select
                    value={f.key}
                    onChange={(e) =>
                      setTestFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, key: e.target.value } : x)))
                    }
                    className={cn(inputCls, "min-w-40 max-w-64")}
                    aria-label="Sample field"
                  >
                    <option value="">Select field…</option>
                    {departmentFields.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.formName ? `${field.formName} · ${field.label}` : field.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    placeholder="field id"
                    value={f.key}
                    onChange={(e) =>
                      setTestFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, key: e.target.value } : x)))
                    }
                    className={cn(inputCls, "w-48")}
                  />
                )}
                <span className="text-sts-subtle">=</span>
                {choices ? (
                  <select
                    value={f.value}
                    onChange={(e) =>
                      setTestFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, value: e.target.value } : x)))
                    }
                    className={cn(inputCls, "flex-1")}
                    aria-label="Sample value"
                  >
                    <option value="">Select value…</option>
                    {choices.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    placeholder="value"
                    value={f.value}
                    onChange={(e) =>
                      setTestFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, value: e.target.value } : x)))
                    }
                    className={cn(inputCls, "flex-1")}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setTestFields((prev) => prev.filter((_, xi) => xi !== i))}
                  className="rounded-full p-1.5 text-sts-subtle hover:text-red-500"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTestFields((prev) => [...prev, { key: "", value: "" }])}
              className="inline-flex items-center gap-1 rounded-full border border-sts-card-border px-2 py-1 font-sans text-[11.5px] text-sts-muted hover:text-sts-foreground"
            >
              <Plus className="size-3" /> Add field
            </button>
            <button
              type="button"
              onClick={runTest}
              disabled={testing}
              className="inline-flex items-center gap-1 rounded-full bg-sts-blue px-3 py-1 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90 disabled:opacity-60"
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
                    <span className="text-sts-muted">→ {ev.actions.map((a) => actionLabel(a.type)).join(", ")}</span>
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
          scopeName={departmentName}
          creating={creating}
          onCancel={() => setShowNewRule(false)}
          onCreate={createRule}
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
          if (pendingDelete) await deleteRule(pendingDelete.id);
        }}
      />
    </div>
  );
}

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
        className="sts-glass-panel sts-modal-enter flex w-full max-w-md flex-col overflow-hidden rounded-[8px] ring-1 ring-white/35 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-sts-card-border px-[22px]">
          <h2 className="sts-text-modal-title">New automation rule</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={creating}
            className="flex size-7 items-center justify-center rounded-full text-sts-muted hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-50"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-[22px] py-5">
          <p className="font-sans text-[11.5px] text-sts-muted">
            Create the rule for <span className="font-medium text-sts-foreground">{scopeName}</span>. All
            sub-departments inherit department rules. Add conditions and actions on the card after creating.
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
              <span className="font-sans text-[11px] text-sts-muted">
                Start evaluating this rule on new tickets right away.
              </span>
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
            onClick={() => onCreate({ name: name.trim(), enabled, stopProcessing })}
            disabled={!canSubmit}
            className="flex h-8 items-center gap-1.5 rounded-full bg-sts-blue px-3 font-sans text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-gray-900"
          >
            {creating ? "Creating…" : "Create rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  index,
  total,
  fields,
  slaPolicies,
  members,
  subDepartments,
  saving,
  onChange,
  onSave,
  onDelete,
  onMove,
}: {
  rule: Rule;
  index: number;
  total: number;
  fields: RuleFormField[];
  slaPolicies: SlaPolicyLite[];
  members: MemberOption[];
  subDepartments: SubDepartmentOption[];
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
          className="rounded-full p-1 text-sts-subtle hover:text-sts-foreground disabled:opacity-30"
          title="Move up"
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          className="rounded-full p-1 text-sts-subtle hover:text-sts-foreground disabled:opacity-30"
          title="Move down"
        >
          <ArrowDown className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full p-1.5 text-sts-subtle hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
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

      <RuleConditionsEditor
        conditions={rule.conditions}
        fields={fields}
        onChange={(conditions) => onChange({ ...rule, conditions })}
      />
      <ActionsEditor
        actions={rule.actions}
        slaPolicies={slaPolicies}
        members={members}
        subDepartments={subDepartments}
        onChange={(actions) => onChange({ ...rule, actions })}
      />

      <div className="mt-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-full bg-sts-blue px-3 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-sts-blue/90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save rule"}
        </button>
      </div>
    </div>
  );
}

function ActionsEditor({
  actions,
  slaPolicies,
  members,
  subDepartments,
  onChange,
}: {
  actions: RuleAction[];
  slaPolicies: SlaPolicyLite[];
  members: MemberOption[];
  subDepartments: SubDepartmentOption[];
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
              onChange={(e) => {
                const type = e.target.value as RuleActionType;
                onChange(
                  actions.map((x, xi) =>
                    xi === ai
                      ? { type, params: defaultParamsForAction(type, members, subDepartments) }
                      : x,
                  ),
                );
              }}
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
              members={members}
              subDepartments={subDepartments}
              onChange={(params) => onChange(actions.map((x, xi) => (xi === ai ? { ...x, params } : x)))}
            />
            <button
              type="button"
              onClick={() => onChange(actions.filter((_, xi) => xi !== ai))}
              className="rounded-full p-1.5 text-sts-subtle hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange([
              ...actions,
              {
                type: "assign_agent",
                params: defaultParamsForAction("assign_agent", members, subDepartments),
              },
            ])
          }
          className="inline-flex w-fit items-center gap-1 rounded-full border border-sts-card-border px-2 py-1 font-sans text-[11px] text-sts-muted hover:text-sts-foreground"
        >
          <Plus className="size-3" /> Add action
        </button>
      </div>
    </div>
  );
}

function ActionParams({
  action,
  slaPolicies,
  members,
  subDepartments,
  onChange,
}: {
  action: RuleAction;
  slaPolicies: SlaPolicyLite[];
  members: MemberOption[];
  subDepartments: SubDepartmentOption[];
  onChange: (params: Record<string, unknown>) => void;
}) {
  const p = (action.params ?? {}) as Record<string, string>;
  const set = (key: string, value: string) => onChange({ ...p, [key]: value });

  switch (action.type) {
    case "assign_agent": {
      const known = members.some((m) => m.id === p.agentId);
      return (
        <select
          value={known ? p.agentId : ""}
          onChange={(e) => set("agentId", e.target.value)}
          className={cn(inputCls, "flex-1")}
          aria-label="Assign to agent"
        >
          <option value="">{members.length === 0 ? "No agents in department" : "Select agent…"}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.subDepartmentName ? `${m.name} · ${m.subDepartmentName}` : m.name}
            </option>
          ))}
        </select>
      );
    }
    case "assign_group": {
      const known = subDepartments.some((s) => s.id === p.subDepartmentId);
      return (
        <select
          value={known ? p.subDepartmentId : ""}
          onChange={(e) => set("subDepartmentId", e.target.value)}
          className={cn(inputCls, "flex-1")}
          aria-label="Assign to group"
        >
          <option value="">
            {subDepartments.length === 0 ? "No sub-departments" : "Select sub-department…"}
          </option>
          {subDepartments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      );
    }
    case "set_priority":
      return (
        <select
          value={PRIORITIES.includes(p.priority as (typeof PRIORITIES)[number]) ? p.priority : TicketPriority.Medium}
          onChange={(e) => set("priority", e.target.value)}
          className={cn(inputCls, "flex-1")}
        >
          {PRIORITIES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      );
    case "set_category":
      return (
        <select
          value={p.category ?? ""}
          onChange={(e) => set("category", e.target.value)}
          className={cn(inputCls, "flex-1")}
        >
          <option value="">Select category…</option>
          {CATEGORIES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      );
    case "set_tag":
      return (
        <input
          placeholder="tag / label"
          value={p.tag ?? ""}
          onChange={(e) => set("tag", e.target.value)}
          className={cn(inputCls, "flex-1")}
        />
      );
    case "apply_sla":
      return (
        <select
          value={p.slaPolicyId ?? ""}
          onChange={(e) => set("slaPolicyId", e.target.value)}
          className={cn(inputCls, "flex-1")}
        >
          <option value="">Select SLA policy…</option>
          {slaPolicies.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      );
    case "change_column":
      return (
        <input
          placeholder="status label (e.g. IN PROGRESS)"
          value={p.status ?? ""}
          onChange={(e) => set("status", e.target.value)}
          className={cn(inputCls, "flex-1")}
        />
      );
    case "send_notification": {
      const known = members.some((m) => m.id === p.recipientId);
      return (
        <>
          <select
            value={known ? p.recipientId : ""}
            onChange={(e) => set("recipientId", e.target.value)}
            className={cn(inputCls, "min-w-[150px] flex-1")}
            aria-label="Notify recipient"
          >
            <option value="">{members.length === 0 ? "No agents in department" : "Select recipient…"}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            placeholder="message (optional)"
            value={p.message ?? ""}
            onChange={(e) => set("message", e.target.value)}
            className={cn(inputCls, "flex-1")}
          />
        </>
      );
    }
    default:
      return null;
  }
}
