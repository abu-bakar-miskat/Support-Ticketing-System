"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@base-ui/react/dialog";
import {
  BarChart3,
  CalendarDays,
  Check,
  Clock,
  FileStack,
  GanttChart,
  Inbox,
  KeyRound,
  Loader2,
  Network,
  Tags,
  UserRoundCheck,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MARKETPLACE_FEATURE_DESCRIPTIONS,
  MARKETPLACE_FEATURE_GROUPS,
  isMarketplaceFeatureKey,
} from "@/lib/template-features";
import type { MarketplaceTemplate } from "@/lib/feature-marketplace-types";

const FEATURE_ICONS: Record<string, LucideIcon> = {
  timeline: GanttChart,
  reports: BarChart3,
  subDepartmentReports: Network,
  calendar: CalendarDays,
  sharedMailboxes: Inbox,
  tagsLabels: Tags,
  workflows: Workflow,
  ticketTemplates: FileStack,
  assignmentMethods: UserRoundCheck,
  apiKeys: KeyRound,
};

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
                      {shown.description && (
                        <Dialog.Description className="mt-1.5 font-sans text-[13px] leading-relaxed text-sts-muted">
                          {shown.description}
                        </Dialog.Description>
                      )}
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
                    <h2 className="font-sans text-[11px] font-semibold tracking-wide text-sts-subtle uppercase">
                      Included
                    </h2>
                    <ul className="mt-2 flex flex-col gap-2">
                      {shown.features.length === 0 ? (
                        <li className="font-sans text-[13px] text-sts-muted">This template has no features yet.</li>
                      ) : (
                        shown.features.map((feature) => {
                          const Icon = FEATURE_ICONS[feature.key] ?? Tags;
                          const blurb = featureBlurb(feature.key, shown.description);
                          return (
                            <li key={feature.key} className="flex items-start gap-3 rounded-xl bg-sts-surface px-3 py-2.5">
                              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-sts-blue-tint text-sts-blue">
                                <Icon className="size-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block font-sans text-[13px] font-medium text-sts-foreground">
                                  {feature.label}
                                </span>
                                {blurb && (
                                  <span className="mt-0.5 block font-sans text-[12px] leading-snug text-sts-muted">
                                    {blurb}
                                  </span>
                                )}
                              </span>
                            </li>
                          );
                        })
                      )}
                    </ul>
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
        {template.description && (
          <p className="line-clamp-2 font-sans text-[12.5px] leading-snug text-sts-muted">{template.description}</p>
        )}
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

function featureBlurb(key: string, templateDescription: string | null): string | null {
  if (!isMarketplaceFeatureKey(key)) return null;
  const blurb = MARKETPLACE_FEATURE_DESCRIPTIONS[key];
  if (templateDescription && blurb.trim().toLowerCase() === templateDescription.trim().toLowerCase()) return null;
  return blurb;
}

function TemplatePreview({ featureKeys }: { featureKeys: string[] }) {
  const featureKey = featureKeys[0] ?? null;
  return (
    <div className="relative h-full w-full overflow-hidden bg-sts-surface">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--sts-blue) 20%, transparent), transparent 62%)",
        }}
      />
      <div className="relative flex h-full items-center justify-center px-6">
        <PreviewGraphic featureKey={featureKey} />
      </div>
    </div>
  );
}

