"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@base-ui/react/dialog";
import {
  Building2,
  Check,
  Clock,
  Loader2,
  Tags,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MARKETPLACE_FEATURE_GROUPS, featureTemplateNarrative } from "@/lib/template-features";
import { FEATURE_ICONS, TemplatePreview } from "@/components/settings/feature-preview";
import type {
  MarketplaceDepartment,
  MarketplaceFeatureStatus,
  MarketplaceTemplate,
  MarketplaceTemplateFeature,
} from "@/lib/feature-marketplace-types";

export function FeaturesMarketplacePage({
  tenantName,
  departments,
  initialTemplates,
  canRequest,
  canEnable,
}: {
  tenantName: string;
  departments: MarketplaceDepartment[];
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
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const departmentName = departments.find((department) => department.id === departmentId)?.name ?? "this department";

  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const shownRef = useRef(selected);
  if (selected) shownRef.current = selected;
  const shown = selected ?? shownRef.current;
  const shownForDepartment = shown && departmentId ? forDepartment(shown, departmentId) : shown;
  const featureTemplates = templates.filter((template) => template.board);
  const groupOrder = new Map(MARKETPLACE_FEATURE_GROUPS.map((group, index) => [group.label, index]));
  const groups = [...featureTemplates.reduce((map, template) => {
    const name = template.board?.group || "Features";
    const list = map.get(name) ?? [];
    list.push(template);
    map.set(name, list);
    return map;
  }, new Map<string, MarketplaceTemplate[]>())].sort(
    (a, b) => (groupOrder.get(a[0]) ?? 99) - (groupOrder.get(b[0]) ?? 99),
  );

  function requireDepartment() {
    if (departmentId) return true;
    setError("Choose a department first.");
    return false;
  }

  async function requestTemplate(template: MarketplaceTemplate) {
    if (!requireDepartment()) return;
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
      prev.map((item) =>
        item.id === template.id
          ? { ...item, pendingFor: withId(item.pendingFor, departmentId, true) }
          : item,
      ),
    );
    setNotice(`${template.name} is waiting for a super admin to approve it for ${departmentName}.`);
    router.refresh();
  }

  async function enableTemplate(template: MarketplaceTemplate) {
    if (!requireDepartment()) return;
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
      prev.map((item) =>
        item.id === template.id
          ? {
              ...item,
              pendingFor: withId(item.pendingFor, departmentId, false),
              features: item.features.map((feature) => ({
                ...feature,
                enabledFor: withId(feature.enabledFor, departmentId, true),
                pendingFor: withId(feature.pendingFor, departmentId, false),
              })),
            }
          : item,
      ),
    );
    setNotice(`${template.name} is enabled for ${departmentName}.`);
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "layout"] });
    router.refresh();
  }

  async function disableTemplate(template: MarketplaceTemplate) {
    if (!requireDepartment()) return;
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
      prev.map((item) =>
        item.id === template.id
          ? {
              ...item,
              features: item.features.map((feature) => ({
                ...feature,
                enabledFor: withId(feature.enabledFor, departmentId, false),
                pendingFor: withId(feature.pendingFor, departmentId, false),
              })),
            }
          : item,
      ),
    );
    setNotice(`${template.name} is disabled for ${departmentName}.`);
    await queryClient.invalidateQueries({ queryKey: ["dashboard", "layout"] });
    router.refresh();
  }

  function patchFeature(templateId: string, featureKey: string, status: MarketplaceFeatureStatus) {
    setTemplates((prev) =>
      prev.map((item) => {
        if (item.id !== templateId) return item;
        return {
          ...item,
          features: item.features.map((feature) =>
            feature.key === featureKey
              ? {
                  ...feature,
                  enabledFor: withId(feature.enabledFor, departmentId, status === "enabled"),
                  pendingFor: withId(feature.pendingFor, departmentId, status === "pending"),
                }
              : feature,
          ),
        };
      }),
    );
  }

  async function requestFeature(template: MarketplaceTemplate, featureKey: string, label: string) {
    if (!requireDepartment()) return;
    setBusy(`${template.id}:${featureKey}`);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/feature-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId, featureKey, templateId: template.id }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Couldn't send that request");
      return;
    }
    patchFeature(template.id, featureKey, "pending");
    setNotice(`${label} is waiting for a super admin to approve it for ${departmentName}.`);
    router.refresh();
  }

  async function setFeatureEnabled(
    template: MarketplaceTemplate,
    featureKey: string,
    label: string,
    enabled: boolean,
  ) {
    if (!requireDepartment()) return;
    setBusy(`${template.id}:${featureKey}`);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/departments/${departmentId}/feature-templates`, {
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
        ? `${label} is enabled for ${departmentName}.`
        : `${label} is disabled for ${departmentName}.`,
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
            ? `Feature templates for ${tenantName}. Open one, choose a department, and turn it on. A board template also sets up that version's statuses and lists.`
            : `Feature templates for ${tenantName}. Open one, choose a department, and request it. A super admin approves it before that department can use it.`}
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

      {featureTemplates.length === 0 ? (
        <div className="rounded-lg border border-sts-card-border bg-sts-card px-4 py-6 font-sans text-[13px] text-sts-muted">
          No feature templates have been saved yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([group, items]) => (
            <section key={group} className="flex flex-col gap-3">
              <h2 className="font-sans text-[12px] font-semibold tracking-wide text-sts-subtle uppercase">{group}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((template) => (
                  <OperationCard
                    key={template.id}
                    template={template}
                    onOpen={() => setSelectedId(template.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog.Root open={selected != null} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 sts-overlay-backdrop" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[min(760px,calc(100vh-2rem))] w-[min(860px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-sts-card-border bg-[var(--sts-card-solid)] shadow-2xl">
            {shownForDepartment && (
              <>
                <div className="flex items-start justify-between gap-3 px-5 pt-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <FeatureMark featureKey={shownForDepartment.features[0]?.key} />
                    <div className="min-w-0">
                      <Dialog.Title className="sts-text-modal-title">{shownForDepartment.name}</Dialog.Title>
                      <TemplateSummary template={shownForDepartment} />
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

                <OperationSetup template={shownForDepartment} />

                <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-sans text-[11px] font-semibold tracking-wide text-sts-subtle uppercase">
                      Department
                    </span>
                    <Select
                      value={departmentId}
                      onValueChange={(value) => setDepartmentId(value ?? "")}
                    >
                      <SelectTrigger className="h-9 min-w-52 rounded-full border-sts-card-border bg-sts-surface px-3 font-sans text-[13px] font-medium text-sts-foreground">
                        <Building2 className="size-3.5 text-sts-blue" />
                        <span className="truncate">
                          {departments.find((department) => department.id === departmentId)?.name ?? "Choose a department"}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="min-w-52 rounded-xl p-1">
                        {departments.map((department) => (
                          <SelectItem key={department.id} value={department.id} className="font-sans text-[13px]">
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <TemplateAction
                    template={shownForDepartment}
                    canRequest={canRequest}
                    canEnable={canEnable}
                    busy={busy === shownForDepartment.id}
                    onRequest={() => requestTemplate(shownForDepartment)}
                    onEnable={() => enableTemplate(shownForDepartment)}
                    onDisable={() => disableTemplate(shownForDepartment)}
                  />
                </div>
                {error && (
                  <p className="px-5 pt-2 font-sans text-[12.5px] text-destructive">{error}</p>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-5">
                  <IncludedFeatures
                    template={shownForDepartment}
                    canRequest={canRequest}
                    canEnable={canEnable}
                    busy={busy}
                    onRequest={(featureKey, label) => requestFeature(shownForDepartment, featureKey, label)}
                    onEnable={(featureKey, label) => setFeatureEnabled(shownForDepartment, featureKey, label, true)}
                    onDisable={(featureKey, label) => setFeatureEnabled(shownForDepartment, featureKey, label, false)}
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

function withId(ids: string[], id: string, on: boolean) {
  if (!id) return ids;
  if (on) return ids.includes(id) ? ids : [...ids, id];
  return ids.filter((item) => item !== id);
}

function forDepartment(template: MarketplaceTemplate, departmentId: string): MarketplaceTemplate {
  const features: MarketplaceTemplateFeature[] = template.features.map((feature) => ({
    ...feature,
    status: feature.enabledFor.includes(departmentId)
      ? "enabled"
      : feature.pendingFor.includes(departmentId)
        ? "pending"
        : "available",
  }));
  const allOn = features.length > 0 && features.every((feature) => feature.status === "enabled");
  return {
    ...template,
    features,
    status: allOn ? "enabled" : template.pendingFor.includes(departmentId) ? "pending" : "available",
  };
}

function OperationCard({
  template,
  onOpen,
}: {
  template: MarketplaceTemplate;
  onOpen: () => void;
}) {
  const Icon = FEATURE_ICONS[template.features[0]?.key ?? ""] ?? Tags;
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
      <span className="flex flex-wrap gap-1.5">
        {template.features.map((feature) => {
          const FeatureIcon = FEATURE_ICONS[feature.key] ?? Tags;
          const on = feature.status === "enabled";
          return (
            <span
              key={feature.key}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-[11px]",
                on ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-sts-surface text-sts-muted",
              )}
            >
              <FeatureIcon className={cn("size-3", on ? "text-emerald-600" : "text-sts-blue")} />
              {feature.label}
            </span>
          );
        })}
      </span>
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

function FeatureMark({ featureKey }: { featureKey: string | undefined }) {
  const Icon = FEATURE_ICONS[featureKey ?? ""] ?? Tags;
  return (
    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-sts-blue-tint text-sts-blue">
      <Icon className="size-4" strokeWidth={2} />
    </span>
  );
}

function OperationSetup({ template }: { template: MarketplaceTemplate }) {
  const board = template.board;
  if (!board || (board.statuses.length === 0 && board.lists.length === 0)) return null;
  return (
    <div className="mx-5 mt-4 flex flex-col gap-2 rounded-xl bg-sts-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {board.statuses.map((status) => (
          <span key={status.label} className="inline-flex items-center gap-1.5 font-sans text-[12px] text-sts-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
            {status.label}
          </span>
        ))}
      </div>
      {board.lists.length > 0 && (
        <p className="font-sans text-[12px] text-sts-muted">
          <span className="text-sts-subtle">Lists. </span>
          {board.lists.map((list) => list.name).join(" · ")}
        </p>
      )}
    </div>
  );
}

function TemplateSummary({ template }: { template: MarketplaceTemplate }) {
  const text = template.board?.useCase || featureTemplateNarrative(template).customDescription;
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
    return <p className="font-sans text-[13px] text-sts-muted">This template has no features yet.</p>;
  }
  const included = new Map(narrative.included.map((feature) => [feature.key, feature]));
  const groups = MARKETPLACE_FEATURE_GROUPS
    .map((group) => ({
      label: group.label,
      features: group.keys.flatMap((key) => {
        const feature = included.get(key);
        return feature ? [feature] : [];
      }),
    }))
    .filter((group) => group.features.length > 0);
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-3">
          <h3 className="font-sans text-[12px] font-semibold tracking-wide text-sts-subtle uppercase">{group.label}</h3>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.features.map((feature) => {
              const status = template.features.find((item) => item.key === feature.key)?.status ?? "available";
              const detail = template.board?.featureDetails.find((item) => item.key === feature.key);
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
                    {(detail?.explanation || feature.explanation) && (
                      <p className="line-clamp-3 font-sans text-[12.5px] leading-snug text-sts-muted">
                        {detail?.explanation || feature.explanation}
                      </p>
                    )}
                    {detail?.summary && (
                      <p className="font-sans text-[12px] text-sts-foreground">{detail.summary}</p>
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
        </section>
      ))}
    </div>
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


