"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  Filter,
  Repeat,
  Scale,
  Hand,
  Layers,
  FileText,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MemberOption } from "@/components/ui/issue-assignee-select";

type AssignmentMethod = "RULE_BASED" | "ROUND_ROBIN" | "WORKLOAD_BASED" | "MANUAL";

type AssignmentRule = {
  id: string;
  name: string;
  conditions: { combinator: "AND" | "OR"; conditions: unknown[] };
  agentId: string;
  enabled: boolean;
  order: number;
  formConfigId: string | null;
};

type FormAssignment = {
  id: string;
  name: string;
  /** null = inherit the sub-department's (then department's) method. */
  assignmentMethod: AssignmentMethod | null;
};

type MethodMeta = {
  value: AssignmentMethod;
  label: string;
  description: string;
  icon: typeof Filter;
  /** Identity tint for the method's icon chip. */
  chip: string;
};

const METHODS: MethodMeta[] = [
  {
    value: "RULE_BASED",
    label: "Rule-based",
    description: "Conditions decide which specific agent gets each ticket.",
    icon: Filter,
    chip: "bg-pen-purple-tint text-pen-purple",
  },
  {
    value: "ROUND_ROBIN",
    label: "Round-robin",
    description: "Strict rotation through the team, in order.",
    icon: Repeat,
    chip: "bg-pen-blue-tint text-pen-blue",
  },
  {
    value: "WORKLOAD_BASED",
    label: "Workload-based",
    description: "Always goes to whoever has the fewest open tickets.",
    icon: Scale,
    chip: "bg-pen-green-tint text-pen-green",
  },
  {
    value: "MANUAL",
    label: "Manual",
    description: "Tickets are created unassigned; a human picks the agent.",
    icon: Hand,
    chip: "bg-pen-surface text-pen-muted",
  },
];

