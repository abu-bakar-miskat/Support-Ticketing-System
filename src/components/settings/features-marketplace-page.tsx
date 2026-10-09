"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@base-ui/react/dialog";
import {
  Building2,
  Check,
  Clock,
  LayoutGrid,
  Loader2,
  Search,
  Settings2,
  Tags,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MARKETPLACE_FEATURE_GROUPS, featureTemplateCardText, featureTemplateNarrative } from "@/lib/template-features";
import { FEATURE_ICONS, TemplatePreview } from "@/components/settings/feature-preview";
import type {
  MarketplaceDepartment,
  MarketplaceFeatureStatus,
  MarketplaceTemplate,
  MarketplaceTemplateFeature,
} from "@/lib/feature-marketplace-types";

export function FeaturesMarketplacePage({
  tenantId,
  tenantName,
  departments,
  seesAllDepartments,
  initialTemplates,
  canRequest,
  canEnable,
}: {
  tenantId: string;
  tenantName: string;
  departments: MarketplaceDepartment[];
  /** True for tenant admins and super admins — "all" then means the whole organization. */
  seesAllDepartments: boolean;
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
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "view" | "configuration">("all");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const departmentName = departments.find((department) => department.id === departmentId)?.name ?? "this department";

  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const shownRef = useRef(selected);
  if (selected) shownRef.current = selected;
  const shown = selected ?? shownRef.current;
  const shownForDepartment = shown && departmentId ? forDepartment(shown, departmentId) : shown;
  const departmentIds = departments.map((department) => department.id);
  const allStatus = shown ? statusForAll(shown, departmentIds) : "available";
  const featureTemplates = templates.filter((template) => template.board);
  const groupOrder = new Map(MARKETPLACE_FEATURE_GROUPS.map((group, index) => [group.label, index]));
  const needle = query.trim().toLowerCase();
  const groups = [...featureTemplates.reduce((map, template) => {
    const name = template.board?.group || "Features";
    const section = marketplaceKind(name);
    if (kind !== "all" && section !== kind) return map;
    if (needle && !templateMatches(template, needle)) return map;
    const list = map.get(name) ?? [];
    list.push(template);
    map.set(name, list);
    return map;
  }, new Map<string, MarketplaceTemplate[]>())].sort(
    (a, b) => (groupOrder.get(a[0]) ?? 99) - (groupOrder.get(b[0]) ?? 99),
  );
  const visibleCount = groups.reduce((sum, [, items]) => sum + items.length, 0);

  function requireDepartment() {
    if (departmentId) return true;
    setError("Choose a department first.");
    return false;
  }

  async function requestTemplateForAll(template: MarketplaceTemplate) {
    const targets = departmentIds.filter((id) => forDepartment(template, id).status === "available");
    if (targets.length === 0) {
      setError("Every department already has or has requested this template.");
      return;
    }
    setBusy(template.id);
    setError(null);
    setNotice(null);
    // Tenant admins send one organization-wide request; managers can only ask for the departments they manage.
    const bodies: { departmentId?: string; templateId: string }[] = seesAllDepartments
      ? [{ templateId: template.id }]
      : targets.map((id) => ({ departmentId: id, templateId: template.id }));
    const results = await Promise.all(
      bodies.map(async (payload) => {
        const res = await fetch("/api/feature-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        return { ok: res.ok, error: body.error as string | undefined, departmentId: payload.departmentId };
      }),
    );
    setBusy(null);
    const failed = results.find((result) => !result.ok);
    const sent = seesAllDepartments
      ? failed ? [] : targets
      : results.filter((result) => result.ok).map((result) => result.departmentId!);
    if (sent.length > 0) {
      setTemplates((prev) =>
        prev.map((item) =>
          item.id === template.id
            ? { ...item, pendingFor: sent.reduce((ids, id) => withId(ids, id, true), item.pendingFor) }
            : item,
        ),
      );
      setNotice(`${template.name} is waiting for a super admin to approve it for ${countLabel(sent.length)}.`);
      router.refresh();
    }
    if (failed) setError(failed.error ?? "Couldn't send that request");
  }

  async function setTemplateForAll(template: MarketplaceTemplate, enabled: boolean) {
    setBusy(template.id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/tenants/${tenantId}/feature-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: template.id, enabled }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? (enabled ? "Couldn't enable that template" : "Couldn't disable that template"));
      return;
    }
    setTemplates((prev) =>
      prev.map((item) =>
        item.id === template.id
          ? {
              ...item,
              pendingFor: enabled ? item.pendingFor.filter((id) => !departmentIds.includes(id)) : item.pendingFor,
              features: item.features.map((feature) => ({
                ...feature,
                enabledFor: enabled
                  ? [...new Set([...feature.enabledFor, ...departmentIds])]
                  : feature.enabledFor.filter((id) => !departmentIds.includes(id)),
                pendingFor: feature.pendingFor.filter((id) => !departmentIds.includes(id)),
              })),
            }
          : item,
      ),
    );
    setNotice(`${template.name} is ${enabled ? "enabled" : "disabled"} for every department in ${tenantName}.`);
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
            : `Feature templates for ${tenantName}. Choose any department and request a template. Once a super admin enables it, that department uses the template's setup.`}
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
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 sm:max-w-sm sm:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-sts-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search features"
                className="h-9 w-full rounded-full border border-sts-card-border bg-sts-card pr-3 pl-9 font-sans text-[13px] text-sts-foreground outline-none placeholder:text-sts-subtle focus:border-sts-id"
              />
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label="Filter features">
              {(
                [
                  { id: "all", label: "All", icon: null },
                  { id: "view", label: "Views", icon: LayoutGrid },
                  { id: "configuration", label: "Configuration", icon: Settings2 },
                ] as const
              ).map((option) => {
                const active = kind === option.id;
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setKind(option.id)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 font-sans text-[12.5px] font-medium transition-colors",
                      active
                        ? "border-sts-id bg-sts-blue-tint text-sts-id"
                        : "border-sts-card-border bg-sts-card text-sts-muted hover:text-sts-foreground",
                    )}
                  >
                    {Icon && <Icon className="size-3.5" />}
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {visibleCount === 0 ? (
            <div className="rounded-xl border border-dashed border-sts-card-border px-4 py-10 text-center font-sans text-[13px] text-sts-muted">
              No features match that search.
            </div>
          ) : (
            groups.map(([group, items]) => (
              <section key={group} className="flex flex-col gap-3">
                <h2 className="font-sans text-[12px] font-semibold tracking-wide text-sts-subtle uppercase">
                  {group}
                  <span className="ml-2 font-medium text-sts-subtle/80">{items.length}</span>
                </h2>
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
            ))
          )}
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
                    status={allStatus}
                    canRequest={canRequest}
                    canEnable={canEnable}
                    busy={busy === shownForDepartment.id}
                    onRequest={() => requestTemplateForAll(shownForDepartment)}
                    onEnable={() => setTemplateForAll(shownForDepartment, true)}
                    onDisable={() => setTemplateForAll(shownForDepartment, false)}
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

/** Enabled when every department has it; pending when every department lacking it has a request open. */
function statusForAll(template: MarketplaceTemplate, departmentIds: string[]): MarketplaceFeatureStatus {
  if (departmentIds.length === 0) return "available";
  const statuses = departmentIds.map((id) => forDepartment(template, id).status);
  if (statuses.every((status) => status === "enabled")) return "enabled";
  if (statuses.every((status) => status !== "available")) return "pending";
  return "available";
}

function countLabel(count: number) {
  return count === 1 ? "1 department" : `${count} departments`;
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

function marketplaceKind(group: string): "view" | "configuration" | "other" {
  const name = group.trim().toLowerCase();
  if (name === "sidebar" || name === "views") return "view";
  if (name.includes("configuration")) return "configuration";
  return "other";
}

function templateMatches(template: MarketplaceTemplate, needle: string) {
  const blurb = featureTemplateCardText(featureTemplateNarrative(template)) ?? "";
  const haystack = [
    template.name,
    template.board?.group ?? "",
    template.board?.useCase ?? "",
    blurb,
    ...template.features.map((feature) => feature.label),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function OperationCard({
  template,
  onOpen,
}: {
  template: MarketplaceTemplate;
  onOpen: () => void;
}) {
  const blurb = featureTemplateCardText(featureTemplateNarrative(template));
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col overflow-hidden rounded-2xl border border-sts-card-border bg-sts-card text-left transition-colors hover:border-sts-blue/50"
    >
      <div className="relative h-28 border-b border-sts-card-border">
        <TemplatePreview featureKeys={template.features.map((feature) => feature.key)} />
        {(template.status === "enabled" || template.status === "pending") && (
          <span
            className={cn(
              "absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[11px] font-medium",
              template.status === "enabled"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
            )}
          >
            {template.status === "enabled" ? <Check className="size-3" /> : <Clock className="size-3" />}
            {template.status === "enabled" ? "On" : "Pending"}
          </span>
        )}
      </div>
      <span className="flex flex-col gap-2 px-4 py-3.5">
        <span className="truncate font-sans text-[14px] font-semibold text-sts-foreground">
          {template.name}
        </span>
        {blurb && (
          <span className="line-clamp-2 font-sans text-[12.5px] leading-snug text-sts-muted">
            {blurb}
          </span>
        )}
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
      </span>
    </button>
  );
}

function TemplateAction({
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
      <Button variant="ghost" size="sm" disabled={busy} onClick={onDisable}>
        {busy && <Loader2 className="animate-spin" />}
        Disable for all departments
      </Button>
    );
  }
  if (canEnable) {
    return (
      <Button variant="ghost" size="sm" disabled={busy} onClick={onEnable}>
        {busy && <Loader2 className="animate-spin" />}
        Enable for all departments
      </Button>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-amber-500/10 px-2.5 font-sans text-[12px] font-medium text-amber-700 dark:text-amber-400">
        <Clock className="size-3" /> Pending for all departments
      </span>
    );
  }
  if (!canRequest) return null;
  return (
    <Button variant="ghost" size="sm" disabled={busy} onClick={onRequest}>
      {busy && <Loader2 className="animate-spin" />}
      Request for all departments
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


