"use client";

import { useEffect, useRef, useState } from "react";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  TEMPLATE_FEATURE_KEYS,
  TEMPLATE_FEATURE_LABELS,
  TEMPLATE_FEATURE_GROUPS as FEATURE_GROUPS,
  type TemplateFeatureKey,
} from "@/lib/template-features";

const ALL_FEATURE_KEYS = TEMPLATE_FEATURE_KEYS as readonly TemplateFeatureKey[];

function GroupCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="size-3.5 shrink-0 rounded border-sts-card-border text-sts-blue accent-sts-blue"
    />
  );
}

export type TemplateFormValues = {
  id?: string;
  name: string;
  description: string;
  featureKeys: Set<TemplateFeatureKey>;
};

export function TemplateFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: TemplateFormValues;
  onClose: () => void;
  onSaved: (template: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isActive: boolean;
    featureKeys: string[];
  }) => void;
}) {
  const isEdit = Boolean(initial?.id);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [featureKeys, setFeatureKeys] = useState<Set<TemplateFeatureKey>>(
    new Set(initial?.featureKeys ?? []),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleFeature(key: TemplateFeatureKey) {
    setFeatureKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(keys: TemplateFeatureKey[]) {
    const allSelected = keys.every((key) => featureKeys.has(key));
    setFeatureKeys((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  function toggleAll() {
    setFeatureKeys((prev) =>
      prev.size === ALL_FEATURE_KEYS.length ? new Set() : new Set(ALL_FEATURE_KEYS),
    );
  }

  async function handleSubmit(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    const res = isEdit
      ? await fetch(`/api/admin/templates/${initial!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            featureKeys: Array.from(featureKeys),
          }),
        })
      : await fetch("/api/admin/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            featureKeys: Array.from(featureKeys),
          }),
        });

    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Failed to ${isEdit ? "update" : "create"} template`);
      return;
    }
    const saved = await res.json();
    onSaved({
      id: saved.id,
      name: saved.name,
      slug: saved.slug,
      description: saved.description ?? null,
      isActive: saved.isActive ?? true,
      featureKeys: saved.features ? saved.features.map((f: { key: string }) => f.key) : Array.from(featureKeys),
    });
  }

  return (
    <div className="sts-overlay-backdrop fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="sts-glass-panel flex max-h-[calc(90vh/var(--sts-font-scale,1))] w-full max-w-lg flex-col overflow-hidden rounded-[14px] ring-1 ring-white/35 dark:ring-white/10">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-sts-card-border px-[22px]">
          <h2 className="sts-text-modal-title">{isEdit ? "Edit template" : "Create template"}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex size-7 items-center justify-center rounded-md text-sts-muted hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-50"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-[22px] py-5">
          <div className="space-y-1.5">
            <label className="font-sans text-[12.5px] font-medium text-sts-foreground">Template name</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Support"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-sans text-[12.5px] font-medium text-sts-foreground">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              className="h-9"
            />
          </div>

          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <label className="font-sans text-[12.5px] font-medium text-sts-foreground">Feature gates</label>
                <p className="font-sans text-[11px] text-sts-subtle">
                  {featureKeys.size} of {ALL_FEATURE_KEYS.length} selected
                </p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 font-sans text-[11.5px] font-medium text-sts-foreground">
                <GroupCheckbox
                  checked={featureKeys.size === ALL_FEATURE_KEYS.length}
                  indeterminate={featureKeys.size > 0 && featureKeys.size < ALL_FEATURE_KEYS.length}
                  onChange={toggleAll}
                />
                Select all
              </label>
            </div>

            <div className="space-y-2">
              {FEATURE_GROUPS.map((group) => {
                const groupSelectedCount = group.keys.filter((key) => featureKeys.has(key)).length;
                const groupFullySelected = groupSelectedCount === group.keys.length;
                const Icon = group.icon;
                return (
                  <div
                    key={group.label}
                    className="rounded-lg border border-sts-card-border bg-sts-surface/50 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-sans text-[11px] font-semibold tracking-[0.5px] text-sts-subtle uppercase">
                        <Icon className="size-3.5 text-sts-subtle" />
                        {group.label}
                        <span className="font-sans text-[10.5px] font-normal normal-case text-sts-subtle/80">
                          {groupSelectedCount}/{group.keys.length}
                        </span>
                      </div>
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 font-sans text-[11px] font-medium text-sts-muted">
                        <GroupCheckbox
                          checked={groupFullySelected}
                          indeterminate={groupSelectedCount > 0 && !groupFullySelected}
                          onChange={() => toggleGroup(group.keys)}
                        />
                        Select all
                      </label>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {group.keys.map((key) => {
                        const selected = featureKeys.has(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleFeature(key)}
                            aria-pressed={selected}
                            className={cn(
                              "flex items-center gap-1 rounded-full border px-2.5 py-1 font-sans text-[12px] font-medium transition-colors",
                              selected
                                ? "border-sts-blue/40 bg-sts-blue-tint text-sts-blue"
                                : "border-sts-card-border text-sts-muted hover:border-sts-blue/40 hover:text-sts-foreground",
                            )}
                          >
                            {selected && <Check className="size-3" strokeWidth={2.5} />}
                            {TEMPLATE_FEATURE_LABELS[key]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
              {error}
            </div>
          )}
        </form>

        <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-sts-card-border px-[22px]">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create template"}
          </Button>
        </div>
      </div>
    </div>
  );
}