const methodLabel = (m: AssignmentMethod) =>
  METHODS.find((x) => x.value === m)?.label ?? m;

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// ─── Small presentational helpers ────────────────────────────────────────────

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-pen-card-border bg-pen-card p-5 shadow-[var(--pen-card-shadow)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-sans text-[13.5px] font-semibold text-pen-foreground">{title}</h2>
          {description && <p className="mt-0.5 pen-text-meta">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SkeletonRows({ count = 3, height = "h-9" }: { count?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn("animate-pulse rounded-lg bg-pen-surface", height)} />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AssignmentSettingsPage({
  departmentId,
  departmentName,
  subDepartmentId,
  subDepartmentName,
  members = [],
  backHref = "/settings/departments",
  backLabel = "Back to departments",
}: {
  departmentId: string;
  departmentName: string;
  /** When set, the page edits this sub-department's override instead of the department. */
  subDepartmentId?: string;
  subDepartmentName?: string;
  /** Assignable agents for per-form rule-based rules (agentId picker). */
  members?: MemberOption[];
  backHref?: string;
  backLabel?: string;
}) {
  // `undefined` = still loading; `null` = "inherit from parent" (sub-dept only).
  const [method, setMethod] = useState<AssignmentMethod | null | undefined>(undefined);
  const [parentMethod, setParentMethod] = useState<AssignmentMethod | null>(null);
  const [rules, setRules] = useState<AssignmentRule[] | null>(null);
  const [forms, setForms] = useState<FormAssignment[] | null>(null);
  // What a form set to "Inherit" resolves to (sub-dept → dept → round-robin).
  const [formInheritedMethod, setFormInheritedMethod] = useState<AssignmentMethod>("ROUND_ROBIN");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Per-form staged (unsaved) method selection, keyed by form id. A missing key
  // means "no pending change" (the row matches its persisted value).
  const [draftMethods, setDraftMethods] = useState<Record<string, AssignmentMethod | null>>({});
  const [savingFormId, setSavingFormId] = useState<string | null>(null);
  // Rule-based rules per support form, keyed by form id. `undefined` = not yet
  // loaded (skeleton). See the "support form wise" rules table below.
  const [rulesByForm, setRulesByForm] = useState<Record<string, AssignmentRule[] | undefined>>({});

  const scopeQs = subDepartmentId
    ? `?subDepartmentId=${encodeURIComponent(subDepartmentId)}`
    : "";
  const scopeName = subDepartmentName ?? departmentName;

  const load = () => {
    Promise.all([
      fetch(`/api/departments/${departmentId}/assignment-settings${scopeQs}`).then(jsonOrThrow),
      fetch(`/api/departments/${departmentId}/assignment-rules${scopeQs}`).then(jsonOrThrow),
      fetch(`/api/departments/${departmentId}/form-assignment-methods${scopeQs}`).then(jsonOrThrow),
    ])
      .then(([settingsRes, rulesRes, formsRes]) => {
        setMethod(settingsRes.assignmentMethod ?? null);
        setParentMethod(settingsRes.parentMethod ?? null);
        setRules(rulesRes);
        const formList: FormAssignment[] = formsRes.forms ?? [];
        setForms(formList);
        setFormInheritedMethod(formsRes.inheritedMethod ?? "ROUND_ROBIN");

        // Sub-department scope: rules are support-form wise — load each form's rules.
        if (subDepartmentId && formList.length) {
          Promise.all(
            formList.map((f) =>
              fetch(`/api/departments/${departmentId}/assignment-rules?formConfigId=${encodeURIComponent(f.id)}`)
                .then(jsonOrThrow)
                .then((rs) => [f.id, rs] as const),
            ),
          )
            .then((entries) => setRulesByForm(Object.fromEntries(entries)))
            .catch((e) => setError(e.message));
        }
      })
      .catch((e) => setError(e.message));
  };

  useEffect(load, [departmentId, subDepartmentId]);

  // The method currently shown for a form: its staged draft if one exists,
  // otherwise its persisted value.
  const draftFor = (form: FormAssignment) =>
    form.id in draftMethods ? draftMethods[form.id] : form.assignmentMethod;
  const isDirty = (form: FormAssignment) => draftFor(form) !== form.assignmentMethod;

  function selectFormMethod(form: FormAssignment, next: AssignmentMethod | null) {
    setDraftMethods((prev) => ({ ...prev, [form.id]: next }));
  }

  async function saveFormMethod(form: FormAssignment) {
    const next = draftFor(form);
    setError(null);
    setSavingFormId(form.id);
    try {
      await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/form-assignment-methods`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formConfigId: form.id, assignmentMethod: next, subDepartmentId }),
        }),
      );
      setForms((fs) => fs?.map((f) => (f.id === form.id ? { ...f, assignmentMethod: next } : f)) ?? null);
      // Clear the draft so the row is no longer "dirty" (now matches persisted).
      setDraftMethods((prev) => {
        const copy = { ...prev };
        delete copy[form.id];
        return copy;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update form assignment method");
    } finally {
      setSavingFormId(null);
    }
  }

  // The method a form resolves to right now (staged draft, else persisted, else
  // the inherited sub-department method) — decides whether its rules table shows.
  const resolvedMethodFor = (form: FormAssignment): AssignmentMethod =>
    draftFor(form) ?? formInheritedMethod;

  async function addFormRule(form: FormAssignment) {
    setError(null);
    const defaultAgent = members[0]?.id;
    if (!defaultAgent) {
      setError("Add a team member to this sub-department before creating rules.");
      return;
    }
    try {
      const created: AssignmentRule = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/assignment-rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New rule",
            conditions: { combinator: "AND", conditions: [] },
            agentId: defaultAgent,
            formConfigId: form.id,
          }),
        }),
      );
      setRulesByForm((prev) => ({ ...prev, [form.id]: [...(prev[form.id] ?? []), created] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create rule");
    }
  }

  async function updateFormRule(formId: string, id: string, patch: Partial<AssignmentRule>) {
    setError(null);
    setRulesByForm((prev) => ({
      ...prev,
      [formId]: prev[formId]?.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
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

  async function deleteFormRule(formId: string, id: string) {
    setError(null);
    const prev = rulesByForm[formId];
    setRulesByForm((p) => ({ ...p, [formId]: p[formId]?.filter((x) => x.id !== id) }));
    try {
      await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/assignment-rules/${id}`, { method: "DELETE" }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete rule");
      setRulesByForm((p) => ({ ...p, [formId]: prev }));
    }
  }

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

  const inputClass =
    "rounded-md border border-pen-card-border bg-pen-surface px-2.5 py-1.5 font-sans text-[12.5px] text-pen-foreground outline-none transition-shadow focus:border-pen-blue focus:ring-2 focus:ring-pen-blue/25";

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      {/* ── Header ── */}
      <Link
        href={backHref}
        className="group mb-5 inline-flex items-center gap-1.5 font-sans text-[12px] text-pen-muted transition-colors hover:text-pen-foreground"
      >
        <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
        {backLabel}
      </Link>

      <p className="pen-text-section-label mb-1.5">Assignment</p>
      <h1 className="pen-text-page-title">{scopeName}</h1>
      <p className="mt-1.5 max-w-prose pen-text-page-desc">
        {subDepartmentId
          ? "How new tickets for this sub-department are routed to agents. Inherit the parent department's method, or override it here."
          : "How new tickets for this department are routed to agents."}{" "}
        When no eligible agent is found, tickets stay unassigned and department admins are notified.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-lg border border-pen-red/30 bg-pen-red-tint px-3 py-2.5 font-sans text-[12.5px] text-pen-red"
        >
          <AlertTriangle className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {/* ── Per support form — one card per form ── */}
        {subDepartmentId && (
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="pen-text-section-label">Per support form</h2>
              <p className="mt-1 pen-text-meta">
                Set how tickets from each support form are assigned. “Inherit” uses this
                sub-department&apos;s method ({methodLabel(formInheritedMethod)}).
              </p>
            </div>

            {forms === null ? (
              <SkeletonRows count={2} height="h-44" />
            ) : forms.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-pen-card-border bg-pen-card px-4 py-10 text-center">
                <p className="font-sans text-[12.5px] font-medium text-pen-foreground">No support forms yet</p>
                <p className="mx-auto mt-1 max-w-xs pen-text-meta">
                  Forms that route to this sub-department will appear here.
                </p>
              </div>
            ) : (
              forms.map((form) => (
                <section
                  key={form.id}
                  className="rounded-2xl border border-pen-card-border bg-pen-card p-5 shadow-[var(--pen-card-shadow)]"
                >
                  <div className="mb-4 flex min-w-0 items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-pen-blue-tint text-pen-blue">
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-sans text-[14px] font-semibold tracking-[-0.01em] text-pen-foreground">
                        {form.name}
                      </p>
                      {form.assignmentMethod === null && (
                        <p className="pen-text-meta">Inheriting {methodLabel(formInheritedMethod)}</p>
                      )}
                    </div>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label={`Assignment method for ${form.name}`}
                    className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
                  >
                    <MethodOption
                      selected={draftFor(form) === null}
                      disabled={savingFormId === form.id}
                      onClick={() => selectFormMethod(form, null)}
                      icon={Layers}
                      chip="bg-pen-surface text-pen-subtle"
                      className="sm:col-span-2"
                      label="Inherit"
                      description={`Use this sub-department's method — currently ${methodLabel(formInheritedMethod)}.`}
                    />
                    {METHODS.map((m) => (
                      <MethodOption
                        key={m.value}
                        selected={draftFor(form) === m.value}
                        disabled={savingFormId === form.id}
                        onClick={() => selectFormMethod(form, m.value)}
                        icon={m.icon}
                        chip={m.chip}
                        label={m.label}
                        description={m.description}
                      />
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-3 border-t border-pen-card-border pt-3">
                    {isDirty(form) && (
                      <span className="pen-text-meta">Unsaved changes</span>
                    )}
                    <button
                      type="button"
                      onClick={() => saveFormMethod(form)}
                      disabled={!isDirty(form) || savingFormId === form.id}
                      className="pen-pressable inline-flex items-center gap-1.5 rounded-md bg-pen-blue px-3 py-1.5 font-sans text-[12px] font-medium text-white transition-colors hover:bg-pen-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingFormId === form.id && <Loader2 className="size-3.5 animate-spin" />}
                      Save
                    </button>
                  </div>

                  {/* Rules for this form — support form wise, shown as a table. */}
                  {resolvedMethodFor(form) === "RULE_BASED" && (
                    <FormRulesTable
                      rules={rulesByForm[form.id]}
                      members={members}
                      inputClass={inputClass}
                      onAdd={() => addFormRule(form)}
                      onUpdate={(id, patch) => updateFormRule(form.id, id, patch)}
                      onDelete={(id) => deleteFormRule(form.id, id)}
                    />
                  )}
                </section>
              ))
            )}
          </div>
        )}

        {/* ── Method selector — department scope only; sub-departments configure per form ── */}
        {!subDepartmentId && (
        <SectionCard
          title="Method"
          description="The default for every ticket in this department."
        >
          {method === undefined ? (
            <SkeletonRows count={3} height="h-[68px]" />
          ) : (
            <div role="radiogroup" aria-label="Assignment method" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {subDepartmentId && (
                <MethodOption
                  selected={method === null}
                  disabled={saving}
                  onClick={() => changeMethod(null)}
                  icon={Layers}
                  chip="bg-pen-surface text-pen-subtle"
                  className="sm:col-span-2"
                  label="Inherit from parent department"
                  description={
                    parentMethod
                      ? `Use the department's method — currently ${methodLabel(parentMethod)}.`
                      : "Use the department's method."
                  }
                />
              )}
              {METHODS.map((m) => (
                <MethodOption
                  key={m.value}
                  selected={method === m.value}
                  disabled={saving}
                  onClick={() => changeMethod(m.value)}
                  icon={m.icon}
                  chip={m.chip}
                  label={m.label}
                  description={m.description}
                />
              ))}
            </div>
          )}
        </SectionCard>
        )}

        {/* ── Rule-based rules (department scope only; sub-departments configure per form) ── */}
        {!subDepartmentId && method === "RULE_BASED" && (
          <SectionCard
            title="Rules"
            description="Checked top to bottom — the first matching rule assigns its agent."
            action={
              <button
                type="button"
                onClick={addRule}
                className="pen-pressable inline-flex items-center gap-1 rounded-md bg-pen-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white transition-colors hover:bg-pen-blue/90"
              >
                <Plus className="size-3.5" /> Add rule
              </button>
            }
          >
            {rules === null ? (
              <SkeletonRows count={2} height="h-[92px]" />
            ) : rules.length === 0 ? (
              <div className="rounded-lg border border-dashed border-pen-card-border px-4 py-8 text-center">
                <p className="font-sans text-[12.5px] font-medium text-pen-foreground">No rules yet</p>
                <p className="mx-auto mt-1 max-w-xs pen-text-meta">
                  Tickets will fail to auto-assign until you add at least one rule.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {rules.map((rule, i) => (
                  <div key={rule.id} className="rounded-xl border border-pen-card-border bg-pen-surface/40 p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-pen-card font-sans text-[11px] font-semibold text-pen-subtle ring-1 ring-pen-card-border">
                        {i + 1}
                      </span>
                      <input
                        value={rule.name}
                        onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                        placeholder="Rule name"
                        className={cn(inputClass, "min-w-0 flex-1 font-medium")}
                      />
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 font-sans text-[11.5px] text-pen-muted">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                          className="size-3.5 accent-pen-blue"
                        />
                        Enabled
                      </label>
                      <button
                        type="button"
                        onClick={() => deleteRule(rule.id)}
                        aria-label="Delete rule"
                        className="pen-pressable rounded-md p-1.5 text-pen-subtle transition-colors hover:bg-pen-red-tint hover:text-pen-red"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <label className="font-sans text-[11.5px] text-pen-muted" htmlFor={`agent-${rule.id}`}>
                        Agent (user id)
                      </label>
                      <input
                        id={`agent-${rule.id}`}
                        value={rule.agentId}
                        onChange={(e) => updateRule(rule.id, { agentId: e.target.value })}
                        placeholder="Paste a user id"
                        className={cn(inputClass, "w-64 font-mono text-[11.5px]")}
                      />
                    </div>
                    <p className="mt-2 pen-text-meta">
                      {rule.conditions.conditions.length === 0
                        ? "Applies to every ticket (no conditions)."
                        : `${rule.conditions.conditions.length} condition(s) — edit via the API for now.`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
}

// ─── Per-form rules table ─────────────────────────────────────────────────────

function FormRulesTable({
  rules,
  members,
  inputClass,
  onAdd,
  onUpdate,
  onDelete,
}: {
  rules: AssignmentRule[] | undefined;
  members: MemberOption[];
  inputClass: string;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<AssignmentRule>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="mt-4 border-t border-pen-card-border pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-sans text-[12.5px] font-semibold text-pen-foreground">Rules</h3>
          <p className="mt-0.5 pen-text-meta">
            Checked top to bottom — the first matching rule assigns its agent.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="pen-pressable inline-flex shrink-0 items-center gap-1 rounded-md bg-pen-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white transition-colors hover:bg-pen-blue/90"
        >
          <Plus className="size-3.5" /> Add rule
        </button>
      </div>

      {rules === undefined ? (
        <SkeletonRows count={2} height="h-10" />
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-pen-card-border px-4 py-8 text-center">
          <p className="font-sans text-[12.5px] font-medium text-pen-foreground">No rules yet</p>
          <p className="mx-auto mt-1 max-w-xs pen-text-meta">
            Tickets from this form will fail to auto-assign until you add at least one rule.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-pen-card-border">
          <table className="w-full border-collapse font-sans text-[12.5px]">
            <thead>
              <tr className="border-b border-pen-card-border bg-pen-surface/50 text-left">
                <th className="w-10 px-3 py-2 font-medium text-pen-subtle">#</th>
                <th className="px-3 py-2 font-medium text-pen-subtle">Rule</th>
                <th className="px-3 py-2 font-medium text-pen-subtle">Assign to</th>
                <th className="px-3 py-2 font-medium text-pen-subtle">Conditions</th>
                <th className="w-20 px-3 py-2 text-center font-medium text-pen-subtle">Enabled</th>
                <th className="w-12 px-3 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => (
                <tr key={rule.id} className="border-b border-pen-card-border last:border-0">
                  <td className="px-3 py-2 align-middle">
                    <span className="flex size-6 items-center justify-center rounded-md bg-pen-surface font-sans text-[11px] font-semibold text-pen-subtle ring-1 ring-pen-card-border">
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      value={rule.name}
                      onChange={(e) => onUpdate(rule.id, { name: e.target.value })}
                      placeholder="Rule name"
                      className={cn(inputClass, "w-full min-w-[140px] font-medium")}
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <AgentSelect
                      value={rule.agentId}
                      members={members}
                      inputClass={inputClass}
                      onChange={(agentId) => onUpdate(rule.id, { agentId })}
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <span className="pen-text-meta">
                      {rule.conditions.conditions.length === 0
                        ? "Any ticket"
                        : `${rule.conditions.conditions.length} condition(s)`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => onUpdate(rule.id, { enabled: e.target.checked })}
                      className="size-3.5 accent-pen-blue"
                      aria-label={`Enable ${rule.name}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right align-middle">
                    <button
                      type="button"
                      onClick={() => onDelete(rule.id)}
                      aria-label="Delete rule"
                      className="pen-pressable rounded-md p-1.5 text-pen-subtle transition-colors hover:bg-pen-red-tint hover:text-pen-red"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AgentSelect({
  value,
  members,
  inputClass,
  onChange,
}: {
  value: string;
  members: MemberOption[];
  inputClass: string;
  onChange: (id: string) => void;
}) {
  const known = members.some((m) => m.id === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputClass, "w-full min-w-[150px]")}
      aria-label="Assign to"
    >
      {!known && <option value={value}>{value ? "Unknown agent" : "Select agent…"}</option>}
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

// ─── Method option card ───────────────────────────────────────────────────────

function MethodOption({
  selected,
  disabled,
  onClick,
  icon: Icon,
  chip,
  label,
  description,
  className,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: typeof Filter;
  chip: string;
  label: string;
  description: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pen-blue/40",
        selected
          ? "border-pen-blue bg-pen-blue-tint ring-1 ring-pen-blue"
          : "border-pen-card-border hover:border-pen-blue/40 hover:bg-pen-surface/60",
        className,
      )}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", chip)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-[12.5px] font-semibold text-pen-foreground">{label}</span>
        <span className="mt-0.5 block pen-text-meta">{description}</span>
      </span>
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full transition-colors",
          selected ? "bg-pen-blue text-white" : "border border-pen-card-border",
        )}
      >
        {selected && <Check className="size-3" />}
      </span>
    </button>
  );
}
