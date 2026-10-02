"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  LayoutTemplate,
  Trash2,
  Search,
  Layers,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TEMPLATE_FEATURE_LABELS, TEMPLATE_FEATURE_GROUPS, type TemplateFeatureKey } from "@/lib/template-features";
import { featureIcon } from "@/components/settings/feature-preview";
import { cn } from "@/lib/utils";

type TemplateSetup = {
  key: string;
  statuses: { label: string; color: string; isComplete: boolean }[];
  lists: { name: string; statuses: string[] }[];
  tags: { name: string; color: string }[];
  sla: { name: string; firstResponseMins: number; resolutionMins: number }[];
  ticketTemplates: { name: string; fields: string[] }[];
  assignmentLabel: string | null;
  supportForm: { name: string; fields: string[] } | null;
  calendar: string | null;
  reportsPeriodDays: number | null;
};

type TemplateRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  featureKeys: string[];
  activeTenantCount: number;
  setup: TemplateSetup | null;
};

type SortKey = "name" | "tenants" | "features";

export function TemplatesCatalogueAdmin({
  initialTemplates,
}: {
  initialTemplates: TemplateRow[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [error, setError] = useState<string | null>(null);

  const [previewTemplate, setPreviewTemplate] = useState<TemplateRow | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<TemplateRow | null>(null);

  // List controls
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");

  async function deleteTemplate(template: TemplateRow) {
    const res = await fetch(`/api/admin/templates/${template.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to delete template");
    }
    setTemplates((prev) => prev.filter((t) => t.id !== template.id));
  }

  const visibleTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = templates.filter((t) => {
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
  }, [templates, query, groupFilter, sortKey]);

  const hasAnyResult = visibleTemplates.length > 0;

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            icon={LayoutTemplate}
            title="Feature templates"
            description="Templates saved from Customize features. Active ones show up in the Features marketplace, where a tenant admin or manager can request one."
          />
        </div>

        {/* Summary stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Layers} label="Templates" value={templates.length} />
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
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
                  ? "Save a customized feature from Customize features. It will show up here and in the Features marketplace."
                  : "Try clearing the search or filters."}
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onPreview={() => setPreviewTemplate(t)}
                  onDelete={() => setDeletingTemplate(t)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <TemplatePreviewDialog
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
      />

      <ConfirmDialog
        open={deletingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingTemplate(null);
        }}
        title="Delete template"
        description={
          deletingTemplate
            ? `"${deletingTemplate.name}" will be removed from this list and from the Features marketplace. Departments that already have it keep those features.`
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

function StatCard({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sts-card-border bg-sts-card p-3.5 shadow-sts-card">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sts-blue-tint text-sts-blue">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="font-sans text-[19px] leading-none font-semibold text-sts-foreground">{value}</p>
        <p className="mt-1 truncate font-sans text-[11.5px] text-sts-subtle">{label}</p>
      </div>
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

function TemplateCard({
  template: t,
  onPreview,
  onDelete,
}: {
  template: TemplateRow;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const extraFeatures = t.featureKeys.filter(
    (key) => (TEMPLATE_FEATURE_LABELS[key as TemplateFeatureKey] ?? key) !== t.name,
  );
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-xl border border-sts-card-border bg-sts-card shadow-sts-card transition-colors hover:border-sts-blue/50">
      <button type="button" onClick={onPreview} className="relative h-28 border-b border-sts-card-border text-left">
        <SavedWorkflowPreview template={t} compact />
      </button>
      <button
        type="button"
        aria-label="Delete template"
        onClick={onDelete}
        className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-sts-card/90 text-sts-muted shadow-sm hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>

      {/* Body */}
      <button type="button" onClick={onPreview} className="flex flex-1 flex-col gap-1 px-4 py-3 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate font-sans text-[14px] font-semibold text-sts-foreground">
            {t.name}
          </span>
          <span className="shrink-0 font-sans text-[11px] text-sts-subtle">
            {t.featureKeys.length} feature{t.featureKeys.length === 1 ? "" : "s"}
          </span>
        </div>
        {t.description && (
          <p className="line-clamp-2 font-sans text-[12.5px] leading-snug text-sts-muted">{t.description}</p>
        )}
        {extraFeatures.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {extraFeatures.map((key) => {
              const Icon = featureIcon(key);
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 rounded-md bg-sts-surface px-1.5 py-0.5 font-sans text-[11px] text-sts-muted"
                >
                  <Icon className="size-3 text-sts-blue" />
                  {TEMPLATE_FEATURE_LABELS[key as TemplateFeatureKey] ?? key}
                </span>
              );
            })}
          </div>
        )}
      </button>

      {/* Footer status */}
      <div className="border-t border-sts-card-border/60 px-4 py-3 font-sans text-[11.5px] text-sts-subtle">
        <span>Available in the Features marketplace</span>
      </div>
    </li>
  );
}

function TemplatePreviewDialog({
  template,
  onClose,
}: {
  template: TemplateRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={template != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 sts-overlay-backdrop" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[min(720px,calc(100vh-2rem))] w-[min(860px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-sts-card-border bg-[var(--sts-card-solid)] shadow-2xl">
          {template && (
            <>
              <div className="flex items-start justify-between gap-3 px-5 pt-5">
                <div className="min-w-0">
                  <Dialog.Title className="sts-text-modal-title">{template.name}</Dialog.Title>
                  {template.description && (
                    <Dialog.Description className="mt-1 font-sans text-[13px] leading-snug text-sts-muted">
                      {template.description}
                    </Dialog.Description>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-full p-1 text-sts-subtle hover:text-sts-foreground"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="overflow-y-auto px-5 pt-4 pb-5">
                <SavedWorkflowPreview template={template} />
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SavedWorkflowPreview({ template, compact = false }: { template: TemplateRow; compact?: boolean }) {
  const setup = template.setup;
  const key = setup?.key ?? template.featureKeys[0] ?? "";
  const statuses = setup?.statuses ?? [];

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-sts-surface", !compact && "rounded-xl border border-sts-card-border p-4")}>
      {compact && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--sts-blue) 20%, transparent), transparent 62%)",
          }}
        />
      )}
      <div className={cn("relative", compact && "flex h-full items-center px-4")}>
        {(key === "board" || key === "workflows") && statuses.length > 0 ? (
          <BoardWorkflow statuses={statuses} lists={setup?.lists ?? []} compact={compact} />
        ) : key === "tagsLabels" && setup && setup.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {setup.tags.map((tag) => (
              <span
                key={tag.name}
                className="inline-flex items-center gap-1.5 rounded-full bg-sts-card px-2 py-1 font-sans text-[12px] text-sts-foreground"
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </span>
            ))}
          </div>
        ) : key === "slaPolicies" && setup && setup.sla.length > 0 ? (
          <div className="flex flex-col gap-2">
            {setup.sla.map((policy) => (
              <div key={policy.name} className="font-sans text-[12px] text-sts-foreground">
                <span className="font-medium">{policy.name}</span>
                <span className="text-sts-muted">
                  {" "}
                  · reply {formatMinutes(policy.firstResponseMins)} · resolve {formatMinutes(policy.resolutionMins)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <FallbackPreview template={template} compact={compact} />
        )}
      </div>
    </div>
  );
}

function BoardWorkflow({
  statuses,
  lists,
  compact,
}: {
  statuses: TemplateSetup["statuses"];
  lists: TemplateSetup["lists"];
  compact: boolean;
}) {
  const shown = compact ? statuses.slice(0, 4) : statuses;
  return (
    <div className="flex w-full flex-col gap-3">
      <div className={cn("flex gap-1.5", compact ? "w-full" : "overflow-x-auto pb-1")}>
        {shown.map((status) => (
          <div
            key={status.label}
            className={cn(
              "flex min-w-0 flex-1 flex-col gap-1 rounded-md bg-sts-card/80 p-1.5",
              !compact && "w-36 max-w-40 shrink-0 flex-none",
            )}
          >
            <span className="flex items-center gap-1">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
              <span className="truncate font-sans text-[10px] text-sts-muted">{status.label}</span>
            </span>
            <span className={cn("rounded-sm bg-sts-blue/25", compact ? "h-6" : "h-10")} />
            {!compact && <span className="h-8 rounded-sm bg-sts-foreground/10" />}
          </div>
        ))}
      </div>
      {!compact && lists.length > 0 && (
        <p className="font-sans text-[12px] text-sts-muted">
          <span className="text-sts-subtle">Lists. </span>
          {lists.map((list) => list.name).join(" · ")}
        </p>
      )}
    </div>
  );
}

function FallbackPreview({ template, compact }: { template: TemplateRow; compact: boolean }) {
  const setup = template.setup;
  const lines = [
    setup?.assignmentLabel,
    setup?.calendar,
    setup?.reportsPeriodDays ? `Last ${setup.reportsPeriodDays} days` : null,
    setup?.supportForm ? [setup.supportForm.name, setup.supportForm.fields.join(", ")].filter(Boolean).join(" — ") : null,
    setup?.ticketTemplates.map((item) => item.name).filter(Boolean).join(" · ") || null,
  ].filter((line): line is string => !!line);
  const Icon = featureIcon(setup?.key ?? template.featureKeys[0] ?? "");
  if (lines.length === 0) {
    return (
      <span className="flex size-12 items-center justify-center rounded-2xl bg-sts-blue-tint text-sts-blue">
        <Icon className={compact ? "size-6" : "size-6"} />
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {lines.map((line) => (
        <p key={line} className="font-sans text-[12px] text-sts-foreground">{line}</p>
      ))}
    </div>
  );
}

function formatMinutes(mins: number): string {
  if (mins % 1440 === 0) return `${mins / 1440}d`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${mins}m`;
}
