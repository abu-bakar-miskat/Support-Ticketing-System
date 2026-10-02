"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FEATURE_ICONS } from "@/components/settings/feature-preview";
import { DEFAULT_SUB_DEPARTMENT_STATUSES } from "@/lib/board-columns";
import {
  ASSIGNMENT_METHOD_LABELS,
  TEMPLATE_ASSIGNMENT_METHODS,
  emptyFeatureSetup,
  featureSetupSummary,
  savedFeatureToSetup,
  type FeatureSetup,
  type SavedFeature,
} from "@/lib/feature-setup";
import {
  MARKETPLACE_FEATURE_COPY,
  MARKETPLACE_FEATURE_GROUPS,
  TEMPLATE_FEATURE_LABELS,
  type MarketplaceFeatureKey,
} from "@/lib/template-features";
import { cn } from "@/lib/utils";

type StatusDraft = { label: string; color: string; isComplete: boolean };
type ListDraft = { name: string; statuses: string[] };

type FeatureDraft = {
  id: string;
  name: string;
  key: MarketplaceFeatureKey;
  explanation: string;
  useCase: string;
  statuses: StatusDraft[];
  lists: ListDraft[];
  setup: FeatureSetup;
};

const fieldClass =
  "h-9 w-full rounded-lg border border-sts-card-border bg-sts-card px-2.5 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-blue/50";

function newTemplate(key: MarketplaceFeatureKey): FeatureDraft {
  const copy = MARKETPLACE_FEATURE_COPY[key];
  return {
    id: "",
    name: "",
    key,
    explanation: copy.explanation,
    useCase: copy.useCase,
    statuses:
      key === "board" || key === "workflows"
        ? DEFAULT_SUB_DEPARTMENT_STATUSES.map((status) => ({ ...status }))
        : [],
    lists: [],
    setup: emptyFeatureSetup(),
  };
}

function templateDraft(saved: SavedFeature): FeatureDraft {
  return {
    id: saved.id,
    name: saved.name,
    key: saved.key,
    explanation: saved.explanation || MARKETPLACE_FEATURE_COPY[saved.key].explanation,
    useCase: saved.useCase || MARKETPLACE_FEATURE_COPY[saved.key].useCase,
    statuses: saved.statuses,
    lists: saved.lists,
    setup: savedFeatureToSetup(saved),
  };
}

