"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SupportField = {
  id: string;
  label: string;
  type: string;
  isRequired: boolean;
};

export type SupportSlaRule = {
  id: string;
  name: string;
  firstResponseMins: number;
  resolutionMins: number;
};

const FIELD_TYPES = ["text", "email", "number", "select", "date", "checkbox"] as const;

export function SupportTemplateConfig({
  departmentId,
  departmentName,
  formId: initialFormId,
  fields: initialFields,
  slaRules: initialRules,
}: {
  departmentId: string;
  departmentName: string;
  formId: string | null;
  fields: SupportField[];
  slaRules: SupportSlaRule[];
}) {
  const router = useRouter();
  const [formId, setFormId] = useState(initialFormId);
  const [fields, setFields] = useState(initialFields);
  const [rules, setRules] = useState(initialRules);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingField, setSavingField] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<(typeof FIELD_TYPES)[number]>("text");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState("");

  const [ruleName, setRuleName] = useState("");
  const [firstResponseMins, setFirstResponseMins] = useState("60");
  const [resolutionMins, setResolutionMins] = useState("480");

  async function ensureForm(): Promise<string | null> {
    if (formId) return formId;
    const res = await fetch("/api/intake/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Support", departmentId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Failed to create the Support form");
      return null;
    }
    setFormId(body.id);
    return body.id as string;
  }

  async function addField() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setSavingField(true);
    setError(null);
    setNotice(null);
    const id = await ensureForm();
    if (!id) {
      setSavingField(false);
      return;
    }
    const res = await fetch(`/api/intake/forms/${id}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: trimmed,
        type: fieldType,
        isRequired: required,
        options: fieldType === "select" ? options.split(",").map((o) => o.trim()).filter(Boolean) : [],
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSavingField(false);
    if (!res.ok) {
      setError(body.error ?? "Failed to save custom field");
      return;
    }
    setFields((prev) => [
      ...prev,
      { id: body.id, label: body.label, type: body.type, isRequired: body.isRequired },
    ]);
    setLabel("");
    setOptions("");
    setRequired(false);
    setNotice(`Custom field saved for ${departmentName} only.`);
    router.refresh();
  }

  async function addRule() {
    const name = ruleName.trim();
    const first = Number(firstResponseMins);
    const resolution = Number(resolutionMins);
    if (!name) return;
    setSavingRule(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/departments/${departmentId}/sla-policies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        firstResponseMins: first,
        resolutionMins: resolution,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSavingRule(false);
    if (!res.ok) {
      setError(body.error ?? "Failed to save SLA rule");
      return;
    }
    setRules((prev) => [
      ...prev,
      {
        id: body.id,
        name: body.name,
        firstResponseMins: body.firstResponseMins,
        resolutionMins: body.resolutionMins,
      },
    ]);
    setRuleName("");
    setNotice(`SLA rule saved for ${departmentName} only.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div>
        <h1 className="sts-text-admin-title">Support template</h1>
        <p className="mt-[3px] max-w-2xl font-sans text-[13px] text-sts-muted">
          Custom fields and SLA rules for {departmentName}. They are saved on this department&apos;s Support
          template and do not change any other department.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-sans text-[12.5px] text-emerald-700 dark:text-emerald-400">
          {notice}
        </div>
      )}

      <section className="rounded-xl border border-sts-card-border bg-sts-card p-4 shadow-sts-card">
        <h2 className="font-sans text-[14px] font-semibold text-sts-foreground">Custom fields</h2>
        <ul className="mt-3 flex flex-col gap-1.5">
          {fields.length === 0 && (
            <li className="font-sans text-[13px] text-sts-muted">No custom fields yet.</li>
          )}
          {fields.map((field) => (
            <li key={field.id} className="font-sans text-[13px] text-sts-foreground">
              {field.label}
              <span className="text-sts-muted"> · {field.type}{field.isRequired ? " · required" : ""}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 font-sans text-[12px] text-sts-muted">
            Label
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Account number" />
          </label>
          <label className="flex flex-col gap-1 font-sans text-[12px] text-sts-muted">
            Type
            <select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as (typeof FIELD_TYPES)[number])}
              className="h-9 rounded-lg border border-sts-card-border bg-sts-surface px-2 font-sans text-[13px] text-sts-foreground"
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 font-sans text-[13px] text-sts-foreground">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Required
          </label>
          <Button disabled={savingField || !label.trim()} onClick={() => void addField()}>
            {savingField ? "Saving…" : "Add field"}
          </Button>
        </div>
        {fieldType === "select" && (
          <label className="mt-2 flex flex-col gap-1 font-sans text-[12px] text-sts-muted">
            Options, comma-separated
            <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Billing, Access, Other" />
          </label>
        )}
      </section>

      <section className="rounded-xl border border-sts-card-border bg-sts-card p-4 shadow-sts-card">
        <h2 className="font-sans text-[14px] font-semibold text-sts-foreground">SLA rules</h2>
        <ul className="mt-3 flex flex-col gap-1.5">
          {rules.length === 0 && (
            <li className="font-sans text-[13px] text-sts-muted">No SLA rules yet.</li>
          )}
          {rules.map((rule) => (
            <li key={rule.id} className="font-sans text-[13px] text-sts-foreground">
              {rule.name}
              <span className="text-sts-muted">
                {" "}
                · first response {rule.firstResponseMins} min · resolution {rule.resolutionMins} min
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 font-sans text-[12px] text-sts-muted">
            Name
            <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="Priority accounts" />
          </label>
          <label className="flex w-full flex-col gap-1 font-sans text-[12px] text-sts-muted sm:w-36">
            First response (min)
            <Input
              type="number"
              min={1}
              value={firstResponseMins}
              onChange={(e) => setFirstResponseMins(e.target.value)}
            />
          </label>
          <label className="flex w-full flex-col gap-1 font-sans text-[12px] text-sts-muted sm:w-36">
            Resolution (min)
            <Input
              type="number"
              min={1}
              value={resolutionMins}
              onChange={(e) => setResolutionMins(e.target.value)}
            />
          </label>
          <Button disabled={savingRule || !ruleName.trim()} onClick={() => void addRule()}>
            {savingRule ? "Saving…" : "Add SLA rule"}
          </Button>
        </div>
      </section>
    </div>
  );
}
