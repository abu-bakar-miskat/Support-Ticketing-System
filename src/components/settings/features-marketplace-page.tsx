"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@base-ui/react/dialog";
import {
  Building2,
  Check,
  Clock,
  DollarSign,
  Infinity as InfinityIcon,
  Loader2,
  Megaphone,
  MessageSquare,
  Monitor,
  Paperclip,
  Pencil,
  Settings,
  Tags,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { featureTemplateNarrative } from "@/lib/template-features";
import { FEATURE_ICONS, TemplatePreview } from "@/components/settings/feature-preview";
import { operationTemplateBySlug } from "@/lib/operation-templates";
import type { MarketplaceFeatureStatus, MarketplaceTemplate } from "@/lib/feature-marketplace-types";

const OPERATION_ICONS: Record<string, LucideIcon> = {
  "op-software-development": InfinityIcon,
  "op-marketing": Megaphone,
  "op-design": Pencil,
  "op-sales": Building2,
  "op-operations": Settings,
  "op-service-management": MessageSquare,
  "op-human-resources": UserRound,
  "op-legal": Paperclip,
  "op-it-operations": Monitor,
  "op-finance": DollarSign,
};

export function FeaturesMarketplacePage({
  tenantId,
  tenantName,
  initialTemplates,
  canRequest,
  canEnable,
}: {
  tenantId: string;
  tenantName: string;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const shownRef = useRef(selected);
  if (selected) shownRef.current = selected;
  const shown = selected ?? shownRef.current;
  const operations = templates.filter((template) => operationTemplateBySlug(template.slug));

  async function requestTemplate(template: MarketplaceTemplate) {
    setBusy(template.id);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/feature-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: template.id }),
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
    const res = await fetch(`/api/admin/tenants/${tenantId}/feature-templates`, {
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
      prev.map((item) =>
        item.id === template.id
          ? { ...item, status: "enabled", features: item.features.map((feature) => ({ ...feature, status: "enabled" })) }
          : item,
      ),
    );
    setNotice(`${template.name} is enabled for ${tenantName}.`);
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "layout"] });
    router.refresh();
  }

  async function disableTemplate(template: MarketplaceTemplate) {
    setBusy(template.id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/tenants/${tenantId}/feature-templates`, {
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
      prev.map((item) =>
        item.id === template.id
          ? { ...item, status: "available", features: item.features.map((feature) => ({ ...feature, status: "available" })) }
          : item,
      ),
    );
    setNotice(`${template.name} is disabled for ${tenantName}.`);
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "layout"] });
    router.refresh();
  }

  function patchFeature(templateId: string, featureKey: string, status: MarketplaceFeatureStatus) {
    setTemplates((prev) =>
      prev.map((item) => {
        if (item.id !== templateId) return item;
        const features = item.features.map((feature) =>
          feature.key === featureKey ? { ...feature, status } : feature,
        );
        const allOn = features.length > 0 && features.every((feature) => feature.status === "enabled");
        return {
          ...item,
          features,
          status: allOn ? "enabled" : item.status === "enabled" ? "available" : item.status,
        };
      }),
    );
  }

  async function requestFeature(template: MarketplaceTemplate, featureKey: string, label: string) {
    setBusy(`${template.id}:${featureKey}`);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/feature-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featureKey }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Couldn't send that request");
      return;
    }
    patchFeature(template.id, featureKey, "pending");
    setNotice(`${label} is waiting for a super admin to approve it.`);
    router.refresh();
  }

  async function setFeatureEnabled(
    template: MarketplaceTemplate,
    featureKey: string,
    label: string,
    enabled: boolean,
  ) {
    setBusy(`${template.id}:${featureKey}`);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/tenants/${tenantId}/feature-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: template.id, featureKey, enabled }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? (enabled ? "Couldn't enable that feature" : "Couldn't disable that feature"));
      return;
    }
    patchFeature(template.id, featureKey, enabled ? "enabled" : "available");
    setNotice(
      enabled
        ? `${label} is enabled for ${tenantName}.`
        : `${label} is disabled for ${tenantName}.`,
    );
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "layout"] });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div>
        <h1 className="sts-text-admin-title">Feature marketplace</h1>
        <p className="mt-[3px] max-w-2xl font-sans text-[13px] text-sts-muted">
          {canEnable
            ? `Operation setups for ${tenantName}. Open one to turn its features on or off for every department. Enabling its board also sets up that operation's statuses and lists.`
            : `Operation setups for ${tenantName}. Open one and request the features this organization needs. A super admin approves each one before any department can use it.`}
        </p>
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

      {operations.length === 0 ? (
        <div className="rounded-lg border border-sts-card-border bg-sts-card px-4 py-6 font-sans text-[13px] text-sts-muted">
          No operation templates have been published yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {operations.map((template) => (
            <OperationCard
              key={template.id}
              template={template}
              onOpen={() => setSelectedId(template.id)}
            />
          ))}
        </div>
      )}

      <Dialog.Root open={selected != null} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 sts-overlay-backdrop" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[min(760px,calc(100vh-2rem))] w-[min(860px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-sts-card-border bg-[var(--sts-card-solid)] shadow-2xl">
            {shown && (
              <>
                <div className="flex items-start justify-between gap-3 px-5 pt-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <OperationMark slug={shown.slug} />
                    <div className="min-w-0">
                      <Dialog.Title className="sts-text-modal-title">{shown.name}</Dialog.Title>
                      <TemplateSummary template={shown} />
                    </div>
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

                <OperationSetup template={shown} />

                <div className="flex items-center justify-between gap-3 px-5 pt-5">
                  <h2 className="font-sans text-[11px] font-semibold tracking-wide text-sts-subtle uppercase">
                    Features
                  </h2>
                  <TemplateAction
                    template={shown}
                    canRequest={canRequest}
                    canEnable={canEnable}
                    busy={busy === shown.id}
                    onRequest={() => requestTemplate(shown)}
                    onEnable={() => enableTemplate(shown)}
                    onDisable={() => disableTemplate(shown)}
                  />
                </div>
                {error && (
                  <p className="px-5 pt-2 font-sans text-[12.5px] text-destructive">{error}</p>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-5">
                  <IncludedFeatures
                    template={shown}
                    canRequest={canRequest}
                    canEnable={canEnable}
                    busy={busy}
                    onRequest={(featureKey, label) => requestFeature(shown, featureKey, label)}
                    onEnable={(featureKey, label) => setFeatureEnabled(shown, featureKey, label, true)}
                    onDisable={(featureKey, label) => setFeatureEnabled(shown, featureKey, label, false)}
                  />
                </div>
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function OperationCard({
  template,
  onOpen,
}: {
  template: MarketplaceTemplate;
  onOpen: () => void;
}) {
  const Icon = OPERATION_ICONS[template.slug] ?? Tags;
  const operation = operationTemplateBySlug(template.slug);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col items-start gap-3 rounded-xl border border-sts-card-border bg-sts-card px-4 py-3.5 text-left transition-colors hover:border-sts-blue/50"
    >
      <span className="flex w-full items-center gap-3">
        <Icon className="size-4 shrink-0 text-sts-blue" strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate font-sans text-[12px] font-semibold tracking-wide text-sts-foreground uppercase">
          {template.name}
        </span>
        {template.status === "enabled" && <Check className="size-3.5 shrink-0 text-emerald-600" />}
        {template.status === "pending" && <Clock className="size-3.5 shrink-0 text-amber-600" />}
      </span>
      {operation && (
        <span className="flex flex-wrap gap-1.5">
            {operation.featureKeys.map((key) => {
              const FeatureIcon = FEATURE_ICONS[key] ?? Tags;
              const feature = template.features.find((item) => item.key === key);
              const on = feature?.status === "enabled";
              return (
                <span
                  key={key}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-[11px]",
                    on ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-sts-surface text-sts-muted",
                  )}
                >
                  <FeatureIcon className={cn("size-3", on ? "text-emerald-600" : "text-sts-blue")} />
                  {feature?.label ?? key}
                </span>
              );
            })}
        </span>
      )}
    </button>
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
    if (!canEnable) return null;
    return (
      <Button variant="ghost" size="sm" disabled={busy} onClick={onDisable}>
        {busy && <Loader2 className="animate-spin" />}
        Disable all
      </Button>
    );
  }
  if (canEnable) {
    return (
      <Button variant="ghost" size="sm" disabled={busy} onClick={onEnable}>
        {busy && <Loader2 className="animate-spin" />}
        Enable all
      </Button>
    );
  }
  if (template.status === "pending") {
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-amber-500/10 px-2.5 font-sans text-[12px] font-medium text-amber-700 dark:text-amber-400">
        <Clock className="size-3" /> Pending
      </span>
    );
  }
  if (!canRequest) return null;
  return (
    <Button variant="ghost" size="sm" disabled={busy} onClick={onRequest}>
      {busy && <Loader2 className="animate-spin" />}
      Request all
    </Button>
  );
}

function OperationMark({ slug }: { slug: string }) {
  const Icon = OPERATION_ICONS[slug] ?? Tags;
  return (
    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-sts-blue-tint text-sts-blue">
      <Icon className="size-4" strokeWidth={2} />
    </span>
  );
}

function OperationSetup({ template }: { template: MarketplaceTemplate }) {
  const operation = operationTemplateBySlug(template.slug);
  if (!operation) return null;
  return (
    <div className="mx-5 mt-4 flex flex-col gap-2 rounded-xl bg-sts-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {operation.statuses.map((status) => (
          <span key={status.label} className="inline-flex items-center gap-1.5 font-sans text-[12px] text-sts-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
            {status.label}
          </span>
        ))}
      </div>
      <p className="font-sans text-[12px] text-sts-muted">
        <span className="text-sts-subtle">Lists. </span>
        {operation.lists.map((list) => list.name).join(" · ")}
      </p>
    </div>
  );
}

