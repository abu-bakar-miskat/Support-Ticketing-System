"use client";

import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ListSearchInput, byText } from "@/components/ui/list-controls";
import {
  MARKETPLACE_FEATURE_KEYS,
  TEMPLATE_FEATURE_LABELS,
  type MarketplaceFeatureKey,
} from "@/lib/template-features";
import { cn } from "@/lib/utils";
import { TenantTypesClient } from "@/components/platform/tenant-types-client";
import type { TenantTypeRow } from "@/components/platform/tenant-type-modal";

type TenantOption = { id: string; name: string; slug: string; status: string };

export function PlatformTenantConfigurationPage({
  tenants: initialTenants,
  types,
}: {
  tenants: TenantOption[];
  types: TenantTypeRow[];
}) {
  const [tenants, setTenants] = useState<TenantOption[]>(initialTenants);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string>(tenants[0]?.id ?? "");
  const [flags, setFlags] = useState<Record<MarketplaceFeatureKey, boolean> | null>(null);
  const [loadingFlags, setLoadingFlags] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [featureQuery, setFeatureQuery] = useState("");

  const selectedTenant = tenants.find((t) => t.id === tenantId);
  const tenantOptions = [...tenants]
    .sort(byText((t) => t.name))
    .map((t) => ({ value: t.id, label: t.name, description: t.slug, keywords: [t.slug] }));
  const featureQ = featureQuery.trim().toLowerCase();
  const visibleFeatureKeys = MARKETPLACE_FEATURE_KEYS.filter(
    (key) => !featureQ || TEMPLATE_FEATURE_LABELS[key].toLowerCase().includes(featureQ),
  );

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    async function load() {
      setLoadingFlags(true);
      try {
        const res = await fetch(`/api/admin/tenants/${tenantId}/department-features`).then((r) => r.json());
        if (cancelled) return;
        setFlags(res.features ?? null);
      } catch {
        if (!cancelled) setError("Failed to load department features for this tenant");
      } finally {
        if (!cancelled) setLoadingFlags(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function writeFeatures(body: { key?: MarketplaceFeatureKey; all?: boolean; enabled: boolean }) {
    const res = await fetch(`/api/admin/tenants/${tenantId}/department-features`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error ?? "Failed to update department features");
    return payload.features as Record<MarketplaceFeatureKey, boolean>;
  }

  async function toggleFlag(key: MarketplaceFeatureKey, enabled: boolean) {
    setError(null);
    setFlags((prev) => (prev ? { ...prev, [key]: enabled } : prev));
    try {
      const features = await writeFeatures({ key, enabled });
      setFlags(features);
    } catch {
      setFlags((prev) => (prev ? { ...prev, [key]: !enabled } : prev));
      setError("Failed to update department features");
    }
  }

  async function setAllFlags(enabled: boolean) {
    if (!flags) return;
    if (MARKETPLACE_FEATURE_KEYS.every((key) => flags[key] === enabled)) return;
    setError(null);
    const prev = flags;
    setFlags(
      Object.fromEntries(MARKETPLACE_FEATURE_KEYS.map((key) => [key, enabled])) as Record<
        MarketplaceFeatureKey,
        boolean
      >,
    );
    try {
      const features = await writeFeatures({ all: true, enabled });
      setFlags(features);
    } catch {
      setFlags(prev);
      setError("Failed to update department features");
    }
  }

  async function setTenantStatus(next: "active" | "suspended") {
    if (!tenantId || selectedTenant?.status === next) return;
    setStatusBusy(true);
    setError(null);
    setStatus(null);
    const prev = tenants;
    setTenants((ts) => ts.map((t) => (t.id === tenantId ? { ...t, status: next } : t)));
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update tenant status");
      }
      setStatus(`${selectedTenant?.name ?? "Tenant"} is now ${next}`);
    } catch (e) {
      setTenants(prev);
      setError(e instanceof Error ? e.message : "Failed to update tenant status");
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={Settings2}
          title="Tenant configuration"
          description="Tenant types, plus department features and lifecycle status for one tenant."
        />

        {(error || status) && (
          <div className="mt-5 space-y-2">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
                {error}
              </div>
            )}
            {status && (
              <div className="rounded-lg border border-sts-green/30 bg-sts-green/10 px-3 py-2 font-sans text-[12.5px] text-sts-green">
                {status}
              </div>
            )}
          </div>
        )}

        <TenantTypesClient types={types} canManage embedded />

        <div className="mt-6 flex flex-col overflow-hidden rounded-xl border border-sts-card-border bg-sts-card shadow-sts-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sts-card-border px-[22px] py-4">
            <div className="min-w-0">
              <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Tenant</h2>
              <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
                Choose which tenant to configure.
              </p>
            </div>
            {tenants.length > 0 && (
              <SearchableSelect
                value={tenantId}
                onChange={(v) => v && setTenantId(v)}
                options={tenantOptions}
                placeholder="Select a tenant"
                searchPlaceholder="Search tenants…"
                emptyLabel="No tenants match"
                searchable
                aria-label="Tenant"
                className="w-[220px]"
              />
            )}
          </div>

          {tenants.length === 0 ? (
            <p className="px-[22px] py-8 text-center font-sans text-[12.5px] text-sts-muted">No tenants yet.</p>
          ) : !tenantId ? (
            <p className="px-[22px] py-8 text-center font-sans text-[12.5px] text-sts-muted">
              Select a tenant to configure.
            </p>
          ) : (
            <div className="flex flex-col gap-5 px-[22px] py-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sts-card-border bg-sts-surface px-3.5 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-[13px] font-medium text-sts-foreground">Status</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase",
                        selectedTenant?.status === "suspended"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-sts-green/15 text-sts-green",
                      )}
                    >
                      {selectedTenant?.status ?? "active"}
                    </span>
                  </div>
                  <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
                    Suspending blocks all tenant access until reactivated.
                  </p>
                </div>
                <div
                  role="group"
                  aria-label="Tenant status"
                  className="flex h-8 items-center gap-0.5 rounded-full border border-sts-card-border bg-sts-card p-0.5"
                >
                  {(["active", "suspended"] as const).map((s) => {
                    const selected = (selectedTenant?.status ?? "active") === s
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={statusBusy}
                        aria-pressed={selected}
                        onClick={() => setTenantStatus(s)}
                        className={cn(
                          "inline-flex h-full items-center gap-1.5 rounded-full px-3 font-sans text-[12px] font-medium capitalize transition-colors disabled:opacity-50",
                          selected
                            ? s === "suspended"
                              ? "bg-destructive/15 text-destructive"
                              : "bg-sts-green/15 text-sts-green"
                            : "text-sts-muted hover:text-sts-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            s === "suspended" ? "bg-destructive" : "bg-sts-green",
                            !selected && "opacity-40",
                          )}
                        />
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-sans text-[12.5px] font-semibold text-sts-foreground">Department features</h3>
                    <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
                      Applies to every department in this tenant. Switched off, a tenant admin can still request it.
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={loadingFlags || !flags}
                      onClick={() => setAllFlags(true)}
                      className="rounded-full border border-sts-card-border bg-sts-surface px-2.5 py-1 font-sans text-[11px] font-medium text-sts-muted transition-colors hover:text-sts-foreground disabled:opacity-50"
                    >
                      Enable all
                    </button>
                    <button
                      type="button"
                      disabled={loadingFlags || !flags}
                      onClick={() => setAllFlags(false)}
                      className="rounded-full border border-sts-card-border bg-sts-surface px-2.5 py-1 font-sans text-[11px] font-medium text-sts-muted transition-colors hover:text-sts-foreground disabled:opacity-50"
                    >
                      Disable all
                    </button>
                  </div>
                </div>
                <ListSearchInput
                  value={featureQuery}
                  onChange={setFeatureQuery}
                  placeholder="Search features…"
                  className="mb-2"
                />
                <div className="relative flex flex-col divide-y divide-sts-card-border/60 rounded-lg border border-sts-card-border bg-sts-surface px-3.5">
                  {loadingFlags && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-sts-surface/60">
                      <Loader2 className="size-4 animate-spin text-sts-muted" />
                    </div>
                  )}
                  {visibleFeatureKeys.length === 0 && (
                    <p className="py-4 text-center font-sans text-[12.5px] text-sts-muted">
                      No features match &ldquo;{featureQuery.trim()}&rdquo;.
                    </p>
                  )}
                  {visibleFeatureKeys.map((key) => (
                    <div key={key} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="font-sans text-[13px] text-sts-foreground">{TEMPLATE_FEATURE_LABELS[key]}</span>
                      <Switch
                        checked={flags ? flags[key] : false}
                        disabled={loadingFlags || !flags}
                        onCheckedChange={(checked) => toggleFlag(key, checked)}
                        size="sm"
                        aria-label={`${TEMPLATE_FEATURE_LABELS[key]} for this tenant`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
