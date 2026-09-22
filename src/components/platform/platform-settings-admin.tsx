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
  FlaskConical,
  ExternalLink,
  Mail,
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HtmlCodeEditor } from "@/components/ui/html-code-editor";
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

/** Feature keys shown as toggles on this page. `recruitment` is intentionally
 * hidden here while its flag/path-gating stays defined in feature-keys.ts. */
const VISIBLE_FEATURE_KEYS = PLATFORM_FEATURE_KEYS.filter((k) => k !== "recruitment");

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
  devMode: boolean;
  newTenantFeatureDefaults: Record<FeatureKey, boolean>;
  templateEnablementRequiresApproval: boolean;
};
type OtpTemplate = { subject: string; bodyHtml: string };

export function PlatformSettingsAdmin({
  tenants: initialTenants,
  settings: initialSettings,
  overview,
  mailpitUiBase,
  otpTemplate,
  otpDefault,
}: {
  tenants: TenantOption[];
  settings: PlatformSettings;
  overview: Overview;
  /** Public Mailpit inbox URL (no credentials in the URL). */
  mailpitUiBase: string;
  /** Current super-admin OTP override, or null when using the built-in default. */
  otpTemplate: OtpTemplate | null;
  /** The built-in OTP template — used to prefill and to reset. */
  otpDefault: OtpTemplate;
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
  const [devMode, setDevMode] = useState(initialSettings.devMode);
  const [savingDevMode, setSavingDevMode] = useState(false);
  const [tenantDefaults, setTenantDefaults] = useState<Record<FeatureKey, boolean>>(
    initialSettings.newTenantFeatureDefaults,
  );
  const [approvalRequired, setApprovalRequired] = useState(
    initialSettings.templateEnablementRequiresApproval,
  );
  const [savingGeneral, setSavingGeneral] = useState(false);

  const generalDirty =
    platformName !== baseline.platformName ||
    supportEmail !== baseline.supportEmail ||
    approvalRequired !== baseline.templateEnablementRequiresApproval ||
    JSON.stringify(tenantDefaults) !== JSON.stringify(baseline.newTenantFeatureDefaults);

  async function saveGeneral() {
    setSavingGeneral(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformName,
          supportEmail,
          newTenantFeatureDefaults: tenantDefaults,
          templateEnablementRequiresApproval: approvalRequired,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to save settings");
        return;
      }
      // Sync from the server's canonical merged result and reset the baseline.
      setPlatformName(body.platformName);
      setSupportEmail(body.supportEmail);
      setDevMode(Boolean(body.devMode));
      setTenantDefaults(body.newTenantFeatureDefaults);
      setApprovalRequired(Boolean(body.templateEnablementRequiresApproval));
      setBaseline(body as PlatformSettings);
      setStatus("Platform settings saved");
    } finally {
      setSavingGeneral(false);
    }
  }

  /** Email mode applies immediately — waiting for "Save changes" left OTP on Resend. */
  async function setEmailDevMode(next: boolean) {
    const prev = devMode;
    setDevMode(next);
    setSavingDevMode(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devMode: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDevMode(prev);
        setError(body.error ?? "Failed to update email delivery mode");
        return;
      }
      setDevMode(Boolean(body.devMode));
      setBaseline((b) => ({ ...b, devMode: Boolean(body.devMode) }));
      setStatus(
        body.devMode
          ? "Dev mode on — all emails go to Mailpit"
          : "Production mode on — all emails go via Resend",
      );
    } catch {
      setDevMode(prev);
      setError("Failed to update email delivery mode");
    } finally {
      setSavingDevMode(false);
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

  // ── OTP sign-in email template ───────────────────────────────────────────────
  // Platform-global: login is email-first, so there's no tenant/department context
  // when a code is sent. Seed from the override, falling back to the built-in default.
  const [otpSubject, setOtpSubject] = useState((otpTemplate ?? otpDefault).subject);
  const [otpBodyHtml, setOtpBodyHtml] = useState((otpTemplate ?? otpDefault).bodyHtml);
  const [otpBaseline, setOtpBaseline] = useState<OtpTemplate>(otpTemplate ?? otpDefault);
  const [savingOtp, setSavingOtp] = useState(false);
  const [resettingOtp, setResettingOtp] = useState(false);

  const otpDirty = otpSubject !== otpBaseline.subject || otpBodyHtml !== otpBaseline.bodyHtml;
  const otpPreviewHtml = otpBodyHtml.replaceAll("{{code}}", "123456");

  async function saveOtp() {
    setSavingOtp(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpEmailTemplate: { subject: otpSubject, bodyHtml: otpBodyHtml } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to save OTP email");
        return;
      }
      const saved: OtpTemplate = body.otpEmailTemplate ?? otpDefault;
      setOtpSubject(saved.subject);
      setOtpBodyHtml(saved.bodyHtml);
      setOtpBaseline(saved);
      setStatus("OTP sign-in email saved");
    } catch {
      setError("Failed to save OTP email");
    } finally {
      setSavingOtp(false);
    }
  }

  async function resetOtp() {
    setResettingOtp(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpEmailTemplate: null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to reset OTP email");
        return;
      }
      setOtpSubject(otpDefault.subject);
      setOtpBodyHtml(otpDefault.bodyHtml);
      setOtpBaseline(otpDefault);
      setStatus("OTP sign-in email reset to default");
    } catch {
      setError("Failed to reset OTP email");
    } finally {
      setResettingOtp(false);
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

            {/* Email delivery mode */}
            <div className="border-t border-sts-card-border px-[22px] py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="size-3.5 text-sts-blue" />
                    <h3 className="font-sans text-[12.5px] font-semibold text-sts-foreground">Email delivery mode</h3>
                  </div>
                  <p className="mt-1 font-sans text-[12px] text-sts-muted">
                    {devMode
                      ? "Dev mode: all emails — OTP, invites, and ticket notifications (confirmations, assignments, replies) — go to Mailpit. Any email address can be invited or signed in."
                      : "Production mode: all emails are sent via Resend to real inboxes."}
                  </p>
                  <p className="mt-1 font-sans text-[11.5px] text-sts-subtle">
                    Applies immediately — no need to click Save changes.
                  </p>
                  {devMode && mailpitUiBase && (
                    <a
                      href={mailpitUiBase}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 font-sans text-[12px] font-medium text-sts-blue hover:underline"
                    >
                      Open Mailpit inbox
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide",
                      devMode ? "bg-amber-500/15 text-amber-700" : "bg-sts-green/15 text-sts-green",
                    )}
                  >
                    {savingDevMode ? "Saving…" : devMode ? "Dev" : "Production"}
                  </span>
                  <Switch
                    checked={devMode}
                    onCheckedChange={setEmailDevMode}
                    disabled={savingDevMode}
                    size="sm"
                    aria-label="Toggle email dev mode"
                  />
                </div>
              </div>
            </div>

            {/* Template enablement governance */}
            <div className="border-t border-sts-card-border px-[22px] py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-sans text-[12.5px] font-semibold text-sts-foreground">
                    Template enablement approval
                  </h3>
                  <p className="mt-1 font-sans text-[12px] text-sts-muted">
                    When on, a Tenant Admin enable request stays Pending Approval and inactive until a Super Admin
                    approves it. When off, Enable activates the template immediately.
                  </p>
                </div>
                <Switch
                  checked={approvalRequired}
                  onCheckedChange={setApprovalRequired}
                  size="sm"
                  aria-label="Require approval to enable a template"
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
                {VISIBLE_FEATURE_KEYS.map((key) => (
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
                          "rounded-full px-3 py-1 font-sans text-[11.5px] font-medium capitalize transition-colors disabled:opacity-50",
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
                  <div className="relative flex flex-col divide-y divide-sts-card-border/60 rounded-lg border border-sts-card-border bg-sts-surface px-3.5">
                    {loadingFlags && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-sts-surface/60">
                        <Loader2 className="size-4 animate-spin text-sts-muted" />
                      </div>
                    )}
                    {VISIBLE_FEATURE_KEYS.map((key) => (
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

        {/* ── OTP sign-in email ─────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-col overflow-hidden rounded-xl border border-sts-card-border bg-sts-card shadow-sts-card">
          <div className="flex items-center gap-3 border-b border-sts-card-border px-[22px] py-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sts-blue-tint text-sts-blue">
              <Mail className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">OTP sign-in email</h2>
              <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
                The passwordless sign-in code email, sent to everyone across the platform. Use{" "}
                <code className="rounded bg-sts-surface px-1 py-0.5 font-mono text-[11px] text-sts-foreground">{"{{code}}"}</code>{" "}
                where the numeric code should appear.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-[22px] py-5">
            {/* Subject — full width */}
            <div className="flex flex-col gap-[5px]">
              <label className="font-sans text-[13px] font-medium text-sts-foreground">Subject</label>
              <Input value={otpSubject} onChange={(e) => setOtpSubject(e.target.value)} />
            </div>

            {/* Body editor + live preview, side by side and height-matched */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="flex flex-col gap-[5px]">
                <label className="font-sans text-[13px] font-medium text-sts-foreground">Body HTML</label>
                <HtmlCodeEditor
                  value={otpBodyHtml}
                  onChange={setOtpBodyHtml}
                  minHeight={420}
                  maxHeight={420}
                  className="h-[420px]"
                />
              </div>

              <div className="flex flex-col gap-[5px]">
                <label className="font-sans text-[13px] font-medium text-sts-foreground">Preview</label>
                <div className="h-[420px] overflow-hidden rounded-lg border border-sts-card-border bg-white">
                  <iframe
                    title="OTP email preview"
                    srcDoc={otpPreviewHtml}
                    sandbox=""
                    className="h-full w-full"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button onClick={saveOtp} disabled={!otpDirty || savingOtp}>
                {savingOtp ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save
              </Button>
              <Button variant="outline" onClick={resetOtp} disabled={resettingOtp}>
                {resettingOtp ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Reset to default
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
