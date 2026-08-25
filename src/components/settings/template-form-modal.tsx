"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, X, Trash2, Copy } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";

const FIELD_TYPES = ["text", "number", "textarea", "select", "file"];
const FIELD_TYPE_OPTIONS = FIELD_TYPES.map((t) => ({ value: t, label: t }));

type Template = {
  id: string;
  name: string;
  customFields: any[];
};

interface TemplateFormModalProps {
  template?: Template | null;
  onSave: (data: {
    name: string;
    customFields: any[];
  }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

export function TemplateFormModal({ template, onSave, onCancel, saving }: TemplateFormModalProps) {
  const [name, setName] = useState(template?.name ?? "");
  const [customFields, setCustomFields] = useState(template?.customFields ?? []);

  const handleAddCustomField = useCallback(() => {
    setCustomFields((prev) => [
      ...prev,
      { id: `field_${Date.now()}`, label: "", type: "text", required: false, placeholder: "" },
    ]);
  }, []);

  const handleRemoveCustomField = useCallback((index: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateCustomField = useCallback(
    (index: number, key: string, value: any) => {
      setCustomFields((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [key]: value };
        return updated;
      });
    },
    [],
  );

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }

    await onSave({
      name: name.trim(),
      customFields: customFields.filter((f) => f.label.trim()),
    });
  };

  return (
    <div className="sts-overlay-backdrop fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="sts-glass-panel flex w-full max-w-2xl max-h-[calc(90vh/var(--sts-font-scale,1))] flex-col overflow-hidden rounded-[14px] ring-1 ring-white/35 dark:ring-white/10">
        {/* Header */}
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-sts-card-border px-[22px]">
          <h2 className="sts-text-modal-title">
            {template ? "Edit Template" : "New Template"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex size-7 items-center justify-center rounded-md text-sts-muted hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-50"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-[22px] py-5 space-y-5">
          {/* Template Name */}
          <div className="space-y-1.5">
            <label className="sts-text-label">
              Template Name
            </label>
            <input
              autoFocus
              placeholder="e.g., Bug Report"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full rounded-[6px] border border-sts-card-border bg-sts-bg px-2.5 font-sans text-[13px] text-sts-foreground outline-none focus:border-sts-blue focus:ring-1 focus:ring-sts-blue/30"
            />
          </div>

          {/* Custom Fields Section */}
          <div className="space-y-3 rounded-lg bg-sts-surface p-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-sts-subtle">Custom Fields</h3>
              <button
                type="button"
                onClick={handleAddCustomField}
                className="inline-flex items-center gap-1 rounded-md bg-sts-blue/10 px-2 py-1 text-xs font-medium text-sts-blue hover:bg-sts-blue/20"
              >
                <Plus className="size-3" />
                Add Field
              </button>
            </div>

            <div className="space-y-3">
              {customFields.length === 0 ? (
                <p className="text-xs text-sts-muted">No custom fields yet. Add one to get started.</p>
              ) : null}

              {customFields.map((field: any, index: number) => (
                <div key={field.id} className="space-y-3 rounded-md border border-sts-card-border p-3 bg-sts-bg">
                  {/* Row 1: Label and Type */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <span className="text-xs font-medium text-sts-subtle">Field Label</span>
                      <input
                        placeholder="e.g., Steps to Reproduce"
                        value={field.label}
                        onChange={(e) => updateCustomField(index, "label", e.target.value)}
                        className="h-8 w-full rounded-[6px] border border-sts-card-border bg-sts-surface px-2.5 font-sans text-xs text-sts-foreground outline-none focus:border-sts-blue focus:ring-1 focus:ring-sts-blue/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-sts-subtle">Type</span>
                      <SearchableSelect
                        value={field.type}
                        onChange={(v) => updateCustomField(index, "type", v)}
                        options={FIELD_TYPE_OPTIONS}
                        searchable={false}
                        size="sm"
                        className="bg-sts-surface"
                        aria-label="Field type"
                      />
                    </div>
                  </div>

                  {/* Row 2: Placeholder (not for file) */}
                  {field.type !== "file" && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-sts-subtle">Placeholder / Hint</span>
                      <input
                        placeholder="Hint text shown to users…"
                        value={field.placeholder}
                        onChange={(e) => updateCustomField(index, "placeholder", e.target.value)}
                        className="h-8 w-full rounded-[6px] border border-sts-card-border bg-sts-surface px-2.5 font-sans text-xs text-sts-foreground outline-none focus:border-sts-blue focus:ring-1 focus:ring-sts-blue/30"
                      />
                    </div>
                  )}

                  {/* Row 3: Options for select type */}
                  {field.type === "select" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-sts-subtle">Select Options</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newOptions = [...(field.options ?? []), ""];
                            updateCustomField(index, "options", newOptions);
                          }}
                          className="inline-flex items-center gap-1 text-xs text-sts-blue hover:text-sts-blue/80"
                        >
                          <Plus className="size-3" />
                          Add option
                        </button>
                      </div>
                      <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                        {(field.options ?? []).map((opt: string, optIndex: number) => (
                          <div key={optIndex} className="flex gap-1.5 items-center">
                            <input
                              type="text"
                              placeholder={`Option ${optIndex + 1}`}
                              value={opt}
                              onChange={(e) => {
                                const newOptions = [...(field.options ?? [])];
                                newOptions[optIndex] = e.target.value;
                                updateCustomField(index, "options", newOptions);
                              }}
                              className="flex-1 h-7 rounded-[5px] border border-sts-card-border bg-sts-bg px-2 font-sans text-xs text-sts-foreground outline-none focus:border-sts-blue focus:ring-1 focus:ring-sts-blue/30"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newOptions = (field.options ?? []).filter((_: any, i: number) => i !== optIndex);
                                updateCustomField(index, "options", newOptions);
                              }}
                              className="inline-flex items-center justify-center size-6 rounded-md text-sts-subtle hover:bg-sts-surface hover:text-sts-red"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Row 4: Controls */}
                  <div className="flex items-center gap-2 pt-1 border-t border-sts-card-border">
                    <input
                      type="checkbox"
                      id={`required-${index}`}
                      checked={field.required}
                      onChange={(e) => updateCustomField(index, "required", e.target.checked)}
                      className="size-3.5"
                    />
                    <label htmlFor={`required-${index}`} className="text-xs font-medium cursor-pointer text-sts-foreground flex-1">
                      Required field
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (index > 0) {
                          const temp = customFields[index];
                          const newFields = [...customFields];
                          newFields[index] = newFields[index - 1];
                          newFields[index - 1] = temp;
                          setCustomFields(newFields);
                        }
                      }}
                      disabled={index === 0}
                      className="inline-flex items-center justify-center size-6 rounded-md text-sts-subtle hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-30"
                      title="Move up"
                    >
                      <span className="text-lg">↑</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (index < customFields.length - 1) {
                          const temp = customFields[index];
                          const newFields = [...customFields];
                          newFields[index] = newFields[index + 1];
                          newFields[index + 1] = temp;
                          setCustomFields(newFields);
                        }
                      }}
                      disabled={index === customFields.length - 1}
                      className="inline-flex items-center justify-center size-6 rounded-md text-sts-subtle hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-30"
                      title="Move down"
                    >
                      <span className="text-lg">↓</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomField(index)}
                      className="inline-flex items-center justify-center size-6 rounded-md text-sts-subtle hover:bg-sts-red/20 hover:text-sts-red"
                      title="Delete field"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-t border-sts-card-border bg-sts-bg px-[22px]">
          <div className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex h-8 w-[78px] items-center justify-center rounded-[6px] border border-sts-card-border font-sans text-[12px] font-semibold text-sts-foreground transition-colors hover:bg-sts-card-border disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex h-8 items-center gap-1.5 rounded-[6px] bg-sts-blue px-3 font-sans text-[12px] font-medium text-white dark:text-gray-900 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : template ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
