"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { updateWorkspace } from "@/lib/api/workspace";
import {
  fetchEmailNotifications,
  setEmailNotificationOverride,
  fetchEmailBranding,
  setEmailBranding,
  resetEmailBranding,
} from "@/lib/api/email-notifications";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { SettingsEmailTemplatesPage, type DeptOption } from "./settings-email-templates-page";
import { EmailIdentityCard } from "./settings-email-identity";
import { LogoUploadButton } from "./logo-upload-button";

const DEFAULT_FROM_EMAIL = "onboarding@mail.pengroup.com";

const NOTIFICATION_META = [
  {
    id: "notifyAssignment",
    label: "Assignment emails",
    description: "Notify a user when a ticket is assigned to them",
  },
  {
    id: "notifyMention",
    label: "Mention emails",
    description: "Notify a user when they are @mentioned in a comment",
  },
  {
    id: "notifyResolution",
    label: "Resolution emails",
    description: "Notify the submitter when their request is resolved",
  },
  {
    id: "notifyCustomerReply",
    label: "Customer reply emails",
    description: "Send staff replies to support submitters by email",
  },
  {
    id: "notifyTicketCompleted",
    label: "Ticket completed emails",
    description: "Notify the ticket creator when their ticket is marked complete",
  },
  {
    id: "notifyStatusChanged",
    label: "Status-changed emails",
    description: "Notify the submitter when their ticket's status changes",
  },
] as const;

type NotifyKey = (typeof NOTIFICATION_META)[number]["id"];

function defaultSwitches(): Record<NotifyKey, boolean> {
  return Object.fromEntries(NOTIFICATION_META.map((row) => [row.id, true])) as Record<NotifyKey, boolean>;
}

function mergeSwitches(
  defaults: Record<NotifyKey, boolean>,
  overrides: Record<string, string | boolean> | undefined,
) {
  if (!overrides) return defaults;
  const merged = { ...defaults };
  for (const key of Object.keys(defaults) as NotifyKey[]) {
    const value = overrides[key];
    if (typeof value === "boolean") merged[key] = value;
  }
  return merged;
}

const switchClassName =
  "h-[22px] w-[38px] shrink-0 data-checked:bg-sts-blue data-unchecked:bg-sts-surface dark:data-unchecked:bg-sts-card-border [&_[data-slot=switch-thumb]]:size-4 [&_[data-slot=switch-thumb]]:data-checked:translate-x-[calc(100%-2px)]";

/**
 * The 6 notification toggles. "Workspace default" edits the workspace-wide
 * value directly (existing `switches` state, persisted via `updateWorkspace`);
 * picking a department fetches/edits that department's override instead —
 * unset rows keep following the workspace default shown in the badge state.
 */
