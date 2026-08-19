"use client";

import { useState } from "react";
import { LayoutTemplate, Plus, Check, X, Archive, Pencil, Trash2, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TemplateFormModal } from "@/components/platform/template-form-modal";
import { TEMPLATE_FEATURE_LABELS, TEMPLATE_FEATURE_GROUPS, type TemplateFeatureKey } from "@/lib/template-features";

type TemplateRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  featureKeys: string[];
  activeTenantCount: number;
};

type RequestRow = {
  id: string;
  tenant: { id: string; name: string; slug: string };
  template: { id: string; name: string };
  message: string | null;
  requestedAt: string;
  requestedBy: { id: string; name: string | null; email: string } | null;
};

export function TemplatesCatalogueAdmin({
  initialTemplates,
  initialRequests,
}: {
  initialTemplates: TemplateRow[];
  initialRequests: RequestRow[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [requests, setRequests] = useState(initialRequests);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<TemplateRow | null>(null);

  function openCreateModal() {
    setEditingTemplate(null);
    setModalOpen(true);
  }

  function openEditModal(template: TemplateRow) {
    setEditingTemplate(template);
    setModalOpen(true);
  }

  function handleSaved(saved: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isActive: boolean;
    featureKeys: string[];
  }) {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === saved.id);
      if (exists) {
        return prev.map((t) =>
          t.id === saved.id
            ? { ...t, name: saved.name, description: saved.description, featureKeys: saved.featureKeys }
            : t,
        );
      }
      return [...prev, { ...saved, activeTenantCount: 0 }];
    });
    setModalOpen(false);
    setEditingTemplate(null);
  }

  async function restoreTemplate(template: TemplateRow) {
    setBusy(template.id);
    setError(null);
    const res = await fetch(`/api/admin/templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to restore template");
      return;
    }
    setTemplates((prev) => prev.map((t) => (t.id === template.id ? { ...t, isActive: true } : t)));
  }

  async function deleteTemplate(template: TemplateRow) {
    const res = await fetch(`/api/admin/templates/${template.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to delete template");
    }
    setTemplates((prev) => prev.map((t) => (t.id === template.id ? { ...t, isActive: false } : t)));
  }

  async function reviewRequest(requestId: string, decision: "APPROVED" | "REJECTED") {
    setBusy(requestId);
    setError(null);
    const res = await fetch(`/api/admin/template-requests/${requestId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to review request");
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    if (decision === "APPROVED") {
      setTemplates((prev) =>
        prev.map((t) => {
          const req = initialRequests.find((r) => r.id === requestId);
          if (req && t.id === req.template.id) return { ...t, activeTenantCount: t.activeTenantCount + 1 };
          return t;
        }),
      );
    }
  }

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            icon={LayoutTemplate}
            title="Template Catalogue"
            description="Bundle settings sections into named templates. Tenants can run several templates at once and request new ones; requests land below for approval."
          />
          <Button size="lg" onClick={openCreateModal} className="mt-1 shrink-0">
            <Plus className="size-4" />
            New template
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
          </div>
        )}

        {/* Pending requests */}
        {requests.length > 0 && (
          <div className="mt-8">
            <h2 className="font-sans text-[13px] font-semibold text-pen-foreground">
              Pending requests ({requests.length})
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pen-card-border bg-pen-card p-3 shadow-pen-card"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[13px] text-pen-foreground">
                      <span className="font-semibold">{r.tenant.name}</span> requested{" "}
                      <span className="font-semibold">{r.template.name}</span>
                    </p>
                    <p className="mt-0.5 font-sans text-[11.5px] text-pen-subtle">
                      {r.requestedBy?.name ?? r.requestedBy?.email ?? "Unknown"} ·{" "}
                      {new Date(r.requestedAt).toLocaleDateString()}
                      {r.message ? ` — "${r.message}"` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === r.id}
                      onClick={() => reviewRequest(r.id, "REJECTED")}
                    >
                      <X className="size-3.5" />
                      Reject
                    </Button>
                    <Button size="sm" disabled={busy === r.id} onClick={() => reviewRequest(r.id, "APPROVED")}>
                      <Check className="size-3.5" />
                      Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Templates list */}
        <div className="mt-8">
          <h2 className="font-sans text-[13px] font-semibold text-pen-foreground">Templates</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex flex-col rounded-xl border border-pen-card-border bg-pen-card p-4 shadow-pen-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate font-sans text-[14.5px] font-semibold text-pen-foreground">
                    {t.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {t.isActive ? (
                      <>
                        <button
                          type="button"
                          aria-label="Edit template"
                          onClick={() => openEditModal(t)}
                          className="flex size-7 items-center justify-center rounded-md text-pen-muted hover:bg-pen-surface hover:text-pen-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete template"
                          disabled={busy === t.id}
                          onClick={() => setDeletingTemplate(t)}
                          className="flex size-7 items-center justify-center rounded-md text-pen-muted hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        aria-label="Restore template"
                        disabled={busy === t.id}
                        onClick={() => restoreTemplate(t)}
                        className="flex size-7 items-center justify-center rounded-md text-pen-muted hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-50"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {t.description && (
                  <p className="mt-1 font-sans text-[12px] text-pen-muted">{t.description}</p>
                )}
                <div className="mt-2 flex flex-col gap-2">
                  {TEMPLATE_FEATURE_GROUPS.map((group) => {
                    const groupKeys = group.keys.filter((key) => t.featureKeys.includes(key));
                    if (groupKeys.length === 0) return null;
                    const Icon = group.icon;
                    return (
                      <div key={group.label}>
                        <div className="flex items-center gap-1 font-sans text-[10px] font-semibold tracking-[0.5px] text-pen-subtle uppercase">
                          <Icon className="size-3 text-pen-subtle" />
                          {group.label}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {groupKeys.map((key) => (
                            <span
                              key={key}
                              className="rounded-full bg-pen-blue-tint px-2 py-0.5 font-sans text-[10.5px] font-medium text-pen-blue"
                            >
                              {TEMPLATE_FEATURE_LABELS[key]}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-1.5 border-t border-pen-card-border/60 pt-3 font-sans text-[11.5px] text-pen-subtle">
                  {t.isActive ? (
                    <span>{t.activeTenantCount} tenant{t.activeTenantCount === 1 ? "" : "s"} active</span>
                  ) : (
                    <span className="flex items-center gap-1 text-pen-muted">
                      <Archive className="size-3" /> Archived
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {modalOpen && (
        <TemplateFormModal
          initial={
            editingTemplate
              ? {
                  id: editingTemplate.id,
                  name: editingTemplate.name,
                  description: editingTemplate.description ?? "",
                  featureKeys: new Set(editingTemplate.featureKeys as TemplateFeatureKey[]),
                }
              : undefined
          }
          onClose={() => {
            setModalOpen(false);
            setEditingTemplate(null);
          }}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={deletingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingTemplate(null);
        }}
        title="Delete template"
        description={
          deletingTemplate
            ? `"${deletingTemplate.name}" will be archived and removed from the catalogue. Tenants that already have it active keep their access, and this can be restored later.`
            : ""
        }
        confirmLabel="Delete"
        successMessage="Template deleted"
        onConfirm={async () => {
          if (deletingTemplate) await deleteTemplate(deletingTemplate);
        }}
      />
    </div>
  );
}