function TemplateSummary({ template }: { template: MarketplaceTemplate }) {
  const operation = operationTemplateBySlug(template.slug);
  const text = operation?.useCase ?? featureTemplateNarrative(template).customDescription;
  if (!text) return null;
  return (
    <Dialog.Description className="mt-0.5 font-sans text-[13px] leading-snug text-sts-muted">
      {text}
    </Dialog.Description>
  );
}

function FeatureAction({
  status,
  canRequest,
  canEnable,
  busy,
  onRequest,
  onEnable,
  onDisable,
}: {
  status: MarketplaceFeatureStatus;
  canRequest: boolean;
  canEnable: boolean;
  busy: boolean;
  onRequest: () => void;
  onEnable: () => void;
  onDisable: () => void;
}) {
  if (status === "enabled") {
    if (!canEnable) return null;
    return (
      <Button variant="outline" size="sm" disabled={busy} onClick={onDisable}>
        {busy && <Loader2 className="animate-spin" />}
        Disable
      </Button>
    );
  }
  if (status === "pending") return null;
  if (canEnable) {
    return (
      <Button size="sm" disabled={busy} onClick={onEnable}>
        {busy && <Loader2 className="animate-spin" />}
        Enable
      </Button>
    );
  }
  if (!canRequest) return null;
  return (
    <Button size="sm" disabled={busy} onClick={onRequest}>
      {busy && <Loader2 className="animate-spin" />}
      Request
    </Button>
  );
}