function EmailNotificationsCard({
  scope,
  switches,
  onWorkspaceSwitchChange,
}: {
  scope: DeptOption | undefined;
  switches: Record<string, boolean>;
  onWorkspaceSwitchChange: (id: NotifyKey, checked: boolean) => void;
}) {
  const departmentId = scope?.id ?? "";
  const subDepartmentId = scope?.subDepartmentId ?? null;
  const [overrides, setOverrides] = useState<Partial<Record<NotifyKey, boolean | null>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!departmentId) {
      setOverrides({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchEmailNotifications(departmentId, subDepartmentId)
      .then((data) => {
        if (cancelled) return;
        const map: Partial<Record<NotifyKey, boolean | null>> = {};
        data.forEach((n) => { map[n.key as NotifyKey] = n.override; });
        setOverrides(map);
      })
      .catch((e) => toastError("Failed to load department notification settings", e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [departmentId, subDepartmentId]);

  async function handleToggle(key: NotifyKey, checked: boolean) {
    if (!departmentId) {
      onWorkspaceSwitchChange(key, checked);
      return;
    }
    const previous = overrides[key] ?? null;
    setOverrides((prev) => ({ ...prev, [key]: checked }));
    try {
      await setEmailNotificationOverride(key, checked, departmentId, subDepartmentId);
    } catch (err) {
      toastError("Failed to save override", err);
      setOverrides((prev) => ({ ...prev, [key]: previous }));
    }
  }

  return (
    <section className="w-full max-w-[920px] rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-2">
      <div className="pb-1.5">
        <h2 className="font-sans text-sm font-semibold text-sts-foreground">
          Email notifications
        </h2>
        {departmentId ? (
          <p className="font-sans text-[11.5px] text-sts-subtle">
            Overrides here only apply to tickets in {scope?.name ?? "this department"} — leave a toggle alone to keep following the workspace default.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col">
        {loading
          ? NOTIFICATION_META.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-3 border-t border-sts-surface py-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-[13px] w-40" />
                  <Skeleton className="h-[11px] w-64" />
                </div>
                <div className="flex shrink-0 items-center self-start sm:self-center">
                  <Skeleton className="h-[22px] w-[38px] rounded-full" />
                </div>
              </div>
            ))
          : NOTIFICATION_META.map((row) => {
              const override = departmentId ? (overrides[row.id] ?? null) : null;
              const effective = override ?? switches[row.id] ?? true;
              return (
                <div
                  key={row.id}
                  className="flex flex-col gap-3 border-t border-sts-surface py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-px">
                    <label className="font-sans text-[12.5px] font-semibold text-sts-foreground">
                      {row.label}
                    </label>
                    <p className="font-sans text-[11.5px] text-sts-subtle">
                      {row.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                    <Switch
                      checked={effective}
                      onCheckedChange={(checked) => handleToggle(row.id, checked)}
                      className={switchClassName}
                    />
                  </div>
                </div>
              );
            })}
      </div>
    </section>
  );
}

function ConnectionCard({
  resendConfigured,
  webhookConfigured,
  fromName,
  fromEmail,
}: {
  resendConfigured: boolean;
  webhookConfigured: boolean;
  fromName: string;
  fromEmail: string;
}) {
  const [sending, setSending] = useState(false);

  async function sendTest() {
    setSending(true);
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to send test email");
      }
      toast.success(`Test email sent to ${data.to ?? "your address"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send test email");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="w-full max-w-[920px] rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-4">
      <div className="pb-1.5">
        <h2 className="font-sans text-sm font-semibold text-sts-foreground">
          Resend connection
        </h2>
      </div>

      <div className="flex flex-col gap-3 border-t border-sts-surface py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="font-sans text-[12.5px] font-semibold text-sts-foreground">
            Status
          </span>
          <p className="font-sans text-[11.5px] text-sts-subtle">
            Sending as{" "}
            <span className="font-mono">
              {fromName} &lt;{fromEmail}&gt;
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
          <span
            className={cn(
              "inline-flex h-[22px] items-center rounded-full px-2.5 font-sans text-[11.5px] font-medium",
              resendConfigured
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
            )}
          >
            {resendConfigured ? "Connected" : "No API key"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-sts-surface py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="font-sans text-[12.5px] font-semibold text-sts-foreground">
            Inbound webhook
          </span>
          <p className="font-sans text-[11.5px] text-sts-subtle">
            Receives inbound email events from Resend at{" "}
            <span className="font-mono">/api/webhooks/resend</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
          <span
            className={cn(
              "inline-flex h-[22px] items-center rounded-full px-2.5 font-sans text-[11.5px] font-medium",
              webhookConfigured
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
            )}
          >
            {webhookConfigured ? "Connected" : "No secret"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-sts-surface py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="font-sans text-[12.5px] font-semibold text-sts-foreground">
            Send a test email
          </span>
          <p className="font-sans text-[11.5px] text-sts-subtle">
            Delivers a sample message to your own address using the current
            settings.
          </p>
        </div>
        <div className="shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={sendTest}
            disabled={sending || !resendConfigured}
            className={cn(
              "inline-flex h-8 items-center rounded-full bg-sts-blue px-3.5 font-sans text-xs font-medium text-white",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {sending ? "Sending…" : "Send test email"}
          </button>
        </div>
      </div>
    </section>
  );
}

export type EmailBrandingValues = {
  brandColor: string;
  headerColor: string;
  logoUrl: string;
  footerText: string;
  bodyTextColor: string;
  linkColor: string;
  headerTitle: string;
  useLogo: boolean;
  pageBackground: string;
  hideFooter: boolean;
  hideSignature: boolean;
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** A hex color, or blank (meaning "inherit the layout default"). */
const OPTIONAL_HEX_RE = /^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))?$/;

const BRANDING_DEFAULT_HEADER_TITLE = "Global Support Portal";

/**
 * A unique key per scope option. A department and its sub-departments can share
 * the same `department.id`, so keying/selecting on `id` alone collapses them —
 * which silently saves a sub-department's edits to its parent department. The
 * composite key keeps every scope distinct.
 */
function scopeKeyOf(d: DeptOption | undefined | null): string {
  return d ? `${d.id}::${d.subDepartmentId ?? ""}` : "";
}

/**
 * Per-department branding for customer-facing email and public forms. Each
 * department can override the workspace logo/colors/footer; a form may still
 * set its own design on top. Unset departments fall back to the workspace
 * defaults.
 */
function EmailBrandingCard({
  scope,
  departments,
  workspaceDefaults,
  onDirtyChange,
}: {
  scope: DeptOption | undefined;
  departments: DeptOption[];
  workspaceDefaults: EmailBrandingValues;
  /** Lets the page block tab/scope switches that would discard edits. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  // The active scope is chosen by the page-level selector; read the department /
  // sub-department straight off it — never re-derive the sub-department by matching
  // on `id` alone (that collapses same-department subs). `departments` is still the
  // full list, used only by "Reset all custom branding" below.
  const selectedScope = scope;
  const departmentId = selectedScope?.id ?? "";
  const [brandColor, setBrandColor] = useState(workspaceDefaults.brandColor);
  const [headerColor, setHeaderColor] = useState(workspaceDefaults.headerColor);
  const [logoUrl, setLogoUrl] = useState(workspaceDefaults.logoUrl);
  const [footerText, setFooterText] = useState(workspaceDefaults.footerText);
  const [bodyTextColor, setBodyTextColor] = useState(workspaceDefaults.bodyTextColor);
  const [linkColor, setLinkColor] = useState(workspaceDefaults.linkColor);
  const [headerTitle, setHeaderTitle] = useState(workspaceDefaults.headerTitle);
  const [useLogo, setUseLogo] = useState(workspaceDefaults.useLogo);
  const [pageBackground, setPageBackground] = useState(workspaceDefaults.pageBackground);
  const [hideFooter, setHideFooter] = useState(workspaceDefaults.hideFooter);
  const [hideSignature, setHideSignature] = useState(workspaceDefaults.hideSignature);
  const [saved, setSaved] = useState<EmailBrandingValues>(workspaceDefaults);
  const [hasOverride, setHasOverride] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  const subDepartmentId = selectedScope?.subDepartmentId ?? null;

  useEffect(() => {
    if (!departmentId) return;
    let cancelled = false;
    setLoading(true);
    fetchEmailBranding(departmentId, subDepartmentId)
      .then((data) => {
        if (cancelled) return;
        const effective: EmailBrandingValues = {
          brandColor: data.override.brandColor ?? data.defaults.brandColor,
          headerColor: data.override.headerColor ?? data.defaults.headerColor,
          logoUrl: data.override.logoUrl ?? data.defaults.logoUrl,
          footerText: data.override.footerText ?? data.defaults.footerText,
          bodyTextColor: data.override.bodyTextColor ?? data.defaults.bodyTextColor,
          // linkColor is intentionally "follow accent" when unset — don't fill it
          // from the accent-derived default, keep it blank so the field reads empty.
          linkColor: data.override.linkColor ?? "",
          headerTitle: data.override.headerTitle ?? data.defaults.headerTitle,
          useLogo: data.override.useLogo ?? data.defaults.useLogo,
          pageBackground: data.override.pageBackground ?? data.defaults.pageBackground,
          hideFooter: data.override.hideFooter ?? data.defaults.hideFooter,
          hideSignature: data.override.hideSignature ?? data.defaults.hideSignature,
        };
        setBrandColor(effective.brandColor);
        setHeaderColor(effective.headerColor);
        setLogoUrl(effective.logoUrl);
        setFooterText(effective.footerText);
        setBodyTextColor(effective.bodyTextColor);
        setLinkColor(effective.linkColor);
        setHeaderTitle(effective.headerTitle);
        setUseLogo(effective.useLogo);
        setPageBackground(effective.pageBackground);
        setHideFooter(effective.hideFooter);
        setHideSignature(effective.hideSignature);
        setSaved(effective);
        setHasOverride(data.hasOverride);
      })
      .catch((e) => toastError("Failed to load department branding", e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, subDepartmentId]);

  const dirty =
    brandColor !== saved.brandColor ||
    headerColor !== saved.headerColor ||
    logoUrl !== saved.logoUrl ||
    footerText !== saved.footerText ||
    bodyTextColor !== saved.bodyTextColor ||
    linkColor !== saved.linkColor ||
    headerTitle !== saved.headerTitle ||
    useLogo !== saved.useLogo ||
    pageBackground !== saved.pageBackground ||
    hideFooter !== saved.hideFooter ||
    hideSignature !== saved.hideSignature;

  useUnsavedChangesGuard(dirty);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // Report clean on unmount so a stale "dirty" can't block the next tab switch.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  if (departments.length === 0) return null;

  const validColor = HEX_RE.test(brandColor.trim());
  const validHeader = HEX_RE.test(headerColor.trim());
  const validBodyText = HEX_RE.test(bodyTextColor.trim());
  const validPageBg = HEX_RE.test(pageBackground.trim());
  // Blank link color is valid — it means "follow the accent color".
  const validLink = OPTIONAL_HEX_RE.test(linkColor.trim());
  const allValid = validColor && validHeader && validBodyText && validPageBg && validLink;
  // Empty link color follows the accent, mirroring how the email layout resolves it.
  const effectiveLinkColor = linkColor.trim() || brandColor.trim();
  const year = new Date().getFullYear();
  // Mirror the email's footer resolution: hidden → nothing; blank → the default; else the text.
  const previewFooter = hideFooter
    ? ""
    : (footerText.trim() || "© {year} Global Support Portal. This is an automated message.").replace(
        /\{year\}/g,
        String(year),
      );
  function applyValues(v: EmailBrandingValues) {
    setBrandColor(v.brandColor);
    setHeaderColor(v.headerColor);
    setLogoUrl(v.logoUrl);
    setFooterText(v.footerText);
    setBodyTextColor(v.bodyTextColor);
    setLinkColor(v.linkColor);
    setHeaderTitle(v.headerTitle);
    setUseLogo(v.useLogo);
    setPageBackground(v.pageBackground);
    setHideFooter(v.hideFooter);
    setHideSignature(v.hideSignature);
  }

  async function save() {
    if (!departmentId) return;
    if (!allValid) {
      toast.error("Enter a valid hex color, e.g. #0a76b9");
      return;
    }
    setSaving(true);
    try {
      const next: EmailBrandingValues = {
        brandColor: brandColor.trim(),
        headerColor: headerColor.trim(),
        logoUrl: logoUrl.trim(),
        footerText,
        bodyTextColor: bodyTextColor.trim(),
        linkColor: linkColor.trim(),
        headerTitle: headerTitle.trim(),
        useLogo,
        pageBackground: pageBackground.trim(),
        hideFooter,
        hideSignature,
      };
      await setEmailBranding(departmentId, next, subDepartmentId);
      setSaved(next);
      applyValues(next);
      setHasOverride(true);
      toast.success("Email branding saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save branding");
    } finally {
      setSaving(false);
    }
  }

  function resetToSaved() {
    applyValues(saved);
  }

  async function clearOverride() {
    if (!departmentId) return;
    setResetting(true);
    try {
      await resetEmailBranding(departmentId, subDepartmentId);
      const data = await fetchEmailBranding(departmentId, subDepartmentId);
      const defaults: EmailBrandingValues = { ...data.defaults, linkColor: "" };
      applyValues(defaults);
      setSaved(defaults);
      setHasOverride(false);
      toast.success("Reset to workspace branding");
    } catch (err) {
      toastError("Failed to reset branding", err);
    } finally {
      setResetting(false);
    }
  }

  // Only the distinct scopes shown in this page's selector (each department + each
  // of its sub-departments). "Reset all" clears exactly these — never scopes that
  // aren't listed here, so resetting from one sub-department can't wipe a sibling's.
  const allScopes = departments.filter((d, i, arr) => arr.findIndex((o) => scopeKeyOf(o) === scopeKeyOf(d)) === i);

  async function resetAllBranding() {
    const results = await Promise.allSettled(
      allScopes.map((d) => resetEmailBranding(d.id, d.subDepartmentId ?? null)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    // Reflect the cleared state in the currently-selected scope.
    const data = await fetchEmailBranding(departmentId, subDepartmentId);
    const defaults: EmailBrandingValues = { ...data.defaults, linkColor: "" };
    applyValues(defaults);
    setSaved(defaults);
    setHasOverride(data.hasOverride);
    if (failed > 0) {
      throw new Error(`Cleared ${allScopes.length - failed} of ${allScopes.length}; ${failed} could not be reset.`);
    }
  }

  return (
    <section className="w-full max-w-[920px] rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-4">
      <div className="pb-1.5">
        <h2 className="font-sans text-sm font-semibold text-sts-foreground">
          Branding
        </h2>
        <p className="font-sans text-[11.5px] text-sts-subtle">
          Logo, colors, and footer for this department&apos;s outgoing emails.
          Departments without a custom look fall back to the workspace default.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-sts-surface pt-3">
        <span
          className={cn(
            "inline-flex h-[20px] items-center rounded-full px-2 font-sans text-[11px] font-medium",
            hasOverride
              ? "bg-sts-blue/10 text-sts-blue"
              : "bg-sts-surface text-sts-subtle",
          )}
        >
          {loading ? "Loading…" : hasOverride ? "Custom branding" : "Using workspace default"}
        </span>
      </div>

      <div className="flex flex-col gap-4 py-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-md border border-sts-card-border bg-sts-bg/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <label className="sts-text-label">Header</label>
              <label className="flex cursor-pointer items-center gap-1.5 font-sans text-[11px] text-sts-muted">
                <input
                  type="checkbox"
                  checked={!!useLogo}
                  onChange={(e) => setUseLogo(e.target.checked)}
                  disabled={loading}
                  className="h-3.5 w-3.5 cursor-pointer accent-sts-blue disabled:opacity-50"
                />
                Use logo image
              </label>
            </div>
            {useLogo ? (
              <>
                <div className="flex items-center gap-2">
                  <input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    disabled={loading}
                    placeholder="https://…/logo.svg"
                    className="h-9 w-full min-w-0 rounded-md border border-sts-card-border bg-sts-bg px-3 font-sans text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue disabled:opacity-50"
                  />
                  <LogoUploadButton
                    disabled={loading}
                    scopeKey={subDepartmentId ? `${departmentId}-${subDepartmentId}` : departmentId}
                    onUploaded={(url) => {
                      setLogoUrl(url);
                      toast.success("Logo uploaded. Click “Save branding” to apply.");
                    }}
                    onError={(m) => toast.error(m)}
                  />
                </div>
                <p className="font-sans text-[11px] text-sts-subtle">
                  Upload an image or paste a public URL. Shown on the dark email
                  header — a PNG or SVG with a light-colored logo reads best.
                </p>
              </>
            ) : (
              <>
                <input
                  value={headerTitle}
                  onChange={(e) => setHeaderTitle(e.target.value)}
                  disabled={loading}
                  placeholder={BRANDING_DEFAULT_HEADER_TITLE}
                  className="h-9 w-full rounded-md border border-sts-card-border bg-sts-bg px-3 font-sans text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue disabled:opacity-50"
                />
                <p className="font-sans text-[11px] text-sts-subtle">
                  The wordmark shown in the header bar (in the accent color).
                  Leave blank for the default “{BRANDING_DEFAULT_HEADER_TITLE}”.
                  Tick “Use logo image” to show your logo here instead.
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="sts-text-label">Accent color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={validColor ? brandColor : "#0a76b9"}
                onChange={(e) => setBrandColor(e.target.value)}
                disabled={loading}
                aria-label="Accent color picker"
                className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-sts-card-border bg-sts-bg p-1 disabled:opacity-50"
              />
              <input
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                disabled={loading}
                placeholder="#0a76b9"
                className={cn(
                  "h-9 w-full max-w-[140px] rounded-md border bg-sts-bg px-3 font-mono text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue disabled:opacity-50",
                  validColor ? "border-sts-card-border" : "border-red-400",
                )}
              />
            </div>
            <p className="font-sans text-[11px] text-sts-subtle">
              Used for email headings, call-to-action buttons, and — unless a
              separate link color is set below — links inside the body.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="sts-text-label">Body text color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={validBodyText ? bodyTextColor : "#06476f"}
                onChange={(e) => setBodyTextColor(e.target.value)}
                disabled={loading}
                aria-label="Body text color picker"
                className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-sts-card-border bg-sts-bg p-1 disabled:opacity-50"
              />
              <input
                value={bodyTextColor}
                onChange={(e) => setBodyTextColor(e.target.value)}
                disabled={loading}
                placeholder="#06476f"
                className={cn(
                  "h-9 w-full max-w-[140px] rounded-md border bg-sts-bg px-3 font-mono text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue disabled:opacity-50",
                  validBodyText ? "border-sts-card-border" : "border-red-400",
                )}
              />
            </div>
            <p className="font-sans text-[11px] text-sts-subtle">
              The color of the paragraph text in the email body.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="sts-text-label">Link color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={validLink ? effectiveLinkColor : "#0269af"}
                onChange={(e) => setLinkColor(e.target.value)}
                disabled={loading}
                aria-label="Link color picker"
                className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-sts-card-border bg-sts-bg p-1 disabled:opacity-50"
              />
              <input
                value={linkColor}
                onChange={(e) => setLinkColor(e.target.value)}
                disabled={loading}
                placeholder="follows accent color"
                className={cn(
                  "h-9 w-full max-w-[180px] rounded-md border bg-sts-bg px-3 font-mono text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue disabled:opacity-50",
                  validLink ? "border-sts-card-border" : "border-red-400",
                )}
              />
              {linkColor.trim() ? (
                <button
                  type="button"
                  onClick={() => setLinkColor("")}
                  disabled={loading}
                  className="font-sans text-[11px] text-sts-muted underline hover:text-sts-foreground disabled:opacity-50"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <p className="font-sans text-[11px] text-sts-subtle">
              Color of links inside the email body. Leave blank to match the
              accent color.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="sts-text-label">Header background</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={validHeader ? headerColor : "#022941"}
                onChange={(e) => setHeaderColor(e.target.value)}
                disabled={loading}
                aria-label="Header background color picker"
                className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-sts-card-border bg-sts-bg p-1 disabled:opacity-50"
              />
              <input
                value={headerColor}
                onChange={(e) => setHeaderColor(e.target.value)}
                disabled={loading}
                placeholder="#022941"
                className={cn(
                  "h-9 w-full max-w-[140px] rounded-md border bg-sts-bg px-3 font-mono text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue disabled:opacity-50",
                  validHeader ? "border-sts-card-border" : "border-red-400",
                )}
              />
            </div>
            <p className="font-sans text-[11px] text-sts-subtle">
              The bar behind the logo at the top of every email. Use a dark
              color so a light logo stays legible.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="sts-text-label">Page background</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={validPageBg ? pageBackground : "#f8f8fc"}
                onChange={(e) => setPageBackground(e.target.value)}
                disabled={loading}
                aria-label="Page background color picker"
                className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-sts-card-border bg-sts-bg p-1 disabled:opacity-50"
              />
              <input
                value={pageBackground}
                onChange={(e) => setPageBackground(e.target.value)}
                disabled={loading}
                placeholder="#f8f8fc"
                className={cn(
                  "h-9 w-full max-w-[140px] rounded-md border bg-sts-bg px-3 font-mono text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue disabled:opacity-50",
                  validPageBg ? "border-sts-card-border" : "border-red-400",
                )}
              />
            </div>
            <p className="font-sans text-[11px] text-sts-subtle">
              The area surrounding the email card. A soft, light tone reads best.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="sts-text-label">Footer text</label>
              <label className="flex cursor-pointer items-center gap-1.5 font-sans text-[11px] text-sts-muted">
                <input
                  type="checkbox"
                  checked={!hideFooter}
                  onChange={(e) => setHideFooter(!e.target.checked)}
                  disabled={loading}
                  className="h-3.5 w-3.5 cursor-pointer accent-sts-blue disabled:opacity-50"
                />
                Show footer
              </label>
            </div>
            <input
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              disabled={loading || hideFooter}
              placeholder="© {year} Global Support Portal. This is an automated message."
              className="h-9 w-full rounded-md border border-sts-card-border bg-sts-bg px-3 font-sans text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue disabled:opacity-50"
            />
            <p className="font-sans text-[11px] text-sts-subtle">
              {hideFooter ? (
                "The footer is hidden — no footer line will appear in emails."
              ) : (
                <>
                  Use <span className="font-mono">{"{year}"}</span> to insert the
                  current year. Leave blank to use the default footer, or turn off
                  “Show footer” to remove it entirely.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={!hideSignature}
                onChange={(e) => setHideSignature(!e.target.checked)}
                disabled={loading}
                className="h-3.5 w-3.5 cursor-pointer accent-sts-blue disabled:opacity-50"
              />
              <span className="sts-text-label">Show sender signature</span>
            </label>
            <p className="font-sans text-[11px] text-sts-subtle">
              When on, the sender’s personal signature (set in their own
              settings) is appended to outgoing emails. Turn off to omit it.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-1.5 lg:max-w-[300px]">
          <label className="sts-text-label">Preview</label>
          <div
            className="rounded-md border border-sts-card-border p-3"
            style={{ background: validPageBg ? pageBackground : "#f8f8fc" }}
          >
            <div className="overflow-hidden rounded-md border border-black/5 bg-white shadow-sm">
              <div
                className="flex items-center px-4 py-3"
                style={{ background: validHeader ? headerColor : "#022941" }}
              >
                {useLogo && logoUrl.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    className="h-8 w-auto"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span
                    className="font-sans text-sm font-bold tracking-wide"
                    style={{ color: validColor ? brandColor : "#0a76b9" }}
                  >
                    {headerTitle.trim() || BRANDING_DEFAULT_HEADER_TITLE}
                  </span>
                )}
              </div>
              <div className="px-4 py-4">
                <div
                  className="font-sans text-[15px] font-bold"
                  style={{ color: validColor ? brandColor : "#0a76b9" }}
                >
                  A reply to your request
                </div>
                <p
                  className="mt-1.5 font-sans text-[11px] leading-relaxed"
                  style={{ color: validBodyText ? bodyTextColor : "#06476f" }}
                >
                  Hi there, thanks for reaching out — here is an update on your{" "}
                  <span
                    className="font-semibold underline"
                    style={{ color: validLink ? effectiveLinkColor : "#0269af" }}
                  >
                    ticket
                  </span>
                  .
                </p>
                <span
                  className="mt-3 inline-block rounded-full px-3 py-1.5 font-sans text-[11px] font-semibold text-white"
                  style={{ background: validColor ? brandColor : "#0a76b9" }}
                >
                  View ticket
                </span>
                {previewFooter ? (
                  <p className="mt-4 border-t border-gray-200 pt-2 font-sans text-[10px] text-gray-400">
                    {previewFooter}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-sts-surface pt-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || !dirty || !allValid}
          className="inline-flex h-8 items-center rounded-full bg-sts-blue px-3.5 font-sans text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save branding"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={resetToSaved}
            disabled={saving || resetting}
            className="inline-flex h-8 items-center rounded-full border border-sts-card-border px-3.5 font-sans text-xs font-medium text-sts-muted hover:text-sts-foreground disabled:opacity-50"
          >
            Discard changes
          </button>
        )}
        {hasOverride && !dirty && (
          <button
            type="button"
            onClick={clearOverride}
            disabled={saving || resetting || loading}
            className="inline-flex h-8 items-center rounded-full border border-sts-card-border px-3.5 font-sans text-xs font-medium text-sts-muted hover:text-sts-foreground disabled:opacity-50"
          >
            {resetting ? "Resetting…" : "Use workspace default"}
          </button>
        )}
        {allScopes.length > 1 && (
          <button
            type="button"
            onClick={() => setConfirmResetAll(true)}
            disabled={saving || resetting || loading}
            className="ml-auto inline-flex h-8 items-center rounded-full border border-red-300 px-3.5 font-sans text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
          >
            Reset all custom branding
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmResetAll}
        onOpenChange={setConfirmResetAll}
        title="Reset all custom branding"
        description={`This clears the custom email branding for all ${allScopes.length} departments and sub-departments listed in the selector above, reverting them to the workspace default. It does not touch scopes that aren't listed here. This cannot be undone.`}
        confirmLabel="Reset all"
        successMessage={`Reset custom branding for all ${allScopes.length} scopes`}
        onConfirm={resetAllBranding}
      />
    </section>
  );
}

export function SettingsEmailPage({
  initialConfig,
  resendConfigured = false,
  webhookConfigured = false,
  isAdmin = true,
  isManager = false,
  departments = [],
  fromName = "Global Support Portal",
  fromEmail = DEFAULT_FROM_EMAIL,
  branding,
}: {
  initialConfig?: Record<string, string | boolean>;
  resendConfigured?: boolean;
  webhookConfigured?: boolean;
  isAdmin?: boolean;
  isManager?: boolean;
  departments?: DeptOption[];
  fromName?: string;
  fromEmail?: string;
  branding?: EmailBrandingValues;
}) {
  const canSeeGeneral = isAdmin || isManager;
  const [tab, setTab] = useState<"general" | "branding" | "templates">(canSeeGeneral ? "general" : "templates");
  // Switching tab or scope remounts/reloads the branding card, which would
  // silently drop unsaved edits — hold the switch until the user confirms.
  const [brandingDirty, setBrandingDirty] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null);
  function guardedSwitch(apply: () => void) {
    if (brandingDirty) setPendingSwitch(() => apply);
    else apply();
  }
  const [switches, setSwitches] = useState<Record<string, boolean>>(() =>
    mergeSwitches(defaultSwitches(), initialConfig),
  );
  // The scope selector is lifted to the page so a single dropdown drives every
  // section (notifications, senders, branding, templates) instead of each card
  // carrying its own copy.
  const [scopeKey, setScopeKey] = useState<string>(scopeKeyOf(departments[0]));
  const selectedScope = departments.find((d) => scopeKeyOf(d) === scopeKey) ?? departments[0];
  const showScopeSelector = departments.length > 1;

  function onWorkspaceSwitchChange(id: NotifyKey, checked: boolean) {
    const next = { ...switches, [id]: checked };
    setSwitches(next);
    void updateWorkspace({ emailConfig: next }).catch((e) =>
      toastError("Failed to save email settings", e),
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 px-5 pt-8 sm:px-8 lg:px-10">
        <header className="flex max-w-[920px] flex-col gap-[3px]">
          <h1 className="sts-text-admin-title">
            Email settings
          </h1>
          <p className="font-sans text-[13px] text-sts-muted">
            Notifications and templates for outgoing email.
          </p>
        </header>

        <div className="flex max-w-[920px] gap-1 border-b border-sts-card-border">
          {(
            canSeeGeneral
              ? [
                  { id: "general" as const, label: "General" },
                  { id: "branding" as const, label: "Branding" },
                  { id: "templates" as const, label: "Templates" },
                ]
              : [{ id: "templates" as const, label: "Templates" }]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { if (t.id !== tab) guardedSwitch(() => setTab(t.id)); }}
              className={cn(
                "h-9 rounded-t-md px-3.5 font-sans text-[12.5px] font-medium",
                tab === t.id
                  ? "border-b-2 border-sts-blue text-sts-foreground"
                  : "text-sts-muted hover:text-sts-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {showScopeSelector ? (
          <div className="flex max-w-[920px] flex-col gap-1.5">
            <label className="sts-text-label">Applies to</label>
            <Select
              value={scopeKey}
              onValueChange={(v) => {
                const next = v ?? scopeKeyOf(departments[0]);
                if (next !== scopeKey) guardedSwitch(() => setScopeKey(next));
              }}
            >
              <SelectTrigger className="h-9 w-full max-w-[320px] rounded-full border-sts-card-border bg-sts-bg font-sans text-[12.5px] text-sts-foreground">
                <span>{selectedScope?.name ?? "Select scope"}</span>
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={scopeKeyOf(d)} value={scopeKeyOf(d)} className="font-sans text-[12.5px]">
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {tab === "general" && canSeeGeneral ? (
        <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
          <ConnectionCard
            resendConfigured={resendConfigured}
            webhookConfigured={webhookConfigured}
            fromName={fromName}
            fromEmail={fromEmail}
          />

          <EmailNotificationsCard
            scope={selectedScope}
            switches={switches}
            onWorkspaceSwitchChange={onWorkspaceSwitchChange}
          />
        </div>
      ) : tab === "branding" && canSeeGeneral ? (
        <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
          <EmailIdentityCard scope={selectedScope} />
          {branding ? (
            <EmailBrandingCard
              scope={selectedScope}
              departments={departments}
              workspaceDefaults={branding}
              onDirtyChange={setBrandingDirty}
            />
          ) : null}
        </div>
      ) : (
        <SettingsEmailTemplatesPage scope={selectedScope} departments={departments} />
      )}

      <ConfirmDialog
        open={pendingSwitch !== null}
        onOpenChange={(o) => { if (!o) setPendingSwitch(null); }}
        title="Discard unsaved changes?"
        description="Your branding edits haven't been saved. Leaving now will discard them."
        confirmLabel="Discard changes"
        onConfirm={async () => {
          setBrandingDirty(false);
          pendingSwitch?.();
        }}
      />
    </div>
  );
}
