"use client";

import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Building2,
  ShieldCheck,
  LayoutTemplate,
  FlagOff,
  Loader2,
  Save,
  Power,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { PLATFORM_FEATURE_KEYS, type FeatureKey } from "@/lib/feature-keys";
import { cn } from "@/lib/utils";

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

type TenantOption = { id: string; name: string; slug: string; status: string };
type Overview = {
  tenants: number;
  suspended: number;
  superAdmins: number;
  activeTemplates: number;
  disabledFlags: number;
};
type PlatformSettings = {
  platformName: string;
  supportEmail: string;
  newTenantFeatureDefaults: Record<FeatureKey, boolean>;
};

export function PlatformSettingsAdmin({
  tenants: initialTenants,
  settings: initialSettings,
  overview,
}: {
  tenants: TenantOption[];
  settings: PlatformSettings;
  overview: Overview;
}) {
  const [tenants, setTenants] = useState<TenantOption[]>(initialTenants);

  // ── Banners ────────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // ── General (global) settings ────────────────────────────────────────────────
  // `baseline` is the last-saved server truth; edits are dirty until saved.
  const [baseline, setBaseline] = useState<PlatformSettings>(initialSettings);
  const [platformName, setPlatformName] = useState(initialSettings.platformName);
  const [supportEmail, setSupportEmail] = useState(initialSettings.supportEmail);
  const [tenantDefaults, setTenantDefaults] = useState<Record<FeatureKey, boolean>>(
    initialSettings.newTenantFeatureDefaults,
  );
  const [savingGeneral, setSavingGeneral] = useState(false);

  const generalDirty =
    platformName !== baseline.platformName ||
    supportEmail !== baseline.supportEmail ||
    JSON.stringify(tenantDefaults) !== JSON.stringify(baseline.newTenantFeatureDefaults);

  async function saveGeneral() {
    setSavingGeneral(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformName, supportEmail, newTenantFeatureDefaults: tenantDefaults }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to save settings");
        return;
      }
      // Sync from the server's canonical merged result and reset the baseline.
      setPlatformName(body.platformName);
      setSupportEmail(body.supportEmail);
      setTenantDefaults(body.newTenantFeatureDefaults);
      setBaseline(body as PlatformSettings);
      setStatus("Platform settings saved");
    } finally {
      setSavingGeneral(false);
    }
  }

  // ── Per-tenant configuration ─────────────────────────────────────────────────
  const [tenantId, setTenantId] = useState<string>(tenants[0]?.id ?? "");
  const [flags, setFlags] = useState<Record<FeatureKey, boolean> | null>(null);
  const [loadingFlags, setLoadingFlags] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const selectedTenant = tenants.find((t) => t.id === tenantId);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    async function load() {
      setLoadingFlags(true);
      try {
        const res = await fetch(`/api/admin/feature-flags?tenantId=${tenantId}`).then((r) => r.json());
        if (cancelled) return;
        setFlags(res.flags ?? null);
      } catch {
        if (!cancelled) setError("Failed to load feature flags for this tenant");
      } finally {
        if (!cancelled) setLoadingFlags(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function writeFlag(key: FeatureKey, enabled: boolean) {
    const res = await fetch("/api/admin/feature-flags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, key, enabled }),
    });
    if (!res.ok) throw new Error();
  }

  async function toggleFlag(key: FeatureKey, enabled: boolean) {
    setError(null);
    setFlags((prev) => (prev ? { ...prev, [key]: enabled } : prev));
    try {
      await writeFlag(key, enabled);
    } catch {
      setFlags((prev) => (prev ? { ...prev, [key]: !enabled } : prev));
      setError("Failed to update feature flag");
    }
  }

  async function setAllFlags(enabled: boolean) {
    if (!flags) return;
    setError(null);
    const changed = PLATFORM_FEATURE_KEYS.filter((k) => flags[k] !== enabled);
    if (changed.length === 0) return;
    const prev = flags;
    setFlags(Object.fromEntries(PLATFORM_FEATURE_KEYS.map((k) => [k, enabled])) as Record<FeatureKey, boolean>);
    try {
      await Promise.all(changed.map((k) => writeFlag(k, enabled)));
    } catch {
      setFlags(prev);
      setError("Failed to update some feature flags");
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

  const statCards = [
    { label: "Tenants", value: overview.tenants, icon: Building2 },
    { label: "Suspended", value: overview.suspended, icon: Power },
    { label: "Super admins", value: overview.superAdmins, icon: ShieldCheck },
    { label: "Active templates", value: overview.activeTemplates, icon: LayoutTemplate },
    { label: "Disabled flags", value: overview.disabledFlags, icon: FlagOff },
  ];

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={SettingsIcon}
          title="Platform settings"
          description="Global platform configuration, new-tenant defaults, and per-tenant feature control. Changes are recorded in the Activity Log."
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

        {/* Overview */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {statCards.map((c) => {
            const warn = (c.label === "Suspended" || c.label === "Disabled flags") && c.value > 0;
            return (
              <div
                key={c.label}
                className="flex items-center gap-3 rounded-xl border border-sts-card-border bg-sts-card px-4 py-3.5 shadow-sts-card"
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    warn ? "bg-destructive/10 text-destructive" : "bg-sts-blue-tint text-sts-blue",
                  )}
                >
                  <c.icon className="size-4" />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="font-sans text-[22px] font-bold leading-none text-sts-foreground">{c.value}</span>
                  <span className="mt-1 truncate font-sans text-[10.5px] font-medium uppercase tracking-wide text-sts-subtle">
                    {c.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Two-column layout — global settings (left) · per-tenant (right) */}
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* ── Global settings ─────────────────────────────────────────────── */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-sts-card-border bg-sts-card shadow-sts-card">
            <div className="border-b border-sts-card-border px-[22px] py-4">
              <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Global settings</h2>
              <p className="mt-0.5 font-sans text-[12px] text-sts-muted">Platform-wide identity and new-tenant defaults.</p>
            </div>

            {/* Identity */}
            <div className="flex flex-col gap-4 px-[22px] py-5">
              <div className="flex flex-col gap-[5px]">
                <label className="font-sans text-[13px] font-medium text-sts-foreground">Platform name</label>
                <p className="font-sans text-[12px] text-sts-muted">Shown across the admin experience.</p>
                <Input
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="mt-1 h-9 w-full"
                  placeholder="Support Platform"
                />
              </div>
              <div className="flex flex-col gap-[5px]">
                <label className="font-sans text-[13px] font-medium text-sts-foreground">Support email</label>
                <p className="font-sans text-[12px] text-sts-muted">Contact address surfaced to tenant admins. Optional.</p>
                <Input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="mt-1 h-9 w-full"
                  placeholder="support@example.com"
                />
              </div>
            </div>

            {/* New-tenant defaults */}
            <div className="border-t border-sts-card-border px-[22px] py-5">
              <h3 className="font-sans text-[12.5px] font-semibold text-sts-foreground">New-tenant feature defaults</h3>
              <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
                Features toggled off here start disabled for tenants created afterwards. Existing tenants are unaffected.
              </p>
              <div className="mt-3 flex flex-col divide-y divide-sts-card-border/60 rounded-lg border border-sts-card-border bg-sts-surface px-3.5">
                {PLATFORM_FEATURE_KEYS.map((key) => (
                  <div key={key} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="font-sans text-[13px] text-sts-foreground">{FEATURE_LABELS[key]}</span>
                    <Switch
                      checked={tenantDefaults[key]}
                      onCheckedChange={(checked) => setTenantDefaults((d) => ({ ...d, [key]: checked }))}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Save footer */}
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-sts-card-border bg-sts-surface/40 px-[22px] py-3.5">
              <span className="font-sans text-[12px] text-sts-muted">
                {generalDirty ? "You have unsaved changes" : "All changes saved"}
              </span>
              <Button disabled={!generalDirty || savingGeneral} onClick={saveGeneral}>
                {savingGeneral ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save changes
              </Button>
            </div>
          </div>

          {/* ── Per-tenant configuration ────────────────────────────────────── */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-sts-card-border bg-sts-card shadow-sts-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sts-card-border px-[22px] py-4">
              <div className="min-w-0">
                <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Per-tenant configuration</h2>
                <p className="mt-0.5 font-sans text-[12px] text-sts-muted">Feature flags and lifecycle status for one tenant.</p>
              </div>
              {tenants.length > 0 && (
                <Select value={tenantId} onValueChange={(v) => v && setTenantId(v)}>
                  <SelectTrigger className="h-9 w-[220px]">
                    <span className="truncate font-sans text-[12.5px]">{selectedTenant?.name ?? "Select a tenant"}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="font-sans text-[12.5px]">
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                {/* Tenant status */}
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
                  <div className="flex gap-0.5 rounded-lg border border-sts-card-border bg-sts-card p-0.5">
                    {(["active", "suspended"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={statusBusy}
                        onClick={() => setTenantStatus(s)}
                        className={cn(
                          "rounded-md px-3 py-1 font-sans text-[11.5px] font-medium capitalize transition-colors disabled:opacity-50",
                          selectedTenant?.status === s
                            ? s === "suspended"
                              ? "bg-destructive text-white"
                              : "bg-sts-green text-white"
                            : "text-sts-muted hover:text-sts-foreground",
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Feature flags */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-sans text-[12.5px] font-semibold text-sts-foreground">Feature flags</h3>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={loadingFlags || !flags}
                        onClick={() => setAllFlags(true)}
                        className="rounded-md border border-sts-card-border bg-sts-surface px-2.5 py-1 font-sans text-[11px] font-medium text-sts-muted transition-colors hover:text-sts-foreground disabled:opacity-50"
                      >
                        Enable all
                      </button>
                      <button
                        type="button"
                        disabled={loadingFlags || !flags}
                        onClick={() => setAllFlags(false)}
                        className="rounded-md border border-sts-card-border bg-sts-surface px-2.5 py-1 font-sans text-[11px] font-medium text-sts-muted transition-colors hover:text-sts-foreground disabled:opacity-50"
                      >
                        Disable all
                      </button>
                    </div>
                  </div>
                  <div className="relative flex flex-col divide-y divide-sts-card-border/60 rounded-lg border border-sts-card-border bg-sts-surface px-3.5">
                    {loadingFlags && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-sts-surface/60">
                        <Loader2 className="size-4 animate-spin text-sts-muted" />
                      </div>
                    )}
                    {PLATFORM_FEATURE_KEYS.map((key) => (
                      <div key={key} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="font-sans text-[13px] text-sts-foreground">{FEATURE_LABELS[key]}</span>
                        <Switch
                          checked={flags ? flags[key] : true}
                          disabled={loadingFlags || !flags}
                          onCheckedChange={(checked) => toggleFlag(key, checked)}
                          size="sm"
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
    </div>
  );
}
