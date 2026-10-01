"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketplaceTemplate } from "@/lib/feature-marketplace-types";

export function FeaturesMarketplacePage({
  departmentId,
  departmentName,
  initialTemplates,
  canRequest,
}: {
  departmentId: string;
  departmentName: string;
  initialTemplates: MarketplaceTemplate[];
  canRequest: boolean;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-5 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div>
        <h1 className="sts-text-admin-title">Features marketplace</h1>
        <p className="mt-[3px] max-w-2xl font-sans text-[13px] text-sts-muted">
          {canRequest
            ? `Feature templates for ${departmentName}. Request one and a super admin approves it before this department can use those features.`
            : `Feature templates enabled for ${departmentName}. Requests are approved from Feature approvals.`}
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

      {templates.length === 0 ? (
        <div className="rounded-lg border border-sts-card-border bg-sts-card px-4 py-6 font-sans text-[13px] text-sts-muted">
          No feature templates have been published yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-sts-card-border bg-sts-card px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-sans text-[13px] font-semibold text-sts-foreground">{template.name}</div>
                {template.description && (
                  <p className="mt-0.5 font-sans text-[12px] leading-snug text-sts-muted">{template.description}</p>
                )}
                {template.features.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.features.map((feature) => (
                      <span
                        key={feature.key}
                        className="rounded-full bg-sts-blue-tint px-2 py-0.5 font-sans text-[10.5px] font-medium text-sts-blue"
                      >
                        {feature.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {template.status === "enabled" || !canRequest ? (
                template.status === "enabled" ? (
                  <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 font-sans text-[11.5px] font-medium text-emerald-700 dark:text-emerald-400">
                    <Check className="size-3" /> Enabled
                  </span>
                ) : null
              ) : template.status === "pending" ? (
                <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2.5 font-sans text-[11.5px] font-medium text-amber-700 dark:text-amber-400">
                  <Clock className="size-3" /> Pending
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy === template.id}
                  onClick={() => requestTemplate(template)}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-sts-blue px-3 font-sans text-[11.5px] font-medium text-white transition-colors hover:bg-sts-blue/90 disabled:opacity-60 dark:text-gray-900",
                  )}
                >
                  {busy === template.id && <Loader2 className="size-3 animate-spin" />}
                  Request
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
