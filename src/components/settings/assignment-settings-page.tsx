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
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MemberOption } from "@/components/ui/issue-assignee-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RuleConditionsEditor,
  conditionsSummary,
  toRuleFormField,
  type RuleConditionGroup,
  type RuleFormField,
} from "@/components/settings/rule-conditions-editor";

type AssignmentMethod = "RULE_BASED" | "ROUND_ROBIN" | "WORKLOAD_BASED" | "MANUAL" | "MANUAL_SELECT";

type AssignmentRule = {
  id: string;
  name: string;
  conditions: RuleConditionGroup;
  agentId: string;
  enabled: boolean;
  order: number;
  formConfigId: string | null;
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
    chip: "bg-sts-purple-tint text-sts-purple",
  },
  {
    value: "ROUND_ROBIN",
    label: "Round-robin",
    description: "Strict rotation through the sub department, in order.",
    icon: Repeat,
    chip: "bg-sts-blue-tint text-sts-blue",
  },
  {
    value: "WORKLOAD_BASED",
    label: "Workload-based",
    description: "Always goes to whoever has the fewest open tickets.",
    icon: Scale,
    chip: "bg-sts-green-tint text-sts-green",
  },
  {
    value: "MANUAL",
    label: "Manual",
    description: "Tickets are created unassigned; a human picks the agent.",
    icon: Hand,
    chip: "bg-sts-surface text-sts-muted",
  },
];

