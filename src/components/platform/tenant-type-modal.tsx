"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type TenantTypeRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  tenants: number;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function TenantTypeModal({
  existing,
  onClose,
}: {
  existing?: TenantTypeRow;
  onClose: () => void;
}) {
  const editing = existing != null;
  const [label, setLabel] = useState(existing?.label ?? "");
  // When creating, the key auto-follows the label until the user edits it.
  const [key, setKey] = useState(existing?.key ?? "");
  const [keyDirty, setKeyDirty] = useState(editing);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [submitting, setSubmitting] = useState(false);

  const effectiveKey = keyDirty ? key : slugify(label);

  async function handleSubmit(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (!label.trim() || submitting) return;
    setSubmitting(true);

    const payload = {
      label: label.trim(),
      key: effectiveKey.trim(),
      description: description.trim(),
    };

    const res = await fetch(
      editing ? `/api/admin/tenant-types/${existing.id}` : "/api/admin/tenant-types",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSubmitting(false);
      toast.error(body.error ?? `Failed to ${editing ? "update" : "create"} tenant type`);
      return;
    }

    toast.success(`${payload.label} has been ${editing ? "updated" : "created"}.`);
    window.location.reload();
  }

  return (
    <div className="sts-overlay-backdrop fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="sts-glass-panel flex max-h-[calc(90vh/var(--sts-font-scale,1))] w-full max-w-md flex-col overflow-hidden rounded-[8px] ring-1 ring-white/35 dark:ring-white/10">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-sts-card-border px-[22px]">
          <h2 className="sts-text-modal-title">{editing ? "Edit tenant type" : "Create tenant type"}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex size-7 items-center justify-center rounded-full text-sts-muted hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-50"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-[22px] py-5">
          <div className="space-y-1.5">
            <label className="font-sans text-[12.5px] font-medium text-sts-foreground">Label</label>
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Non-profit"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-sans text-[12.5px] font-medium text-sts-foreground">Key</label>
            <Input
              value={effectiveKey}
              onChange={(e) => {
                setKeyDirty(true);
                setKey(e.target.value);
              }}
              placeholder="e.g. non-profit"
              className="h-9 font-mono text-[12px]"
            />
            <p className="font-sans text-[11px] text-sts-subtle">
              Lowercase letters, numbers, and hyphens. This is the stable value stored on each tenant.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="font-sans text-[12.5px] font-medium text-sts-foreground">
              Description <span className="text-sts-subtle">(optional)</span>
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What kind of organizations this covers"
              className="h-9"
            />
          </div>
        </form>

        <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-sts-card-border px-[22px]">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || !label.trim()}>
            {submitting ? "Saving…" : editing ? "Save changes" : "Create type"}
          </Button>
        </div>
      </div>
    </div>
  );
}
