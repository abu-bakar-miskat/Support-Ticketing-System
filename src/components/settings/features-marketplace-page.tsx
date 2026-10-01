"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketplaceFeature } from "@/lib/feature-marketplace-types";

export function FeaturesMarketplacePage({
  departmentId,
  departmentName,
  initialFeatures,
  canRequest,
}: {
  departmentId: string;
  departmentName: string;
  initialFeatures: MarketplaceFeature[];
  canRequest: boolean;
}) {
  const router = useRouter();
  const [features, setFeatures] = useState(initialFeatures);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const groups = [...new Set(features.map((feature) => feature.group))];

  async function requestFeature(feature: MarketplaceFeature) {
    setBusy(feature.key);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/feature-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId, featureKey: feature.key }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Couldn't send that request");
      return;
    }
    setFeatures((prev) =>
      prev.map((item) => (item.key === feature.key ? { ...item, status: "pending" } : item)),
    );
    setNotice(`${feature.label} is waiting for a super admin to approve it.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div>
        <h1 className="sts-text-admin-title">Features marketplace</h1>
        <p className="mt-[3px] max-w-2xl font-sans text-[13px] text-sts-muted">
          {canRequest
            ? `Optional features for ${departmentName}. Request one and a super admin approves it before this department can see or use it.`
            : `Optional features enabled for ${departmentName}. Requests are approved from Feature approvals.`}
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

      {groups.map((group) => (
        <section key={group} className="flex flex-col gap-2">
          <h2 className="font-sans text-[11px] font-semibold uppercase tracking-wide text-sts-subtle">
            {group}
          </h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {features
              .filter((feature) => feature.group === group)
              .map((feature) => (
                <div
                  key={feature.key}
                  className="flex items-start justify-between gap-3 rounded-lg border border-sts-card-border bg-sts-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-sans text-[13px] font-semibold text-sts-foreground">
                      {feature.label}
                    </div>
                    <p className="mt-0.5 font-sans text-[12px] leading-snug text-sts-muted">
                      {feature.description}
                    </p>
                  </div>
                  {feature.status === "enabled" || !canRequest ? (
                    feature.status === "enabled" ? (
                      <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 font-sans text-[11.5px] font-medium text-emerald-700 dark:text-emerald-400">
                        <Check className="size-3" /> Enabled
                      </span>
                    ) : null
                  ) : feature.status === "pending" ? (
                    <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2.5 font-sans text-[11.5px] font-medium text-amber-700 dark:text-amber-400">
                      <Clock className="size-3" /> Pending
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === feature.key}
                      onClick={() => requestFeature(feature)}
                      className={cn(
                        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-sts-blue px-3 font-sans text-[11.5px] font-medium text-white transition-colors hover:bg-sts-blue/90 disabled:opacity-60 dark:text-gray-900",
                      )}
                    >
                      {busy === feature.key && <Loader2 className="size-3 animate-spin" />}
                      Request
                    </button>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
