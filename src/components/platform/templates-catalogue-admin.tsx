"use client";

import { useMemo, useState } from "react";
import {
  LayoutTemplate,
  Plus,
  Check,
  X,
  Archive,
  Pencil,
  Trash2,
  RotateCcw,
  Search,
  Users,
  Layers,
  Building2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TemplateFormModal } from "@/components/platform/template-form-modal";
import { cn } from "@/lib/utils";
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

type StatusFilter = "all" | "active" | "archived";
type SortKey = "name" | "tenants" | "features";

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

  // List controls
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");

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

  // Summary stats across all templates (unfiltered).
  const stats = useMemo(() => {
    const active = templates.filter((t) => t.isActive);
    const archived = templates.filter((t) => !t.isActive);
    const tenantGrants = active.reduce((sum, t) => sum + t.activeTenantCount, 0);
    return {
      activeCount: active.length,
      archivedCount: archived.length,
      tenantGrants,
    };
  }, [templates]);

  // Apply search / status / group filters, then sort.
  const visibleTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = templates.filter((t) => {
      if (statusFilter === "active" && !t.isActive) return false;
      if (statusFilter === "archived" && t.isActive) return false;

      if (groupFilter !== "all") {
        const group = TEMPLATE_FEATURE_GROUPS.find((g) => g.label === groupFilter);
        if (group && !group.keys.some((key) => t.featureKeys.includes(key))) return false;
      }

      if (q) {
        const haystack = [
          t.name,
          t.description ?? "",
          ...t.featureKeys.map((k) => TEMPLATE_FEATURE_LABELS[k as TemplateFeatureKey] ?? k),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "tenants") return b.activeTenantCount - a.activeTenantCount;
      if (sortKey === "features") return b.featureKeys.length - a.featureKeys.length;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [templates, query, statusFilter, groupFilter, sortKey]);

  const activeVisible = visibleTemplates.filter((t) => t.isActive);
  const archivedVisible = visibleTemplates.filter((t) => !t.isActive);
  const hasAnyResult = visibleTemplates.length > 0;

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

        {/* Summary stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Layers} label="Active templates" value={stats.activeCount} />
          <StatCard icon={Building2} label="Tenant activations" value={stats.tenantGrants} />
          <StatCard icon={Archive} label="Archived" value={stats.archivedCount} />
          <StatCard icon={Users} label="Pending requests" value={requests.length} />
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
          </div>
        )}

        {/* Pending requests */}
        {requests.length > 0 && (
          <div className="mt-8">
            <h2 className="font-sans text-[13px] font-semibold text-sts-foreground">
              Pending requests ({requests.length})
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sts-card-border bg-sts-card p-3 shadow-sts-card"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[13px] text-sts-foreground">
                      <span className="font-semibold">{r.tenant.name}</span> requested{" "}
                      <span className="font-semibold">{r.template.name}</span>
                    </p>
                    <p className="mt-0.5 font-sans text-[11.5px] text-sts-subtle">
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

        {/* Controls */}
        <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sts-subtle" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates or features…"
              className="h-9 pl-8"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "archived", label: "Archived" },
              ]}
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
            />

            <SelectControl
              value={groupFilter}
              onChange={setGroupFilter}
              options={[
                { value: "all", label: "All feature groups" },
                ...TEMPLATE_FEATURE_GROUPS.map((g) => ({ value: g.label, label: g.label })),
              ]}
            />

            <SelectControl
              value={sortKey}
              onChange={(v) => setSortKey(v as SortKey)}
              options={[
                { value: "name", label: "Sort: Name" },
                { value: "tenants", label: "Sort: Most tenants" },
                { value: "features", label: "Sort: Most features" },
              ]}
            />
          </div>
        </div>

        {/* Templates list */}
        <div className="mt-6">
          {!hasAnyResult ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-sts-card-border bg-sts-card/40 px-6 py-16 text-center">
              <LayoutTemplate className="size-7 text-sts-subtle" />
              <p className="mt-3 font-sans text-[13px] font-medium text-sts-foreground">No templates match</p>
              <p className="mt-1 font-sans text-[12px] text-sts-subtle">
                {templates.length === 0
                  ? "Create your first template to start bundling settings sections."
                  : "Try clearing the search or filters."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {(statusFilter === "all" || statusFilter === "active") && activeVisible.length > 0 && (
                <TemplateSection
                  title="Active"
                  count={activeVisible.length}
                  templates={activeVisible}
                  busy={busy}
                  onEdit={openEditModal}
                  onDelete={setDeletingTemplate}
                  onRestore={restoreTemplate}
                />
              )}
              {(statusFilter === "all" || statusFilter === "archived") && archivedVisible.length > 0 && (
                <TemplateSection
                  title="Archived"
                  count={archivedVisible.length}
                  templates={archivedVisible}
                  busy={busy}
                  onEdit={openEditModal}
                  onDelete={setDeletingTemplate}
                  onRestore={restoreTemplate}
                />
              )}
            </div>
          )}
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

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sts-card-border bg-sts-card p-3.5 shadow-sts-card">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sts-blue-tint text-sts-blue">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="font-sans text-[19px] leading-none font-semibold text-sts-foreground">{value}</p>
        <p className="mt-1 truncate font-sans text-[11.5px] text-sts-subtle">{label}</p>
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-sts-card-border bg-sts-card p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-2.5 py-1 font-sans text-[12px] font-medium transition-colors",
            value === opt.value
              ? "bg-sts-blue-tint text-sts-blue"
              : "text-sts-muted hover:text-sts-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SelectControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-sts-card-border bg-sts-card px-2.5 font-sans text-[12px] font-medium text-sts-foreground outline-none focus:border-sts-blue/50"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function TemplateSection({
  title,
  count,
  templates,
  busy,
  onEdit,
  onDelete,
  onRestore,
}: {
  title: string;
  count: number;
  templates: TemplateRow[];
  busy: string | null;
  onEdit: (t: TemplateRow) => void;
  onDelete: (t: TemplateRow) => void;
  onRestore: (t: TemplateRow) => void;
}) {
  return (
    <div>
      <h2 className="font-sans text-[13px] font-semibold text-sts-foreground">
        {title} <span className="text-sts-subtle">({count})</span>
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            busy={busy === t.id}
            onEdit={() => onEdit(t)}
            onDelete={() => onDelete(t)}
            onRestore={() => onRestore(t)}
          />
        ))}
      </ul>
    </div>
  );
}

