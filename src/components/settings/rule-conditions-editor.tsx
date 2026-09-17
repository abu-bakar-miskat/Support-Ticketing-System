"use client";

import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Condition shapes mirrored from lib/rules-engine.ts (UI-only). */
export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "is_empty";

export type RuleCondition = { fieldId: string; operator: ConditionOperator; value?: string };
export type RuleConditionGroup = { combinator: "AND" | "OR"; conditions: RuleCondition[] };

/** A support-form field available for condition targeting. */
export type RuleFormField = {
  id: string;
  label: string;
  type: string;
  options: string[];
  /** Optional form name when fields are aggregated across forms. */
  formName?: string;
};

export const CONDITION_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "is_empty", label: "is empty" },
];

const inputCls =
  "h-8 rounded-lg border border-sts-card-border bg-sts-surface px-2.5 font-sans text-[12.5px] text-sts-foreground outline-none transition-colors focus:border-sts-blue/60 focus:ring-2 focus:ring-sts-blue/15";

/** Map a persisted IntakeFormField row into the picker shape. */
export function toRuleFormField(
  field: { id: string; label: string; type: string; options?: unknown },
  formName?: string,
): RuleFormField {
  const options = Array.isArray(field.options)
    ? field.options.filter((o): o is string => typeof o === "string")
    : [];
  return {
    id: field.id,
    label: field.label,
    type: field.type,
    options,
    ...(formName ? { formName } : {}),
  };
}

export function conditionsSummary(
  group: RuleConditionGroup,
  fields?: readonly RuleFormField[],
): string {
  if (group.conditions.length === 0) return "Any ticket";
  const labelById = new Map((fields ?? []).map((f) => [f.id, f.label] as const));
  if (group.conditions.length === 1) {
    const c = group.conditions[0];
    const fieldLabel = labelById.get(c.fieldId) ?? (c.fieldId || "field");
    const op = CONDITION_OPERATORS.find((o) => o.value === c.operator)?.label ?? c.operator;
    if (c.operator === "is_empty") return `${fieldLabel} is empty`;
    return `${fieldLabel} ${op} ${c.value ?? "…"}`;
  }
  return `${group.combinator === "AND" ? "All" : "Any"} of ${group.conditions.length} conditions`;
}

function fieldDisplayLabel(field: RuleFormField): string {
  return field.formName ? `${field.formName} · ${field.label}` : field.label;
}

function valueChoices(field: RuleFormField | undefined): string[] | null {
  if (!field) return null;
  if (field.options.length > 0) return field.options;
  if (field.type === "checkbox") return ["true", "false"];
  return null;
}

type ConditionsEditorProps = {
  conditions: RuleConditionGroup;
  onChange: (c: RuleConditionGroup) => void;
  /** When provided, field id is chosen from this form's fields (by label). */
  fields?: readonly RuleFormField[];
  className?: string;
};

/**
 * Condition builder for automation / assignment rules. When `fields` is set,
 * admins pick from the support form's field labels (and option values where
 * available) instead of typing raw field ids.
 */
export function RuleConditionsEditor({
  conditions,
  onChange,
  fields,
  className,
}: ConditionsEditorProps) {
  const hasFields = (fields?.length ?? 0) > 0;
  const fieldById = new Map((fields ?? []).map((f) => [f.id, f] as const));

  function patchCondition(index: number, patch: Partial<RuleCondition>) {
    onChange({
      ...conditions,
      conditions: conditions.conditions.map((x, xi) => (xi === index ? { ...x, ...patch } : x)),
    });
  }

  return (
    <div className={cn("mt-3", className)}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-sts-subtle">When</span>
        <select
          value={conditions.combinator}
          onChange={(e) => onChange({ ...conditions, combinator: e.target.value as "AND" | "OR" })}
          className={inputCls}
          aria-label="Condition combinator"
        >
          <option value="AND">all (AND)</option>
          <option value="OR">any (OR)</option>
        </select>
        <span className="font-sans text-[11px] text-sts-subtle">of these match</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {conditions.conditions.map((c, ci) => {
          const selected = fieldById.get(c.fieldId);
          const choices = valueChoices(selected);
          const orphaned = c.fieldId && hasFields && !selected;
          const useValueSelect =
            !!choices && (c.operator === "equals" || c.operator === "not_equals");

          return (
            <div key={ci} className="flex flex-wrap items-center gap-2">
              {hasFields ? (
                <select
                  value={c.fieldId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const nextField = fieldById.get(nextId);
                    const nextChoices = valueChoices(nextField);
                    patchCondition(ci, {
                      fieldId: nextId,
                      // Reset value when switching to a choice field so we don't keep stale free text.
                      value:
                        nextChoices && nextChoices.length > 0 && !nextChoices.includes(c.value ?? "")
                          ? nextChoices[0]
                          : c.value,
                    });
                  }}
                  className={cn(inputCls, "min-w-[10rem] max-w-[16rem]")}
                  aria-label="Form field"
                >
                  <option value="">Select field…</option>
                  {(fields ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {fieldDisplayLabel(f)}
                    </option>
                  ))}
                  {orphaned && (
                    <option value={c.fieldId}>
                      {c.fieldId} (removed field)
                    </option>
                  )}
                </select>
              ) : (
                <input
                  placeholder="field id"
                  value={c.fieldId}
                  onChange={(e) => patchCondition(ci, { fieldId: e.target.value })}
                  className={cn(inputCls, "w-40")}
                  aria-label="Field id"
                />
              )}
              <select
                value={c.operator}
                onChange={(e) =>
                  patchCondition(ci, { operator: e.target.value as ConditionOperator })
                }
                className={inputCls}
                aria-label="Operator"
              >
                {CONDITION_OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {c.operator !== "is_empty" &&
                (useValueSelect ? (
                  <select
                    value={c.value ?? ""}
                    onChange={(e) => patchCondition(ci, { value: e.target.value })}
                    className={cn(inputCls, "min-w-[8rem] flex-1")}
                    aria-label="Field value"
                  >
                    <option value="">Select value…</option>
                    {choices!.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    placeholder="value"
                    value={c.value ?? ""}
                    onChange={(e) => patchCondition(ci, { value: e.target.value })}
                    className={cn(inputCls, "min-w-[8rem] flex-1")}
                    aria-label="Field value"
                  />
                ))}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...conditions,
                    conditions: conditions.conditions.filter((_, xi) => xi !== ci),
                  })
                }
                className="rounded-full p-1.5 text-sts-subtle hover:text-red-500"
                aria-label="Remove condition"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...conditions,
              conditions: [
                ...conditions.conditions,
                {
                  fieldId: hasFields ? (fields![0]?.id ?? "") : "",
                  operator: "equals",
                  value: valueChoices(fields?.[0])?.[0] ?? "",
                },
              ],
            })
          }
          className="inline-flex w-fit items-center gap-1 rounded-full border border-sts-card-border px-2 py-1 font-sans text-[11px] text-sts-muted hover:text-sts-foreground"
        >
          <Plus className="size-3" /> Add condition
        </button>
        {conditions.conditions.length === 0 && (
          <p className="font-sans text-[11px] text-sts-subtle">
            {hasFields
              ? "No conditions — matches every ticket from this form. Add a condition to match a form field value."
              : "No conditions — matches every ticket."}
          </p>
        )}
        {hasFields && conditions.conditions.length > 0 && (
          <p className="font-sans text-[11px] text-sts-subtle">
            Fields are from the support form — pick a field and value rather than typing an id.
          </p>
        )}
      </div>
    </div>
  );
}