const methodLabel = (m: AssignmentMethod) =>
  // MANUAL_SELECT is configured on the sub-department mailbox page (member
  // picker), so it's not one of the METHODS cards here — give it a readable
  // fallback rather than showing the raw enum value.
  METHODS.find((x) => x.value === m)?.label ?? (m === "MANUAL_SELECT" ? "Manual user" : m);

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
    <section className="rounded-2xl border border-sts-card-border bg-sts-card p-5 shadow-[var(--sts-card-shadow)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">{title}</h2>
          {description && <p className="mt-0.5 sts-text-meta">{description}</p>}
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
        <div key={i} className={cn("animate-pulse rounded-lg bg-sts-surface", height)} />
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
  subDepartments,
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
  /** Sub-departments of this department — powers the department page's scope dropdown. */
  subDepartments?: { id: string; name: string }[];
  backHref?: string;
  backLabel?: string;
}) {
  // `undefined` = still loading; `null` = "inherit from parent" (sub-dept only).
  const [method, setMethod] = useState<AssignmentMethod | null | undefined>(undefined);
  const [parentMethod, setParentMethod] = useState<AssignmentMethod | null>(null);
  const [rules, setRules] = useState<AssignmentRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Condition fields for the rules editor — the union of every department form's
  // fields (support forms are department-wide; a sub-department receives tickets
  // from any of them via issue routing).
  const [departmentFields, setDepartmentFields] = useState<RuleFormField[]>([]);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  // Department page only: a dropdown to view/manage a specific sub-department's
  // assignment. "" = the department itself; a sub-department id = that sub-dept's
  // policy surface. (The dedicated sub-department route sets subDepartmentId.)
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

  const scopeQs = activeSubId ? `?subDepartmentId=${encodeURIComponent(activeSubId)}` : "";
  const scopeName = activeSubName ?? departmentName;

  const load = () => {
    // Reset to loading state so a scope switch doesn't flash the old scope's data.
    setMethod(undefined);
    setRules(null);
    setDepartmentFields([]);
    setExpandedRuleId(null);
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

    // Rule conditions match against form-field values, so the picker offers the
    // union of every department form's fields — the same set at department and
    // sub-department scope, since a sub-department receives tickets from any
    // department form via issue routing.
    fetch(`/api/departments/${departmentId}/forms`)
      .then(jsonOrThrow)
      .then(async (deptForms: { id: string; name: string }[]) => {
        const lists = await Promise.all(
          deptForms.map(async (f) => {
            const rawFields = await fetch(`/api/intake/forms/${f.id}/fields`)
              .then(jsonOrThrow)
              .catch(() => [] as { id: string; label: string; type: string; options?: unknown }[]);
            return (rawFields as { id: string; label: string; type: string; options?: unknown }[]).map(
              (field) => toRuleFormField(field, f.name),
            );
          }),
        );
        setDepartmentFields(lists.flat());
      })
      .catch(() => setDepartmentFields([]));
  };

  useEffect(load, [departmentId, activeSubId]);

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
            activeSubId
              ? { assignmentMethod: next, subDepartmentId: activeSubId }
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
    // The API requires an agent, so seed the rule with the first available member;
    // the admin can reassign it afterwards via the "Assign to" picker.
    const defaultAgent = members[0]?.id;
    if (!defaultAgent) {
      setError("Add a member to this department before creating rules.");
      return;
    }
    try {
      const created = await jsonOrThrow(
        await fetch(`/api/departments/${departmentId}/assignment-rules${scopeQs}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New rule",
            conditions: { combinator: "AND", conditions: [] },
            agentId: defaultAgent,
            ...(activeSubId ? { subDepartmentId: activeSubId } : {}),
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
    "rounded-md border border-sts-card-border bg-sts-surface px-2.5 py-1.5 font-sans text-[12.5px] text-sts-foreground outline-none transition-shadow focus:border-sts-blue focus:ring-2 focus:ring-sts-blue/25";

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      {/* ── Header ── */}
      <Link
        href={backHref}
        className="group mb-5 inline-flex items-center gap-1.5 font-sans text-[12px] text-sts-muted transition-colors hover:text-sts-foreground"
      >
        <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
        {backLabel}
      </Link>

      <p className="sts-text-section-label mb-1.5">Assignment</p>
      <h1 className="sts-text-page-title">{scopeName}</h1>
      <p className="mt-1.5 max-w-prose sts-text-page-desc">
        {activeSubId
          ? "How new tickets for this sub-department are routed to agents. Inherit the parent department's method, or override it here."
          : "How new tickets for this department are routed to agents."}{" "}
        When no eligible agent is found, tickets stay unassigned and department admins are notified.
      </p>

      {showScopeSelect && (
        <div className="mt-5 flex items-center gap-2">
          <label className="font-sans text-[12px] font-medium text-sts-muted">Sub-department</label>
          <Select items={scopeOptions} value={activeScope} onValueChange={(v) => setActiveScope(v ?? "")}>
            <SelectTrigger className="w-60 border-sts-blue/30 bg-sts-blue-tint font-sans text-[12.5px] font-medium text-sts-blue hover:bg-sts-blue/10">
              <Layers className="size-3.5 text-sts-blue" />
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
        <div
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-full border border-sts-red/30 bg-sts-red-tint px-3 py-2.5 font-sans text-[12.5px] text-sts-red"
        >
          <AlertTriangle className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {/* ── Method selector ──
            Department scope: the department-wide default.
            Sub-department scope: the sub-department's own method, which defaults
            to inheriting the parent department. Support forms are department-wide
            and route to a sub-department via their issues, so tickets that land
            here follow this method. */}
        <SectionCard
          title="Method"
          description={
            activeSubId
              ? "Applies to every ticket routed to this sub-department (via a support form's issue)."
              : "The default for every ticket in this department."
          }
        >
          {method === undefined ? (
            <SkeletonRows count={3} height="h-[68px]" />
          ) : (
            <div role="radiogroup" aria-label="Assignment method" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {activeSubId && (
                <MethodOption
                  selected={method === null}
                  disabled={saving}
                  onClick={() => changeMethod(null)}
                  icon={Layers}
                  chip="bg-sts-surface text-sts-subtle"
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

        {/* ── Rule-based rules — shown at whichever scope's method is RULE_BASED.
            Department scope edits department-wide rules; sub-department scope
            edits that sub-department's own rules (both loaded via scopeQs). ── */}
        {method === "RULE_BASED" && (
          <SectionCard
            title="Rules"
            description="Checked top to bottom — the first matching rule assigns its agent."
            action={
              <button
                type="button"
                onClick={addRule}
                className="sts-pressable inline-flex items-center gap-1 rounded-full bg-sts-blue px-2.5 py-1.5 font-sans text-[12px] font-medium text-white transition-colors hover:bg-sts-blue/90"
              >
                <Plus className="size-3.5" /> Add rule
              </button>
            }
          >
            {rules === null ? (
              <SkeletonRows count={2} height="h-[92px]" />
            ) : rules.length === 0 ? (
              <div className="rounded-lg border border-dashed border-sts-card-border px-4 py-8 text-center">
                <p className="font-sans text-[12.5px] font-medium text-sts-foreground">No rules yet</p>
                <p className="mx-auto mt-1 max-w-xs sts-text-meta">
                  Tickets will fail to auto-assign until you add at least one rule.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {rules.map((rule, i) => {
                  const expanded = expandedRuleId === rule.id;
                  return (
                    <div key={rule.id} className="rounded-xl border border-sts-card-border bg-sts-surface/40 p-3">
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sts-card font-sans text-[11px] font-semibold text-sts-subtle ring-1 ring-sts-card-border">
                          {i + 1}
                        </span>
                        <input
                          value={rule.name}
                          onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                          placeholder="Rule name"
                          className={cn(inputClass, "min-w-0 flex-1 font-medium")}
                        />
                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 font-sans text-[11.5px] text-sts-muted">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                            className="size-3.5 accent-sts-blue"
                          />
                          Enabled
                        </label>
                        <button
                          type="button"
                          onClick={() => deleteRule(rule.id)}
                          aria-label="Delete rule"
                          className="sts-pressable rounded-full p-1.5 text-sts-subtle transition-colors hover:bg-sts-red-tint hover:text-sts-red"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <label className="font-sans text-[11.5px] text-sts-muted" htmlFor={`agent-${rule.id}`}>
                          Assign to
                        </label>
                        <AgentSelect
                          value={rule.agentId}
                          members={members}
                          inputClass={inputClass}
                          onChange={(agentId) => updateRule(rule.id, { agentId })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedRuleId((cur) => (cur === rule.id ? null : rule.id))}
                        className="mt-2 font-sans text-[11.5px] text-sts-blue hover:underline"
                      >
                        {expanded
                          ? "Hide conditions"
                          : conditionsSummary(rule.conditions, departmentFields)}
                      </button>
                      {expanded && (
                        <RuleConditionsEditor
                          conditions={rule.conditions}
                          fields={departmentFields}
                          onChange={(conditions) => updateRule(rule.id, { conditions })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        )}
      </div>
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-blue/40",
        selected
          ? "border-sts-blue bg-sts-blue-tint ring-1 ring-sts-blue"
          : "border-sts-card-border hover:border-sts-blue/40 hover:bg-sts-surface/60",
        className,
      )}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", chip)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-[12.5px] font-semibold text-sts-foreground">{label}</span>
        <span className="mt-0.5 block sts-text-meta">{description}</span>
      </span>
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full transition-colors",
          selected ? "bg-sts-blue text-white" : "border border-sts-card-border",
        )}
      >
        {selected && <Check className="size-3" />}
      </span>
    </button>
  );
}
