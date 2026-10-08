"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  RotateCcw,
  Palette,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  MARKETPLACE_FEATURE_KEYS,
  TEMPLATE_FEATURE_LABELS,
  type MarketplaceFeatureKey,
} from "@/lib/template-features";
import { cn } from "@/lib/utils";
import {
  PLATFORM_SIDEBAR_COLOR_DEFAULTS,
  PLATFORM_SIDEBAR_GROUP_LABELS,
  type PlatformSidebarColors,
} from "@/lib/sidebar-colors";
import { PLATFORM_NAV_GROUPS } from "@/components/platform/platform-sidebar";
import { SidebarColorsEditor } from "@/components/settings/sidebar-colors-editor";

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
  newDepartmentFeatureDefaults: Record<MarketplaceFeatureKey, boolean>;
  templateEnablementRequiresApproval: boolean;
  sidebarGroupColors: PlatformSidebarColors;
};

export function PlatformSettingsAdmin({
  settings: initialSettings,
  overview,
  mailpitUiBase,
}: {
  settings: PlatformSettings;
  overview: Overview;
  /** Public Mailpit inbox URL (no credentials in the URL). */
  mailpitUiBase: string;
}) {
  const router = useRouter();

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
  const [departmentDefaults, setDepartmentDefaults] = useState<Record<MarketplaceFeatureKey, boolean>>(
    initialSettings.newDepartmentFeatureDefaults,
  );
  const [savingGeneral, setSavingGeneral] = useState(false);

  const generalDirty =
    platformName !== baseline.platformName ||
    supportEmail !== baseline.supportEmail ||
    JSON.stringify(departmentDefaults) !== JSON.stringify(baseline.newDepartmentFeatureDefaults);

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
          newDepartmentFeatureDefaults: departmentDefaults,
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
      setDepartmentDefaults(body.newDepartmentFeatureDefaults);
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

  // ── Sidebar colours ──────────────────────────────────────────────────────────
  const [sidebarColors, setSidebarColors] = useState<PlatformSidebarColors>(initialSettings.sidebarGroupColors);
  const [sidebarBaseline, setSidebarBaseline] = useState<PlatformSidebarColors>(initialSettings.sidebarGroupColors);
  const [savingSidebar, setSavingSidebar] = useState(false);

  const sidebarDirty = JSON.stringify(sidebarColors) !== JSON.stringify(sidebarBaseline);
  const sidebarIsDefault = JSON.stringify(sidebarColors) === JSON.stringify(PLATFORM_SIDEBAR_COLOR_DEFAULTS);

  async function saveSidebarColors() {
    setSavingSidebar(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sidebarGroupColors: sidebarColors }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to save sidebar colours");
        return;
      }
      setSidebarColors(body.sidebarGroupColors);
      setSidebarBaseline(body.sidebarGroupColors);
      setStatus("Sidebar colours saved");
      // The sidebar lives in the platform layout — re-render it with the new colours.
      router.refresh();
    } catch {
      setError("Failed to save sidebar colours");
    } finally {
      setSavingSidebar(false);
    }
  }

  useUnsavedChangesGuard(generalDirty || sidebarDirty);

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
          description="Global platform configuration and defaults for new departments. Changes are recorded in the Activity Log."
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

        {/* ── Sidebar colours ───────────────────────────────────────────────── */}
        <div className="mt-6 overflow-hidden rounded-xl border border-sts-card-border bg-sts-card shadow-sts-card">
          <div className="flex items-center gap-3 border-b border-sts-card-border px-[22px] py-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sts-blue-tint text-sts-blue">
              <Palette className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Sidebar colours</h2>
              <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
                Accent colour for each group in the platform sidebar. Cards and highlights are soft tints of the colour you pick.
              </p>
            </div>
          </div>

          <div className="px-[22px] py-5">
            <SidebarColorsEditor
              groups={PLATFORM_NAV_GROUPS.map((g) => ({ ...g, label: PLATFORM_SIDEBAR_GROUP_LABELS[g.key] }))}
              value={sidebarColors}
              onChange={(key, color) => setSidebarColors((current) => ({ ...current, [key]: color }))}
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-sts-card-border bg-sts-surface/40 px-[22px] py-3.5">
            <Button
              variant="outline"
              disabled={sidebarIsDefault || savingSidebar}
              onClick={() => setSidebarColors(PLATFORM_SIDEBAR_COLOR_DEFAULTS)}
            >
              <RotateCcw className="size-4" />
              Reset to default
            </Button>
            <Button disabled={!sidebarDirty || savingSidebar} onClick={saveSidebarColors}>
              {savingSidebar ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save colours
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex flex-col overflow-hidden rounded-xl border border-sts-card-border bg-sts-card shadow-sts-card">
            <div className="border-b border-sts-card-border px-[22px] py-4">
              <h2 className="font-sans text-[13.5px] font-semibold text-sts-foreground">Global settings</h2>
              <p className="mt-0.5 font-sans text-[12px] text-sts-muted">Platform-wide identity and defaults for new departments.</p>
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
                  placeholder="Global Support Portal"
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

            {/* Features a new department is created with */}
            <div className="border-t border-sts-card-border px-[22px] py-5">
              <h3 className="font-sans text-[12.5px] font-semibold text-sts-foreground">
                Default features for new departments
              </h3>
              <p className="mt-0.5 font-sans text-[12px] text-sts-muted">
                Switched on here, a feature is available as soon as any department is created.
                Switched off, a tenant admin requests it from the Features marketplace. Existing
                departments are unchanged.
              </p>
              <div className="mt-3 flex flex-col divide-y divide-sts-card-border/60 rounded-lg border border-sts-card-border bg-sts-surface px-3.5">
                {MARKETPLACE_FEATURE_KEYS.map((key) => (
                  <div key={key} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="font-sans text-[13px] text-sts-foreground">{TEMPLATE_FEATURE_LABELS[key]}</span>
                    <Switch
                      checked={departmentDefaults[key]}
                      onCheckedChange={(checked) =>
                        setDepartmentDefaults((current) => ({ ...current, [key]: checked }))
                      }
                      size="sm"
                      aria-label={`${TEMPLATE_FEATURE_LABELS[key]} on new departments`}
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
        </div>
      </div>
    </div>
  );
}

