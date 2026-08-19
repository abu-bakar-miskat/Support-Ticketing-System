"use client";

import { useEffect, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { PLATFORM_FEATURE_KEYS, type FeatureKey } from "@/lib/feature-keys";

const FEATURE_LABELS: Record<FeatureKey, string> = {
  mailboxConnections: "Mailbox connections",
  bulkReassign: "Bulk reassignment",
  customReports: "Custom / cross-department reporting",
  slaPolicies: "SLA policies",
  assignmentRules: "Auto-assignment rules",
  intakeForms: "Public intake forms",
  recruitment: "Recruitment boards",
  timeTracking: "Time tracking",
};

type TenantOption = { id: string; name: string; slug: string };

export function PlatformSettingsAdmin({ tenants }: { tenants: TenantOption[] }) {
  const [tenantId, setTenantId] = useState<string>(tenants[0]?.id ?? "");
  const [flags, setFlags] = useState<Record<FeatureKey, boolean> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/feature-flags?tenantId=${tenantId}`).then((r) => r.json());
        if (cancelled) return;
        setFlags(res.flags ?? null);
      } catch {
        if (!cancelled) setError("Failed to load settings for this tenant");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function toggleFlag(key: FeatureKey, enabled: boolean) {
    setFlags((prev) => (prev ? { ...prev, [key]: enabled } : prev));
    const res = await fetch("/api/admin/feature-flags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, key, enabled }),
    });
    if (!res.ok) {
      setFlags((prev) => (prev ? { ...prev, [key]: !enabled } : prev));
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to update feature flag");
    }
  }

  const selectedTenant = tenants.find((t) => t.id === tenantId);

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={SettingsIcon}
          title="Platform settings"
          description="Per-tenant feature flags — see the Activity Log page for audit history."
        />

        <div className="mt-6 max-w-xs">
          <Select value={tenantId} onValueChange={(v) => v && setTenantId(v)}>
            <SelectTrigger className="h-9 w-full">
              <span className="truncate font-sans text-[12.5px]">
                {selectedTenant?.name ?? "Select a tenant"}
              </span>
            </SelectTrigger>
            <SelectContent>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id} className="font-sans text-[12.5px]">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
          </div>
        )}

        {tenantId && (
          <div className="mt-8">
            <h2 className="font-sans text-[13px] font-semibold text-pen-foreground">Feature flags</h2>
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-pen-card-border bg-pen-card p-4 shadow-pen-card">
              {PLATFORM_FEATURE_KEYS.map((key) => (
                <div key={key} className="flex items-center justify-between gap-3 py-1">
                  <span className="font-sans text-[13px] text-pen-foreground">{FEATURE_LABELS[key]}</span>
                  <Switch
                    checked={flags ? flags[key] : true}
                    disabled={loading || !flags}
                    onCheckedChange={(checked) => toggleFlag(key, checked)}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