function TemplateCard({
  template: t,
  busy,
  onEdit,
  onDelete,
  onRestore,
}: {
  template: TemplateRow;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  return (
    <li
      className={cn(
        "flex flex-col rounded-xl border border-sts-card-border bg-sts-card p-4 shadow-sts-card",
        !t.isActive && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="block truncate font-sans text-[14.5px] font-semibold text-sts-foreground">
            {t.name}
          </span>
          <span className="font-sans text-[11px] text-sts-subtle">
            {t.featureKeys.length} feature{t.featureKeys.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {t.isActive ? (
            <>
              <button
                type="button"
                aria-label="Edit template"
                onClick={onEdit}
                className="flex size-7 items-center justify-center rounded-md text-sts-muted hover:bg-sts-surface hover:text-sts-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Delete template"
                disabled={busy}
                onClick={onDelete}
                className="flex size-7 items-center justify-center rounded-md text-sts-muted hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-label="Restore template"
              disabled={busy}
              onClick={onRestore}
              className="flex size-7 items-center justify-center rounded-md text-sts-muted hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {t.description && <p className="mt-1 font-sans text-[12px] text-sts-muted">{t.description}</p>}
      <div className="mt-2 flex flex-col gap-2">
        {TEMPLATE_FEATURE_GROUPS.map((group) => {
          const groupKeys = group.keys.filter((key) => t.featureKeys.includes(key));
          if (groupKeys.length === 0) return null;
          const Icon = group.icon;
          return (
            <div key={group.label}>
              <div className="flex items-center gap-1 font-sans text-[10px] font-semibold tracking-[0.5px] text-sts-subtle uppercase">
                <Icon className="size-3 text-sts-subtle" />
                {group.label}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {groupKeys.map((key) => (
                  <span
                    key={key}
                    className="rounded-full bg-sts-blue-tint px-2 py-0.5 font-sans text-[10.5px] font-medium text-sts-blue"
                  >
                    {TEMPLATE_FEATURE_LABELS[key as TemplateFeatureKey] ?? key}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-1.5 border-t border-sts-card-border/60 pt-3 font-sans text-[11.5px] text-sts-subtle">
        {t.isActive ? (
          <span>
            {t.activeTenantCount} tenant{t.activeTenantCount === 1 ? "" : "s"} active
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sts-muted">
            <Archive className="size-3" /> Archived
          </span>
        )}
      </div>
    </li>
  );
}