export function FeatureBoardsAdmin({ saved }: { saved: SavedFeature[] }) {
  const router = useRouter();
  const [records, setRecords] = useState(saved);
  const [openKey, setOpenKey] = useState<MarketplaceFeatureKey | null>(null);
  const [draft, setDraft] = useState<FeatureDraft | null>(null);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecords(saved);
  }, [saved]);

  async function save() {
    if (!draft) return;
    setBusy("save");
    setError(null);
    const res = await fetch("/api/admin/feature-customizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: draft.id,
        name: draft.name,
        key: draft.key,
        explanation: draft.explanation,
        useCase: draft.useCase,
        statuses: draft.statuses,
        lists: draft.lists,
        tags: draft.setup.tags,
        ticketTemplates: draft.setup.ticketTemplates,
        sla: draft.setup.sla,
        assignmentMethod: draft.setup.assignmentMethod,
        supportForm: draft.setup.supportForm,
        calendar: draft.setup.calendar,
        reportsPeriodDays: draft.setup.reportsPeriodDays,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; feature?: SavedFeature };
    setBusy(null);
    if (!res.ok || !body.feature) {
      setError(body.error ?? "Could not save this feature.");
      return;
    }
    setRecords((current) =>
      current.some((feature) => feature.id === body.feature!.id)
        ? current.map((feature) => (feature.id === body.feature!.id ? body.feature! : feature))
        : [...current, body.feature!],
    );
    setDraft(templateDraft(body.feature));
    router.refresh();
  }

  async function reset() {
    if (!draft) return;
    setBusy("reset");
    setError(null);
    const res = await fetch(`/api/admin/feature-customizations?id=${encodeURIComponent(draft.id)}`, { method: "DELETE" });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Could not reset this feature.");
      return;
    }
    setRecords((current) => current.filter((feature) => feature.id !== draft.id));
    setDraft(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5 px-5 py-8 sm:px-8 lg:px-10">
      <div>
        <h1 className="sts-text-admin-title">Customize features</h1>
        <p className="mt-[3px] max-w-2xl font-sans text-[13px] text-sts-muted">
          Open a feature, shape it, and save that version as a template. A template is a customized version of the feature. Department admins see those templates in the Feature marketplace and can request one for a department.
        </p>
      </div>

      {error && !draft && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}

      {draft ? (
        <FeatureEditor
          draft={draft}
          customized={draft.id !== ""}
          busy={busy}
          error={error}
          onChange={setDraft}
          onClose={() => {
            setDraft(null);
            setError(null);
          }}
          onSave={save}
          onReset={reset}
        />
      ) : openKey ? (
        <FeatureTemplates
          featureKey={openKey}
          templates={records.filter((feature) => feature.key === openKey)}
          onBack={() => setOpenKey(null)}
          onOpen={(feature) => {
            setError(null);
            setDraft(templateDraft(feature));
          }}
          onCreate={() => {
            setError(null);
            setDraft(newTemplate(openKey));
          }}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {MARKETPLACE_FEATURE_GROUPS.map((group) => (
            <section key={group.label} className="flex flex-col gap-3">
              <h2 className="font-sans text-[12px] font-semibold tracking-wide text-sts-subtle uppercase">{group.label}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.keys.map((key) => {
                  const templates = records.filter((feature) => feature.key === key);
                  const Icon = FEATURE_ICONS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setError(null);
                        setOpenKey(key);
                      }}
                      className="flex flex-col items-start gap-2 rounded-xl border border-sts-card-border bg-sts-card px-4 py-3.5 text-left transition-colors hover:border-sts-blue/50"
                    >
                      <span className="flex w-full items-center gap-2">
                        {Icon && <Icon className="size-4 shrink-0 text-sts-blue" />}
                        <span className="min-w-0 flex-1 truncate font-sans text-[13px] font-semibold text-sts-foreground">
                          {TEMPLATE_FEATURE_LABELS[key]}
                        </span>
                        {templates.length > 0 && (
                          <span className="rounded-full bg-sts-blue-tint px-2 py-0.5 font-sans text-[11px] text-sts-blue">
                            {templates.length} {templates.length === 1 ? "template" : "templates"}
                          </span>
                        )}
                      </span>
                      <span className="line-clamp-2 font-sans text-[12px] text-sts-muted">
                        {templates.length > 0 ? templates.map((feature) => feature.name).join(" · ") : MARKETPLACE_FEATURE_COPY[key].explanation}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FeatureTemplates({
  featureKey,
  templates,
  onBack,
  onOpen,
  onCreate,
}: {
  featureKey: MarketplaceFeatureKey;
  templates: SavedFeature[];
  onBack: () => void;
  onOpen: (feature: SavedFeature) => void;
  onCreate: () => void;
}) {
  const Icon = FEATURE_ICONS[featureKey];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 font-sans text-[15px] font-semibold text-sts-foreground">
          {Icon && <Icon className="size-4 text-sts-blue" />}
          {TEMPLATE_FEATURE_LABELS[featureKey]}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
          <Button onClick={onCreate}><Plus />New template</Button>
        </div>
      </div>
      {templates.length === 0 ? (
        <p className="rounded-xl border border-sts-card-border bg-sts-card px-4 py-6 font-sans text-[13px] text-sts-muted">
          No templates yet. Save a customized version of {TEMPLATE_FEATURE_LABELS[featureKey]}.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((feature) => {
            const summary = featureSetupSummary(feature.key, savedFeatureToSetup(feature), feature.statuses);
            return (
              <button
                key={feature.id}
                type="button"
                onClick={() => onOpen(feature)}
                className="flex flex-col items-start gap-1 rounded-xl border border-sts-card-border bg-sts-card px-4 py-3.5 text-left transition-colors hover:border-sts-blue/50"
              >
                <span className="font-sans text-[13px] font-semibold text-sts-foreground">{feature.name}</span>
                <span className="line-clamp-2 font-sans text-[12px] text-sts-muted">{summary || feature.explanation || feature.useCase}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FeatureEditor({
  draft,
  customized,
  busy,
  error,
  onChange,
  onClose,
  onSave,
  onReset,
}: {
  draft: FeatureDraft;
  customized: boolean;
  busy: "save" | "reset" | null;
  error: string | null;
  onChange: (draft: FeatureDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const key = draft.key;

  function patchStatus(index: number, patch: Partial<StatusDraft>) {
    const previous = draft.statuses[index]?.label ?? "";
    const statuses = draft.statuses.map((status, i) => (i === index ? { ...status, ...patch } : status));
    const nextLabel = statuses[index]?.label ?? previous;
    onChange({
      ...draft,
      statuses,
      lists:
        patch.label === undefined
          ? draft.lists
          : draft.lists.map((list) => ({
              ...list,
              statuses: list.statuses.map((name) => (name === previous ? nextLabel : name)),
            })),
    });
  }

  function setSetup(patch: Partial<FeatureSetup>) {
    onChange({ ...draft, setup: { ...draft.setup, ...patch } });
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-sts-card-border bg-[var(--sts-card-solid)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-sans text-[15px] font-semibold text-sts-foreground">
          {draft.name.trim() || `New ${TEMPLATE_FEATURE_LABELS[key]} template`}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy !== null}>
          Back
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}

      <label className="flex flex-col gap-1 font-sans text-[12px] text-sts-subtle">
        Template name
        <input className={fieldClass} value={draft.name} placeholder="Name this version" onChange={(event) => onChange({ ...draft, name: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1 font-sans text-[12px] text-sts-subtle">
        Explanation
        <textarea className={cn(fieldClass, "h-16 py-2")} value={draft.explanation} onChange={(event) => onChange({ ...draft, explanation: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1 font-sans text-[12px] text-sts-subtle">
        Use case
        <textarea className={cn(fieldClass, "h-16 py-2")} value={draft.useCase} onChange={(event) => onChange({ ...draft, useCase: event.target.value })} />
      </label>

      {(key === "board" || key === "workflows") && <StatusEditor draft={draft} onChange={onChange} patchStatus={patchStatus} />}
      {key === "board" && <ListEditor draft={draft} onChange={onChange} />}
      {key === "tagsLabels" && <TagEditor setup={draft.setup} onChange={setSetup} />}
      {key === "ticketTemplates" && <TicketTemplateEditor setup={draft.setup} onChange={setSetup} />}
      {key === "slaPolicies" && <SlaEditor setup={draft.setup} onChange={setSetup} />}
      {key === "assignmentMethods" && (
        <label className="flex flex-col gap-1 font-sans text-[12px] text-sts-subtle">
          Default assignment
          <select
            className={fieldClass}
            value={draft.setup.assignmentMethod}
            onChange={(event) => setSetup({ assignmentMethod: event.target.value as FeatureSetup["assignmentMethod"] })}
          >
            {TEMPLATE_ASSIGNMENT_METHODS.map((method) => (
              <option key={method} value={method}>{ASSIGNMENT_METHOD_LABELS[method]}</option>
            ))}
          </select>
        </label>
      )}
      {key === "supportForm" && <SupportFormEditor setup={draft.setup} onChange={setSetup} />}
      {key === "calendar" && <CalendarEditor setup={draft.setup} onChange={setSetup} />}
      {key === "reports" && (
        <label className="flex flex-col gap-1 font-sans text-[12px] text-sts-subtle">
          Default period
          <select
            className={fieldClass}
            value={draft.setup.reportsPeriodDays}
            onChange={(event) => setSetup({ reportsPeriodDays: Number(event.target.value) as FeatureSetup["reportsPeriodDays"] })}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onSave} disabled={busy !== null}>
          {busy === "save" && <Loader2 className="animate-spin" />}
          Save template
        </Button>
        {customized && (
          <Button variant="ghost" onClick={onReset} disabled={busy !== null}>
            {busy === "reset" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Delete template
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusEditor({
  draft,
  onChange,
  patchStatus,
}: {
  draft: FeatureDraft;
  onChange: (draft: FeatureDraft) => void;
  patchStatus: (index: number, patch: Partial<StatusDraft>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="font-sans text-[12px] font-medium text-sts-subtle">Statuses</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...draft, statuses: [...draft.statuses, { label: "", color: "#64748b", isComplete: false }] })}
        >
          <Plus />
          Add status
        </Button>
      </div>
      {draft.statuses.map((status, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            aria-label="Status color"
            className="size-9 shrink-0 cursor-pointer rounded-lg border border-sts-card-border bg-sts-card p-1"
            value={/^#[0-9a-fA-F]{6}$/.test(status.color) ? status.color : "#64748b"}
            onChange={(event) => patchStatus(index, { color: event.target.value })}
          />
          <input
            className={cn(fieldClass, "min-w-40 flex-1")}
            placeholder="Status name"
            value={status.label}
            onChange={(event) => patchStatus(index, { label: event.target.value })}
          />
          <label className="inline-flex items-center gap-1.5 font-sans text-[12px] text-sts-muted">
            <input type="checkbox" checked={status.isComplete} onChange={(event) => patchStatus(index, { isComplete: event.target.checked })} />
            Done
          </label>
          <Button
            variant="ghost"
            size="sm"
            disabled={draft.statuses.length <= 2}
            onClick={() =>
              onChange({
                ...draft,
                statuses: draft.statuses.filter((_, i) => i !== index),
                lists: draft.lists.map((list) => ({ ...list, statuses: list.statuses.filter((name) => name !== status.label) })),
              })
            }
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}

function ListEditor({ draft, onChange }: { draft: FeatureDraft; onChange: (draft: FeatureDraft) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="font-sans text-[12px] font-medium text-sts-subtle">Lists</p>
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...draft, lists: [...draft.lists, { name: "", statuses: [] }] })}>
          <Plus />
          Add list
        </Button>
      </div>
      {draft.lists.map((list, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-lg bg-sts-card px-3 py-2.5">
          <div className="flex items-center gap-2">
            <input
              className={cn(fieldClass, "flex-1")}
              placeholder="List name"
              value={list.name}
              onChange={(event) =>
                onChange({
                  ...draft,
                  lists: draft.lists.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)),
                })
              }
            />
            <Button variant="ghost" size="sm" onClick={() => onChange({ ...draft, lists: draft.lists.filter((_, i) => i !== index) })}>
              Remove
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {draft.statuses.filter((status) => status.label.trim()).map((status) => {
              const on = list.statuses.includes(status.label);
              return (
                <button
                  key={status.label}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...draft,
                      lists: draft.lists.map((item, i) =>
                        i === index
                          ? { ...item, statuses: on ? item.statuses.filter((name) => name !== status.label) : [...item.statuses, status.label] }
                          : item,
                      ),
                    })
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-sans text-[12px]",
                    on ? "border-sts-blue/40 bg-sts-blue-tint text-sts-foreground" : "border-sts-card-border text-sts-muted",
                  )}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: status.color }} />
                  {status.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TagEditor({ setup, onChange }: { setup: FeatureSetup; onChange: (patch: Partial<FeatureSetup>) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="font-sans text-[12px] font-medium text-sts-subtle">Tags</p>
        <Button variant="ghost" size="sm" onClick={() => onChange({ tags: [...setup.tags, { name: "", color: "#64748b" }] })}>
          <Plus />
          Add tag
        </Button>
      </div>
      {setup.tags.map((tag, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Tag color"
            className="size-9 shrink-0 cursor-pointer rounded-lg border border-sts-card-border bg-sts-card p-1"
            value={/^#[0-9a-fA-F]{6}$/.test(tag.color) ? tag.color : "#64748b"}
            onChange={(event) => onChange({ tags: setup.tags.map((item, i) => (i === index ? { ...item, color: event.target.value } : item)) })}
          />
          <input
            className={fieldClass}
            placeholder="Tag name"
            value={tag.name}
            onChange={(event) => onChange({ tags: setup.tags.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)) })}
          />
          <Button variant="ghost" size="sm" onClick={() => onChange({ tags: setup.tags.filter((_, i) => i !== index) })}>
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}

function TicketTemplateEditor({ setup, onChange }: { setup: FeatureSetup; onChange: (patch: Partial<FeatureSetup>) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="font-sans text-[12px] font-medium text-sts-subtle">Ticket templates</p>
        <Button variant="ghost" size="sm" onClick={() => onChange({ ticketTemplates: [...setup.ticketTemplates, { name: "", fields: [] }] })}>
          <Plus />
          Add template
        </Button>
      </div>
      {setup.ticketTemplates.map((template, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-lg bg-sts-card px-3 py-2.5">
          <div className="flex items-center gap-2">
            <input
              className={fieldClass}
              placeholder="Template name"
              value={template.name}
              onChange={(event) =>
                onChange({
                  ticketTemplates: setup.ticketTemplates.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)),
                })
              }
            />
            <Button variant="ghost" size="sm" onClick={() => onChange({ ticketTemplates: setup.ticketTemplates.filter((_, i) => i !== index) })}>
              Remove
            </Button>
          </div>
          <label className="flex flex-col gap-1 font-sans text-[12px] text-sts-subtle">
            Fields, separated by commas
            <input
              className={fieldClass}
              value={template.fields.join(", ")}
              onChange={(event) =>
                onChange({
                  ticketTemplates: setup.ticketTemplates.map((item, i) =>
                    i === index ? { ...item, fields: event.target.value.split(",").map((field) => field.trim()).filter(Boolean) } : item,
                  ),
                })
              }
            />
          </label>
        </div>
      ))}
    </div>
  );
}

function SlaEditor({ setup, onChange }: { setup: FeatureSetup; onChange: (patch: Partial<FeatureSetup>) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="font-sans text-[12px] font-medium text-sts-subtle">SLA policies</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ sla: [...setup.sla, { name: "", firstResponseMins: 60, resolutionMins: 480 }] })}
        >
          <Plus />
          Add policy
        </Button>
      </div>
      {setup.sla.map((policy, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
          <input
            className={fieldClass}
            placeholder="Policy name"
            value={policy.name}
            onChange={(event) => onChange({ sla: setup.sla.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)) })}
          />
          <input
            className={fieldClass}
            type="number"
            min={1}
            aria-label="First response minutes"
            value={policy.firstResponseMins}
            onChange={(event) =>
              onChange({ sla: setup.sla.map((item, i) => (i === index ? { ...item, firstResponseMins: Number(event.target.value) } : item)) })
            }
          />
          <input
            className={fieldClass}
            type="number"
            min={1}
            aria-label="Resolution minutes"
            value={policy.resolutionMins}
            onChange={(event) =>
              onChange({ sla: setup.sla.map((item, i) => (i === index ? { ...item, resolutionMins: Number(event.target.value) } : item)) })
            }
          />
          <Button variant="ghost" size="sm" onClick={() => onChange({ sla: setup.sla.filter((_, i) => i !== index) })}>
            Remove
          </Button>
        </div>
      ))}
      {setup.sla.length > 0 && (
        <p className="font-sans text-[11px] text-sts-muted">Times are in minutes. 60 is one hour, 480 is eight hours.</p>
      )}
    </div>
  );
}

function SupportFormEditor({ setup, onChange }: { setup: FeatureSetup; onChange: (patch: Partial<FeatureSetup>) => void }) {
  const form = setup.supportForm;
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 font-sans text-[12px] text-sts-subtle">
        Form name
        <input
          className={fieldClass}
          value={form.name}
          onChange={(event) => onChange({ supportForm: { ...form, name: event.target.value } })}
        />
      </label>
      <div className="flex items-center justify-between">
        <p className="font-sans text-[12px] font-medium text-sts-subtle">Fields</p>
        <Button variant="ghost" size="sm" onClick={() => onChange({ supportForm: { ...form, fields: [...form.fields, { label: "", required: false }] } })}>
          <Plus />
          Add field
        </Button>
      </div>
      {form.fields.map((field, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <input
            className={cn(fieldClass, "min-w-40 flex-1")}
            placeholder="Field label"
            value={field.label}
            onChange={(event) =>
              onChange({
                supportForm: { ...form, fields: form.fields.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)) },
              })
            }
          />
          <label className="inline-flex items-center gap-1.5 font-sans text-[12px] text-sts-muted">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) =>
                onChange({
                  supportForm: { ...form, fields: form.fields.map((item, i) => (i === index ? { ...item, required: event.target.checked } : item)) },
                })
              }
            />
            Required
          </label>
          <Button variant="ghost" size="sm" onClick={() => onChange({ supportForm: { ...form, fields: form.fields.filter((_, i) => i !== index) } })}>
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarEditor({ setup, onChange }: { setup: FeatureSetup; onChange: (patch: Partial<FeatureSetup>) => void }) {
  const calendar = setup.calendar;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((day, index) => {
          const on = calendar.workingDays.includes(index);
          return (
            <button
              key={day}
              type="button"
              onClick={() =>
                onChange({
                  calendar: {
                    ...calendar,
                    workingDays: on ? calendar.workingDays.filter((item) => item !== index) : [...calendar.workingDays, index],
                  },
                })
              }
              className={cn(
                "rounded-full border px-2.5 py-1 font-sans text-[12px]",
                on ? "border-sts-blue/40 bg-sts-blue-tint text-sts-foreground" : "border-sts-card-border text-sts-muted",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 font-sans text-[12px] text-sts-subtle">
          Start
          <input className={fieldClass} type="time" value={calendar.start} onChange={(event) => onChange({ calendar: { ...calendar, start: event.target.value } })} />
        </label>
        <label className="flex flex-col gap-1 font-sans text-[12px] text-sts-subtle">
          End
          <input className={fieldClass} type="time" value={calendar.end} onChange={(event) => onChange({ calendar: { ...calendar, end: event.target.value } })} />
        </label>
      </div>
    </div>
  );
}
