"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@base-ui/react/dialog";
import { Check, Clock, Loader2, Tags, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MARKETPLACE_FEATURE_GROUPS,
  featureTemplateCardText,
  featureTemplateNarrative,
} from "@/lib/template-features";
import { FEATURE_ICONS, TemplatePreview } from "@/components/settings/feature-preview";
import type { MarketplaceTemplate } from "@/lib/feature-marketplace-types";

const GALLERY_CATEGORIES = [
  {
    id: "views",
    label: "Views",
    keys: MARKETPLACE_FEATURE_GROUPS.find((group) => group.label === "Sidebar")?.keys ?? [],
  },
  {
    id: "configuration",
    label: "Configuration",
    keys: MARKETPLACE_FEATURE_GROUPS.find((group) => group.label === "Configuration settings")?.keys ?? [],
  },
] as const;

export function FeaturesMarketplacePage({
  departmentId,
  departmentName,
  initialTemplates,
  canRequest,
  canEnable,
}: {
  departmentId: string;
  departmentName: string;
  initialTemplates: MarketplaceTemplate[];
  canRequest: boolean;
  canEnable: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [templates, setTemplates] = useState(initialTemplates);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [category, setCategory] = useState<(typeof GALLERY_CATEGORIES)[number]["id"] | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const shownRef = useRef(selected);
  if (selected) shownRef.current = selected;
  const shown = selected ?? shownRef.current;
  const visible = templates.filter((template) => {
    if (category === "all") return true;
    const group = GALLERY_CATEGORIES.find((item) => item.id === category);
    if (!group) return true;
    return template.features.some((feature) => (group.keys as readonly string[]).includes(feature.key));
  });

  async function requestTemplate(template: MarketplaceTemplate) {
    setBusy(template.id);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/feature-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId, templateId: template.id }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Couldn't send that request");
      return;
    }
    setTemplates((prev) =>
      prev.map((item) => (item.id === template.id ? { ...item, status: "pending" } : item)),
    );
    setNotice(`${template.name} is waiting for a super admin to approve it.`);
    router.refresh();
  }

  async function enableTemplate(template: MarketplaceTemplate) {
    setBusy(template.id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/departments/${departmentId}/feature-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: template.id }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Couldn't enable that template");
      return;
    }
    setTemplates((prev) =>
      prev.map((item) => (item.id === template.id ? { ...item, status: "enabled" } : item)),
    );
    setNotice(`${template.name} is enabled for ${departmentName}.`);
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "layout"] });
    router.refresh();
  }

  async function disableTemplate(template: MarketplaceTemplate) {
    setBusy(template.id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/departments/${departmentId}/feature-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: template.id, enabled: false }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Couldn't disable that template");
      return;
    }
    setTemplates((prev) =>
      prev.map((item) => (item.id === template.id ? { ...item, status: "available" } : item)),
    );
    setNotice(`${template.name} is disabled for ${departmentName}.`);
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "layout"] });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div>
        <h1 className="sts-text-admin-title">Features marketplace</h1>
        <p className="mt-[3px] max-w-2xl font-sans text-[13px] text-sts-muted">
          {canEnable
            ? `Pre-built packages for ${departmentName}. Enable a package to turn it on for this department, or disable one that is already on.`
            : `Pre-built packages for ${departmentName}. Packages this department already has show Enabled. Request the rest and a super admin approves it before this department can use those features.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <CategoryChip active={category === "all"} onClick={() => setCategory("all")}>
          All
        </CategoryChip>
        {GALLERY_CATEGORIES.map((item) => (
          <CategoryChip key={item.id} active={category === item.id} onClick={() => setCategory(item.id)}>
            {item.label}
          </CategoryChip>
        ))}
      </div>

      {error && !selected && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-sans text-[12.5px] text-emerald-700 dark:text-emerald-400">
          {notice}
        </div>
      )}

      {templates.length === 0 ? (
        <div className="rounded-lg border border-sts-card-border bg-sts-card px-4 py-6 font-sans text-[13px] text-sts-muted">
          No feature templates have been published yet.
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-sts-card-border bg-sts-card px-4 py-6 font-sans text-[13px] text-sts-muted">
          No templates in this group.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              canRequest={canRequest}
              canEnable={canEnable}
              busy={busy === template.id}
              onOpen={() => setSelectedId(template.id)}
              onRequest={() => requestTemplate(template)}
              onEnable={() => enableTemplate(template)}
              onDisable={() => disableTemplate(template)}
            />
          ))}
        </div>
      )}

      <Dialog.Root open={selected != null} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 sts-overlay-backdrop" />
          <Dialog.Popup className="sts-glass-panel fixed top-1/2 left-1/2 z-50 grid max-h-[min(640px,calc(100vh-2rem))] w-[min(820px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-sts-card-border shadow-2xl transition-none md:grid-cols-[280px_1fr]">
            {shown && (
              <>
                <div className="relative min-h-44 border-b border-sts-card-border md:min-h-full md:border-r md:border-b-0">
                  <TemplatePreview featureKeys={shown.features.map((feature) => feature.key)} />
                </div>
                <div className="flex min-h-0 flex-col">
                  <div className="flex items-start justify-between gap-3 px-6 pt-5">
                    <div className="min-w-0">
                      <Dialog.Title className="sts-text-modal-title">{shown.name}</Dialog.Title>
                      <TemplateSummary template={shown} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="shrink-0 rounded-full p-1 text-sts-subtle hover:text-sts-foreground"
                      aria-label="Close"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="px-6 pt-4">
                    <TemplateAction
                      template={shown}
                      canRequest={canRequest}
                      canEnable={canEnable}
                      busy={busy === shown.id}
                      onRequest={() => requestTemplate(shown)}
                      onEnable={() => enableTemplate(shown)}
                      onDisable={() => disableTemplate(shown)}
                    />
                    {error && (
                      <p className="mt-3 font-sans text-[12.5px] text-destructive">{error}</p>
                    )}
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-6">
                    <IncludedFeatures template={shown} />
                  </div>
                </div>
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-full px-3 font-sans text-[12px] font-medium transition-colors",
        active
          ? "bg-sts-blue text-white dark:text-gray-900"
          : "border border-sts-card-border bg-sts-card text-sts-muted hover:text-sts-foreground",
      )}
    >
      {children}
    </button>
  );
}

function TemplateCard({
  template,
  canRequest,
  canEnable,
  busy,
  onOpen,
  onRequest,
  onEnable,
  onDisable,
}: {
  template: MarketplaceTemplate;
  canRequest: boolean;
  canEnable: boolean;
  busy: boolean;
  onOpen: () => void;
  onRequest: () => void;
  onEnable: () => void;
  onDisable: () => void;
}) {
  const extraFeatures = template.features.filter((feature) => feature.label !== template.name);
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-sts-card-border bg-sts-card text-left transition-colors hover:border-sts-blue/50">
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col text-left">
      <div className="relative h-28 border-b border-sts-card-border">
        <TemplatePreview featureKeys={template.features.map((feature) => feature.key)} />
        <div className="absolute top-2.5 right-2.5">
          <StatusBadge status={template.status} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-4 py-3">
        <div className="font-sans text-[14px] font-semibold text-sts-foreground">{template.name}</div>
        <TemplateCardBlurb template={template} />
        {extraFeatures.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {extraFeatures.map((feature) => {
              const Icon = FEATURE_ICONS[feature.key] ?? Tags;
              return (
                <span
                  key={feature.key}
                  className="inline-flex items-center gap-1 rounded-md bg-sts-surface px-1.5 py-0.5 font-sans text-[11px] text-sts-muted"
                >
                  <Icon className="size-3 text-sts-blue" />
                  {feature.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
      </button>
      {(template.status !== "enabled" || canEnable) && (
        <div className="px-4 pb-3">
          <TemplateAction
            template={template}
            canRequest={canRequest}
            canEnable={canEnable}
            busy={busy}
            onRequest={onRequest}
            onEnable={onEnable}
            onDisable={onDisable}
          />
        </div>
      )}
    </div>
  );
}

function TemplateAction({
  template,
  canRequest,
  canEnable,
  busy,
  onRequest,
  onEnable,
  onDisable,
}: {
  template: MarketplaceTemplate;
  canRequest: boolean;
  canEnable: boolean;
  busy: boolean;
  onRequest: () => void;
  onEnable: () => void;
  onDisable: () => void;
}) {
  if (template.status === "enabled") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 font-sans text-[12.5px] font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="size-3.5" /> Enabled
        </span>
        {canEnable && (
          <Button variant="outline" disabled={busy} onClick={onDisable}>
            {busy && <Loader2 className="animate-spin" />}
            Disable
          </Button>
        )}
      </div>
    );
  }
  if (canEnable) {
    return (
      <Button disabled={busy} onClick={onEnable}>
        {busy && <Loader2 className="animate-spin" />}
        Enable
      </Button>
    );
  }
  if (template.status === "pending") {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-amber-500/10 px-3 font-sans text-[12.5px] font-medium text-amber-700 dark:text-amber-400">
        <Clock className="size-3.5" /> Pending
      </span>
    );
  }
  if (!canRequest) return null;
  return (
    <Button disabled={busy} onClick={onRequest}>
      {busy && <Loader2 className="animate-spin" />}
      Request
    </Button>
  );
}

function StatusBadge({ status }: { status: MarketplaceTemplate["status"] }) {
  if (status === "enabled") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sts-card/90 px-2 py-0.5 font-sans text-[11px] font-medium text-emerald-700 shadow-sm dark:text-emerald-400">
        <Check className="size-3" /> Enabled
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sts-card/90 px-2 py-0.5 font-sans text-[11px] font-medium text-amber-700 shadow-sm dark:text-amber-400">
        <Clock className="size-3" /> Pending
      </span>
    );
  }
  return null;
}

function TemplateSummary({ template }: { template: MarketplaceTemplate }) {
  const narrative = featureTemplateNarrative(template);
  const useCase = narrative.useCases.length === 1 ? narrative.useCases[0].text : null;
  if (!narrative.customDescription && !useCase) return null;
  return (
    <Dialog.Description className="mt-3">
      {narrative.customDescription && (
        <span className="block font-sans text-[13px] leading-relaxed text-sts-muted">
          {narrative.customDescription}
        </span>
      )}
      {useCase && (
        <span className={narrative.customDescription ? "mt-3 block" : "block"}>
          <span className="block font-sans text-[11px] font-semibold tracking-wide text-sts-subtle uppercase">
            Use case
          </span>
          <span className="mt-1 block font-sans text-[13px] leading-relaxed text-sts-foreground">
            {useCase}
          </span>
        </span>
      )}
    </Dialog.Description>
  );
}

function IncludedFeatures({ template }: { template: MarketplaceTemplate }) {
  const narrative = featureTemplateNarrative(template);
  return (
    <>
      {narrative.useCases.length > 1 && (
        <div className="mb-5">
          <h2 className="font-sans text-[11px] font-semibold tracking-wide text-sts-subtle uppercase">
            Use case
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {narrative.useCases.map((item) => (
              <li key={item.key} className="font-sans text-[13px] leading-relaxed text-sts-foreground">
                <span className="font-medium">{item.label}. </span>
                <span className="text-sts-muted">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h2 className="font-sans text-[11px] font-semibold tracking-wide text-sts-subtle uppercase">
        Included
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {narrative.included.length === 0 ? (
          <li className="font-sans text-[13px] text-sts-muted">This template has no features yet.</li>
        ) : (
          narrative.included.map((feature) => {
            const Icon = FEATURE_ICONS[feature.key] ?? Tags;
            return (
              <li key={feature.key} className="flex items-start gap-3 rounded-xl bg-sts-surface px-3 py-2.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-sts-blue-tint text-sts-blue">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-sans text-[13px] font-medium text-sts-foreground">
                    {feature.label}
                  </span>
                  {feature.explanation && (
                    <span className="mt-0.5 block font-sans text-[12px] leading-snug text-sts-muted">
                      {feature.explanation}
                    </span>
                  )}
                </span>
              </li>
            );
          })
        )}
      </ul>
    </>
  );
}

function TemplateCardBlurb({ template }: { template: MarketplaceTemplate }) {
  const text = featureTemplateCardText(featureTemplateNarrative(template));
  if (!text) return null;
  return <p className="line-clamp-3 font-sans text-[12.5px] leading-snug text-sts-muted">{text}</p>;
}