function PreviewGraphic({ featureKey }: { featureKey: string | null }) {
  if (featureKey === "timeline") {
    return (
      <div className="flex w-full max-w-52 flex-col gap-2">
        <PreviewBar width="92%" />
        <PreviewBar width="58%" offset />
        <PreviewBar width="74%" />
      </div>
    );
  }
  if (featureKey === "reports") {
    const heights = ["42%", "78%", "55%", "92%", "64%"];
    return (
      <div className="flex h-16 w-full max-w-44 items-end gap-1.5">
        {heights.map((height) => (
          <div key={height} className="flex-1 rounded-sm bg-sts-blue/80" style={{ height }} />
        ))}
      </div>
    );
  }
  if (featureKey === "subDepartmentReports") {
    return (
      <div className="w-full max-w-44 font-sans text-[11px] text-sts-foreground">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-sts-blue" />
          <span className="h-2 w-16 rounded-full bg-sts-foreground/80" />
        </div>
        <div className="mt-1.5 ml-0.5 border-l border-sts-blue/40 pl-3">
          <div className="flex items-center gap-2 py-1">
            <span className="size-1.5 rounded-full bg-sts-blue/70" />
            <span className="h-1.5 w-12 rounded-full bg-sts-muted/70" />
          </div>
          <div className="flex items-center gap-2 py-1">
            <span className="size-1.5 rounded-full bg-sts-blue/70" />
            <span className="h-1.5 w-14 rounded-full bg-sts-muted/70" />
          </div>
        </div>
      </div>
    );
  }
  if (featureKey === "calendar") {
    return (
      <div className="grid w-full max-w-40 grid-cols-7 gap-1">
        {Array.from({ length: 21 }, (_, index) => (
          <span
            key={index}
            className={cn(
              "aspect-square rounded-[3px]",
              [3, 8, 9, 15, 16].includes(index) ? "bg-sts-blue" : "bg-sts-foreground/10",
            )}
          />
        ))}
      </div>
    );
  }
  if (featureKey === "sharedMailboxes") {
    return (
      <div className="flex w-full max-w-48 flex-col gap-1.5">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-2 rounded-md bg-sts-card/80 px-2 py-1.5">
            <span className="size-4 shrink-0 rounded-full bg-sts-blue/80" />
            <span className="h-1.5 flex-1 rounded-full bg-sts-foreground/15" />
          </div>
        ))}
      </div>
    );
  }
  if (featureKey === "tagsLabels") {
    return (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="rounded-full bg-sts-blue px-2.5 py-1 font-sans text-[11px] font-medium text-white dark:text-gray-900">
          Urgent
        </span>
        <span className="rounded-full bg-sts-blue/20 px-2.5 py-1 font-sans text-[11px] font-medium text-sts-blue">
          Billing
        </span>
        <span className="rounded-full bg-sts-foreground/10 px-2.5 py-1 font-sans text-[11px] font-medium text-sts-foreground">
          VIP
        </span>
      </div>
    );
  }
  if (featureKey === "workflows") {
    return (
      <div className="flex w-full max-w-52 items-center">
        {["Open", "Doing", "Done"].map((label, index) => (
          <div key={label} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1">
              <span className={cn("size-3 rounded-full", index === 2 ? "bg-sts-blue" : "bg-sts-blue/35")} />
              <span className="font-sans text-[10px] text-sts-muted">{label}</span>
            </div>
            {index < 2 && <span className="mx-1 mb-4 h-px flex-1 bg-sts-blue/40" />}
          </div>
        ))}
      </div>
    );
  }
  if (featureKey === "ticketTemplates") {
    return (
      <div className="relative h-14 w-full max-w-40">
        <div className="absolute inset-x-3 top-0 h-12 rounded-md border border-sts-card-border bg-sts-card/70" />
        <div className="absolute inset-x-1.5 top-2 h-12 rounded-md border border-sts-card-border bg-sts-card px-2.5 py-2">
          <div className="h-1.5 w-10 rounded-full bg-sts-blue" />
          <div className="mt-1.5 h-1 w-full rounded-full bg-sts-foreground/15" />
          <div className="mt-1 h-1 w-2/3 rounded-full bg-sts-foreground/10" />
        </div>
      </div>
    );
  }
  if (featureKey === "assignmentMethods") {
    return (
      <div className="flex items-center gap-2">
        <span className="size-8 rounded-full bg-sts-blue/80" />
        <span className="h-px w-8 bg-sts-blue/50" />
        <span className="h-8 w-16 rounded-md bg-sts-card px-2 py-1.5 shadow-sm">
          <span className="block h-1.5 w-8 rounded-full bg-sts-foreground/20" />
          <span className="mt-1 block h-1 w-5 rounded-full bg-sts-blue/70" />
        </span>
      </div>
    );
  }
  if (featureKey === "apiKeys") {
    return (
      <div className="w-full max-w-48 rounded-lg bg-sts-card px-3 py-2 font-mono text-[12px] text-sts-foreground shadow-sm">
        sk_live_••••••••
      </div>
    );
  }
  const Icon = (featureKey && FEATURE_ICONS[featureKey]) || Tags;
  return (
    <span className="flex size-12 items-center justify-center rounded-2xl bg-sts-blue-tint text-sts-blue">
      <Icon className="size-6" />
    </span>
  );
}

function PreviewBar({ width, offset = false }: { width: string; offset?: boolean }) {
  return (
    <div className={cn("h-2.5 rounded-full bg-sts-foreground/10", offset && "ml-6")}>
      <div className="h-full rounded-full bg-sts-blue" style={{ width }} />
    </div>
  );
}