function IncludedFeatures({
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
  busy: string | null;
  onRequest: (featureKey: string, label: string) => void;
  onEnable: (featureKey: string, label: string) => void;
  onDisable: (featureKey: string, label: string) => void;
}) {
  const narrative = featureTemplateNarrative(template);
  if (narrative.included.length === 0) {
    return <p className="font-sans text-[13px] text-sts-muted">This operation has no features yet.</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {narrative.included.map((feature) => {
        const status = template.features.find((item) => item.key === feature.key)?.status ?? "available";
        const featureBusy = busy === `${template.id}:${feature.key}`;
        return (
          <li
            key={feature.key}
            className="flex flex-col overflow-hidden rounded-xl border border-sts-card-border bg-sts-card"
          >
            <div className="relative h-28 border-b border-sts-card-border">
              <TemplatePreview featureKeys={[feature.key]} />
              {status !== "available" && (
                <div className="absolute top-2.5 right-2.5">
                  <FeatureStatusBadge status={status} />
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 px-4 py-3">
              <div className="font-sans text-[14px] font-semibold text-sts-foreground">{feature.label}</div>
              {feature.explanation && (
                <p className="line-clamp-3 font-sans text-[12.5px] leading-snug text-sts-muted">
                  {feature.explanation}
                </p>
              )}
            </div>
            {(status === "available" || (status === "enabled" && canEnable)) && (
              <div className="px-4 pb-3">
                <FeatureAction
                  status={status}
                  canRequest={canRequest}
                  canEnable={canEnable}
                  busy={featureBusy}
                  onRequest={() => onRequest(feature.key, feature.label)}
                  onEnable={() => onEnable(feature.key, feature.label)}
                  onDisable={() => onDisable(feature.key, feature.label)}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FeatureStatusBadge({ status }: { status: MarketplaceFeatureStatus }) {
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


