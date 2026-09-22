"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Check, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type TemplateFeatureKey, TEMPLATE_FEATURE_LABELS } from "@/lib/template-features";

export type CatalogueEntry = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  features: string[];
  status: "active" | "requested" | "available";
};

export function SettingsTemplatesCataloguePage({
  initialCatalogue,
  approvalRequired,
}: {
  initialCatalogue: CatalogueEntry[];
  approvalRequired: boolean;
}) {
  const router = useRouter();
  const [catalogue, setCatalogue] = useState(initialCatalogue);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<CatalogueEntry | null>(null);

  async function enableTemplate(template: CatalogueEntry) {
    setBusy(template.id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/templates/${template.id}/enable`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Failed to enable template");
      return;
    }
    const status = body.status === "requested" ? "requested" : "active";
    setCatalogue((prev) => prev.map((t) => (t.id === template.id ? { ...t, status } : t)));
    setNotice(
      status === "active"
        ? `${template.name} is now active for your organization.`
        : `Enablement request for ${template.name} is pending approval. A Super Admin has been notified.`,
    );
    setConfirming(null);
    router.refresh();
  }

  const active = catalogue.filter((t) => t.status === "active");

  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div>
        <h1 className="sts-text-admin-title">Template Marketplace</h1>
        <p className="mt-[3px] font-sans text-[13px] text-sts-muted">
          Published templates available to your organization. Enable one to add it to your active templates.
          {approvalRequired
            ? " Enablement requests stay inactive until a Super Admin approves them."
            : ""}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-sans text-[12.5px] text-emerald-700 dark:text-emerald-400">
          {notice}
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalogue.map((t) => (
          <li
            key={t.id}
            className="flex flex-col rounded-xl border border-sts-card-border bg-sts-card p-4 shadow-sts-card"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 flex-1 truncate font-sans text-[14.5px] font-semibold text-sts-foreground">
                {t.name}
              </span>
              {t.status === "active" && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-sans text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3" /> Active
                </span>
              )}
              {t.status === "requested" && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-sans text-[10.5px] font-medium text-amber-600 dark:text-amber-400">
                  <Clock className="size-3" /> Pending Approval
                </span>
              )}
            </div>
            {t.description && <p className="mt-1 font-sans text-[12px] text-sts-muted">{t.description}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              {t.features.map((key) => (
                <span
                  key={key}
                  className="rounded-full bg-sts-blue-tint px-2 py-0.5 font-sans text-[10.5px] font-medium text-sts-blue"
                >
                  {TEMPLATE_FEATURE_LABELS[key as TemplateFeatureKey] ?? key}
                </span>
              ))}
            </div>
            <div className={cn("mt-3 border-t border-sts-card-border/60 pt-3")}>
              <Button
                size="sm"
                variant={t.status === "available" ? "default" : "outline"}
                disabled={t.status !== "available" || busy === t.id}
                onClick={() => setConfirming(t)}
                className="w-full"
              >
                {t.status === "active"
                  ? "Already active"
                  : t.status === "requested"
                    ? "Pending Approval"
                    : "Enable"}
              </Button>
            </div>
          </li>
        ))}
        {catalogue.length === 0 && (
          <p className="font-sans text-[13px] text-sts-muted">No templates are published in the marketplace yet.</p>
        )}
      </ul>

      {active.length > 0 && (
        <section className="mt-2">
          <h2 className="font-sans text-[13px] font-semibold text-sts-foreground">Active templates</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {active.map((t) => (
              <li key={t.id} className="font-sans text-[13px] text-sts-muted">
                {t.name}
                {t.description ? ` — ${t.description}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AlertDialog.Root open={confirming !== null} onOpenChange={(open) => { if (!busy && !open) setConfirming(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 sts-overlay-backdrop" />
          <AlertDialog.Popup className="sts-glass-panel fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-sts-card-border p-6 shadow-2xl">
            <AlertDialog.Title className="sts-text-modal-title">
              Enable {confirming?.name ?? "template"}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 font-sans text-[13px] text-sts-subtle">
              {approvalRequired
                ? `This sends an enablement request for ${confirming?.name ?? "this template"}. It stays inactive until a Super Admin approves it.`
                : `This enables ${confirming?.name ?? "this template"} for your organization. You will see it in active templates.`}
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" disabled={busy !== null} onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                disabled={busy !== null || !confirming}
                onClick={() => { if (confirming) void enableTemplate(confirming); }}
              >
                {busy && <Loader2 className="animate-spin" />}
                Confirm
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
