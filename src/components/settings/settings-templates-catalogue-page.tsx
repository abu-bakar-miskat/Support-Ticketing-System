"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type TemplateFeatureKey } from "@/lib/template-features";

const FEATURE_LABELS: Record<TemplateFeatureKey, string> = {
  supportForm: "Support forms",
  emailSettings: "Email settings",
  apiKeys: "API keys",
  importForm: "Import from Notion",
};

export type CatalogueEntry = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  features: string[];
  status: "active" | "requested" | "available";
};

export function SettingsTemplatesCataloguePage({ initialCatalogue }: { initialCatalogue: CatalogueEntry[] }) {
  const router = useRouter();
  const [catalogue, setCatalogue] = useState(initialCatalogue);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestTemplate(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/templates/${id}/request`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to request template");
      return;
    }
    setCatalogue((prev) => prev.map((t) => (t.id === id ? { ...t, status: "requested" } : t)));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div>
        <h1 className="pen-text-admin-title">Templates</h1>
        <p className="mt-[3px] font-sans text-[13px] text-pen-muted">
          Templates bundle related settings sections together. Request one to unlock its features for your
          organization — a Super Admin will review the request.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalogue.map((t) => (
          <li
            key={t.id}
            className="flex flex-col rounded-xl border border-pen-card-border bg-pen-card p-4 shadow-pen-card"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 flex-1 truncate font-sans text-[14.5px] font-semibold text-pen-foreground">
                {t.name}
              </span>
              {t.status === "active" && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-sans text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3" /> Active
                </span>
              )}
              {t.status === "requested" && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-sans text-[10.5px] font-medium text-amber-600 dark:text-amber-400">
                  <Clock className="size-3" /> Requested
                </span>
              )}
            </div>
            {t.description && <p className="mt-1 font-sans text-[12px] text-pen-muted">{t.description}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              {t.features.map((key) => (
                <span
                  key={key}
                  className="rounded-full bg-pen-blue-tint px-2 py-0.5 font-sans text-[10.5px] font-medium text-pen-blue"
                >
                  {FEATURE_LABELS[key as TemplateFeatureKey] ?? key}
                </span>
              ))}
            </div>
            <div className={cn("mt-3 border-t border-pen-card-border/60 pt-3")}>
              <Button
                size="sm"
                variant={t.status === "available" ? "default" : "outline"}
                disabled={t.status !== "available" || busy === t.id}
                onClick={() => requestTemplate(t.id)}
                className="w-full"
              >
                {t.status === "active" ? "Already active" : t.status === "requested" ? "Pending review" : busy === t.id ? "Requesting…" : "Request access"}
              </Button>
            </div>
          </li>
        ))}
        {catalogue.length === 0 && (
          <p className="font-sans text-[13px] text-pen-muted">No templates are available in the catalogue yet.</p>
        )}
      </ul>
    </div>
  );
}
