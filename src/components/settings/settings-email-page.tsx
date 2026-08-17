"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { updateWorkspace } from "@/lib/api/workspace";
import {
  fetchEmailNotifications,
  setEmailNotificationOverride,
  fetchEmailIdentity,
  setEmailIdentity,
  checkDomainStatus,
  fetchEmailBranding,
  setEmailBranding,
  resetEmailBranding,
  type DomainStatusInfo,
} from "@/lib/api/email-notifications";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SettingsEmailTemplatesPage, type DeptOption } from "./settings-email-templates-page";

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
    id: "notifyIntakeConfirmation",
    label: "Support confirmation emails",
    description: "Confirm receipt to people who submit a support form",
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
  "h-[22px] w-[38px] shrink-0 data-checked:bg-pen-blue data-unchecked:bg-pen-surface dark:data-unchecked:bg-pen-card-border [&_[data-slot=switch-thumb]]:size-4 [&_[data-slot=switch-thumb]]:data-checked:translate-x-[calc(100%-2px)]";

/**
 * The 6 notification toggles. "Workspace default" edits the workspace-wide
 * value directly (existing `switches` state, persisted via `updateWorkspace`);
 * picking a department fetches/edits that department's override instead —
 * unset rows keep following the workspace default shown in the badge state.
 */
function EmailNotificationsCard({
  departments,
  switches,
  onWorkspaceSwitchChange,
}: {
  departments: DeptOption[];
  switches: Record<string, boolean>;
  onWorkspaceSwitchChange: (id: NotifyKey, checked: boolean) => void;
}) {
  const [departmentId, setDepartmentId] = useState<string>(departments[0]?.id ?? "");
  const [overrides, setOverrides] = useState<Partial<Record<NotifyKey, boolean | null>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!departmentId) {
      setOverrides({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchEmailNotifications(departmentId)
      .then((data) => {
        if (cancelled) return;
        const map: Partial<Record<NotifyKey, boolean | null>> = {};
        data.forEach((n) => { map[n.key as NotifyKey] = n.override; });
        setOverrides(map);
      })
      .catch(() => toast.error("Failed to load department notification settings"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [departmentId]);

  async function handleToggle(key: NotifyKey, checked: boolean) {
    if (!departmentId) {
      onWorkspaceSwitchChange(key, checked);
      return;
    }
    const previous = overrides[key] ?? null;
    setOverrides((prev) => ({ ...prev, [key]: checked }));
    try {
      await setEmailNotificationOverride(key, checked, departmentId);
    } catch {
      toast.error("Failed to save override");
      setOverrides((prev) => ({ ...prev, [key]: previous }));
    }
  }

  const showSelector = departments.length > 1;

  return (
    <section className="w-full max-w-[920px] rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
      <div className="pb-1.5">
        <h2 className="font-sans text-sm font-semibold text-pen-foreground">
          Email notifications
        </h2>
      </div>

      {showSelector ? (
        <div className="flex flex-col gap-1.5 border-t border-pen-surface py-3">
          <label className="pen-text-label">Applies to</label>
          <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "")}>
            <SelectTrigger className="h-9 w-full max-w-[320px] rounded-md border-pen-card-border bg-pen-bg font-sans text-[12.5px] text-pen-foreground">
              <span>{departments.find((d) => d.id === departmentId)?.name ?? "Select scope"}</span>
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id} className="font-sans text-[12.5px]">
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="font-sans text-[11.5px] text-pen-subtle">
            Overrides here only apply to tickets in this department — leave a toggle alone to keep following the workspace default.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col">
        {loading
          ? NOTIFICATION_META.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-3 border-t border-pen-surface py-3 sm:flex-row sm:items-center sm:gap-4"
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
                  className="flex flex-col gap-3 border-t border-pen-surface py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-px">
                    <label className="font-sans text-[12.5px] font-semibold text-pen-foreground">
                      {row.label}
                    </label>
                    <p className="font-sans text-[11.5px] text-pen-subtle">
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
    <section className="w-full max-w-[920px] rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-4">
      <div className="pb-1.5">
        <h2 className="font-sans text-sm font-semibold text-pen-foreground">
          Resend connection
        </h2>
      </div>

      <div className="flex flex-col gap-3 border-t border-pen-surface py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="font-sans text-[12.5px] font-semibold text-pen-foreground">
            Status
          </span>
          <p className="font-sans text-[11.5px] text-pen-subtle">
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

      <div className="flex flex-col gap-3 border-t border-pen-surface py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="font-sans text-[12.5px] font-semibold text-pen-foreground">
            Inbound webhook
          </span>
          <p className="font-sans text-[11.5px] text-pen-subtle">
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

      <div className="flex flex-col gap-3 border-t border-pen-surface py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="font-sans text-[12.5px] font-semibold text-pen-foreground">
            Send a test email
          </span>
          <p className="font-sans text-[11.5px] text-pen-subtle">
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
              "inline-flex h-8 items-center rounded-md bg-pen-blue px-3.5 font-sans text-xs font-medium text-white",
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

const DOMAIN_STATUS_META: Record<DomainStatusInfo["status"], { label: string; className: string } | null> = {
  verified: { label: "Domain verified", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  pending: { label: "Verification pending", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  partially_verified: { label: "Partially verified", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  failed: { label: "Verification failed", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  partially_failed: { label: "Verification failed", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  not_started: { label: "Domain not verified", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  unknown: { label: "Domain not found in Resend", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  not_configured: null,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One department's row within the sender-identity card: lets an admin
 * override its From name/email (e.g. "IT Support <it-support@pengroup.com>").
 * Leaving a field blank falls back to the workspace-wide default shown in
 * the placeholder. The address/domain must already be verified in Resend
 * before saving, or sends will fail.
 */
function EmailIdentityRow({ department }: { department: DeptOption }) {
  const [defaults, setDefaults] = useState({ fromName: "", fromEmail: "" });
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [domainStatus, setDomainStatus] = useState<DomainStatusInfo | null>(null);
  const [checkingDomain, setCheckingDomain] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEmailIdentity(department.id)
      .then((data) => {
        if (cancelled) return;
        setDefaults({ fromName: data.defaultFromName, fromEmail: data.defaultFromEmail });
        setFromName(data.overrideFromName ?? "");
        setFromEmail(data.overrideFromEmail ?? "");
      })
      .catch(() => toast.error(`Failed to load email identity for ${department.name}`))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [department.id, department.name]);

  useEffect(() => {
    const email = fromEmail.trim();
    if (!email || !EMAIL_RE.test(email)) {
      setDomainStatus(null);
      return;
    }
    let cancelled = false;
    setCheckingDomain(true);
    const timer = setTimeout(() => {
      checkDomainStatus(email)
        .then((data) => { if (!cancelled) setDomainStatus(data); })
        .catch(() => { if (!cancelled) setDomainStatus(null); })
        .finally(() => { if (!cancelled) setCheckingDomain(false); });
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); setCheckingDomain(false); };
  }, [fromEmail]);

  async function saveName() {
    setSavingName(true);
    try {
      await setEmailIdentity({ fromName: fromName.trim() }, department.id);
      toast.success(`From name saved for ${department.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save From name");
    } finally {
      setSavingName(false);
    }
  }

  async function saveEmail() {
    setSavingEmail(true);
    try {
      await setEmailIdentity({ fromEmail: fromEmail.trim() }, department.id);
      toast.success(`From email saved for ${department.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save From email");
    } finally {
      setSavingEmail(false);
    }
  }

  const hasCustomEmail = fromEmail.trim().length > 0;
  const emailSaveAllowed = !hasCustomEmail || domainStatus?.status === "verified";
  const activeEmail = hasCustomEmail ? fromEmail.trim() : defaults.fromEmail;
  const activeName = fromName.trim() || defaults.fromName;

  return (
    <div className="flex flex-col gap-3 border-t border-pen-surface py-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="font-sans text-[12.5px] font-semibold text-pen-foreground">{department.name}</label>
        {!loading && (
          <span
            className={cn(
              "inline-flex h-[20px] items-center rounded-full px-2 font-sans text-[11px] font-medium",
              hasCustomEmail
                ? "bg-pen-blue/10 text-pen-blue"
                : "bg-pen-surface text-pen-subtle",
            )}
          >
            {hasCustomEmail ? "Custom address" : "Using workspace default"}
          </span>
        )}
      </div>
      {!loading && (
        <p className="font-sans text-[11.5px] text-pen-subtle">
          Currently sending as{" "}
          <span className="font-mono text-pen-foreground">
            {activeName} &lt;{activeEmail}&gt;
          </span>
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label className="pen-text-label">From name</label>
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              disabled={loading}
              placeholder={defaults.fromName}
              className="h-9 w-full rounded-md border border-pen-card-border bg-pen-bg px-3 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={saveName}
            disabled={savingName || loading}
            className="inline-flex h-9 shrink-0 items-center rounded-md bg-pen-blue px-3.5 font-sans text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingName ? "Saving…" : "Save"}
          </button>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="pen-text-label">From email</label>
            {checkingDomain && (
              <span className="font-sans text-[11px] text-pen-subtle">Checking domain…</span>
            )}
            {!checkingDomain && domainStatus && DOMAIN_STATUS_META[domainStatus.status] && (
              <span
                className={cn(
                  "inline-flex w-fit items-center rounded-full px-2 py-0.5 font-sans text-[11px] font-medium",
                  DOMAIN_STATUS_META[domainStatus.status]!.className,
                )}
              >
                {DOMAIN_STATUS_META[domainStatus.status]!.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              disabled={loading}
              placeholder={defaults.fromEmail}
              className="h-9 min-w-0 flex-1 rounded-md border border-pen-card-border bg-pen-bg px-3 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue disabled:opacity-50"
            />
            <button
              type="button"
              onClick={saveEmail}
              disabled={savingEmail || loading || checkingDomain || !emailSaveAllowed}
              title={!emailSaveAllowed ? "Domain must be verified in Resend before saving" : undefined}
              className="inline-flex h-9 shrink-0 items-center rounded-md bg-pen-blue px-3.5 font-sans text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingEmail ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="font-sans text-[11px] text-pen-subtle">
            Use an address on a domain you've verified in Resend, e.g. something@your_domain.com.
          </p>
        </div>
      </div>
    </div>
  );
}

export type EmailBrandingValues = {
  brandColor: string;
  headerColor: string;
  logoUrl: string;
  footerText: string;
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Per-department branding for outgoing emails. Each department can override the
 * workspace logo/colors/footer; unset departments fall back to the workspace
 * defaults. A live preview mirrors the email layout.
 */
function EmailBrandingCard({
  departments,
  workspaceDefaults,
}: {
  departments: DeptOption[];
  workspaceDefaults: EmailBrandingValues;
}) {
  const [departmentId, setDepartmentId] = useState<string>(departments[0]?.id ?? "");
  const [brandColor, setBrandColor] = useState(workspaceDefaults.brandColor);
  const [headerColor, setHeaderColor] = useState(workspaceDefaults.headerColor);
  const [logoUrl, setLogoUrl] = useState(workspaceDefaults.logoUrl);
  const [footerText, setFooterText] = useState(workspaceDefaults.footerText);
  const [saved, setSaved] = useState<EmailBrandingValues>(workspaceDefaults);
  const [hasOverride, setHasOverride] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!departmentId) return;
    let cancelled = false;
    setLoading(true);
    fetchEmailBranding(departmentId)
      .then((data) => {
        if (cancelled) return;
        const effective: EmailBrandingValues = {
          brandColor: data.override.brandColor ?? data.defaults.brandColor,
          headerColor: data.override.headerColor ?? data.defaults.headerColor,
          logoUrl: data.override.logoUrl ?? data.defaults.logoUrl,
          footerText: data.override.footerText ?? data.defaults.footerText,
        };
        setBrandColor(effective.brandColor);
        setHeaderColor(effective.headerColor);
        setLogoUrl(effective.logoUrl);
        setFooterText(effective.footerText);
        setSaved(effective);
        setHasOverride(data.hasOverride);
      })
      .catch(() => toast.error("Failed to load department branding"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  if (departments.length === 0) return null;

  const dirty =
    brandColor !== saved.brandColor ||
    headerColor !== saved.headerColor ||
    logoUrl !== saved.logoUrl ||
    footerText !== saved.footerText;
  const validColor = HEX_RE.test(brandColor.trim());
  const validHeader = HEX_RE.test(headerColor.trim());
  const year = new Date().getFullYear();
  const previewFooter = (footerText || "").replace(/\{year\}/g, String(year));
  const showSelector = departments.length > 1;

  async function save() {
    if (!departmentId) return;
    if (!validColor || !validHeader) {
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
      };
      await setEmailBranding(departmentId, next);
      setSaved(next);
      setHasOverride(true);
      toast.success("Email branding saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save branding");
    } finally {
      setSaving(false);
    }
  }

  function resetToSaved() {
    setBrandColor(saved.brandColor);
    setHeaderColor(saved.headerColor);
    setLogoUrl(saved.logoUrl);
    setFooterText(saved.footerText);
  }

  async function clearOverride() {
    if (!departmentId) return;
    setResetting(true);
    try {
      await resetEmailBranding(departmentId);
      const data = await fetchEmailBranding(departmentId);
      const defaults = data.defaults;
      setBrandColor(defaults.brandColor);
      setHeaderColor(defaults.headerColor);
      setLogoUrl(defaults.logoUrl);
      setFooterText(defaults.footerText);
      setSaved(defaults);
      setHasOverride(false);
      toast.success("Reset to workspace branding");
    } catch {
      toast.error("Failed to reset branding");
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="w-full max-w-[920px] rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-4">
      <div className="pb-1.5">
        <h2 className="font-sans text-sm font-semibold text-pen-foreground">
          Branding
        </h2>
        <p className="font-sans text-[11.5px] text-pen-subtle">
          Logo, colors, and footer for this department&apos;s outgoing emails.
          Departments without a custom look fall back to the workspace default.
        </p>
      </div>

      {showSelector ? (
        <div className="flex flex-col gap-1.5 border-t border-pen-surface py-3">
          <label className="pen-text-label">Applies to</label>
          <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "")}>
            <SelectTrigger className="h-9 w-full max-w-[320px] rounded-md border-pen-card-border bg-pen-bg font-sans text-[12.5px] text-pen-foreground">
              <span>{departments.find((d) => d.id === departmentId)?.name ?? "Select department"}</span>
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id} className="font-sans text-[12.5px]">
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-pen-surface pt-3">
        <span
          className={cn(
            "inline-flex h-[20px] items-center rounded-full px-2 font-sans text-[11px] font-medium",
            hasOverride
              ? "bg-pen-blue/10 text-pen-blue"
              : "bg-pen-surface text-pen-subtle",
          )}
        >
          {loading ? "Loading…" : hasOverride ? "Custom branding" : "Using workspace default"}
        </span>
      </div>

      <div className="flex flex-col gap-4 py-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="pen-text-label">Logo URL</label>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              disabled={loading}
              placeholder="https://…/logo.svg"
              className="h-9 w-full rounded-md border border-pen-card-border bg-pen-bg px-3 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue disabled:opacity-50"
            />
            <p className="font-sans text-[11px] text-pen-subtle">
              Shown on the dark email header. Use a PNG or SVG hosted on a public
              URL; light-colored logos read best.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="pen-text-label">Accent color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={validColor ? brandColor : "#0a76b9"}
                onChange={(e) => setBrandColor(e.target.value)}
                disabled={loading}
                aria-label="Accent color picker"
                className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-pen-card-border bg-pen-bg p-1 disabled:opacity-50"
              />
              <input
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                disabled={loading}
                placeholder="#0a76b9"
                className={cn(
                  "h-9 w-full max-w-[140px] rounded-md border bg-pen-bg px-3 font-mono text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue disabled:opacity-50",
                  validColor ? "border-pen-card-border" : "border-red-400",
                )}
              />
            </div>
            <p className="font-sans text-[11px] text-pen-subtle">
              Used for email headings and call-to-action buttons.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="pen-text-label">Header background</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={validHeader ? headerColor : "#022941"}
                onChange={(e) => setHeaderColor(e.target.value)}
                disabled={loading}
                aria-label="Header background color picker"
                className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-pen-card-border bg-pen-bg p-1 disabled:opacity-50"
              />
              <input
                value={headerColor}
                onChange={(e) => setHeaderColor(e.target.value)}
                disabled={loading}
                placeholder="#022941"
                className={cn(
                  "h-9 w-full max-w-[140px] rounded-md border bg-pen-bg px-3 font-mono text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue disabled:opacity-50",
                  validHeader ? "border-pen-card-border" : "border-red-400",
                )}
              />
            </div>
            <p className="font-sans text-[11px] text-pen-subtle">
              The bar behind the logo at the top of every email. Use a dark
              color so a light logo stays legible.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="pen-text-label">Footer text</label>
            <input
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              disabled={loading}
              placeholder="© {year} PEN Global. This is an automated message."
              className="h-9 w-full rounded-md border border-pen-card-border bg-pen-bg px-3 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue disabled:opacity-50"
            />
            <p className="font-sans text-[11px] text-pen-subtle">
              Use <span className="font-mono">{"{year}"}</span> to insert the
              current year automatically.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-1.5 lg:max-w-[300px]">
          <label className="pen-text-label">Preview</label>
          <div className="overflow-hidden rounded-md border border-pen-card-border bg-white">
            <div
              className="px-4 py-3"
              style={{ background: validHeader ? headerColor : "#022941" }}
            >
              {logoUrl.trim() ? (
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
                <span className="font-sans text-xs text-white/60">No logo</span>
              )}
            </div>
            <div className="px-4 py-4">
              <div
                className="font-sans text-[15px] font-bold"
                style={{ color: validColor ? brandColor : "#0a76b9" }}
              >
                A reply to your request
              </div>
              <p className="mt-1.5 font-sans text-[11px] leading-relaxed text-[#06476f]">
                Hi there, thanks for reaching out — here is an update on your
                ticket.
              </p>
              <span
                className="mt-3 inline-block rounded-md px-3 py-1.5 font-sans text-[11px] font-semibold text-white"
                style={{ background: validColor ? brandColor : "#0a76b9" }}
              >
                View ticket
              </span>
              <p className="mt-4 border-t border-gray-200 pt-2 font-sans text-[10px] text-gray-400">
                {previewFooter}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-pen-surface pt-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || !dirty || !validColor || !validHeader}
          className="inline-flex h-8 items-center rounded-md bg-pen-blue px-3.5 font-sans text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save branding"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={resetToSaved}
            disabled={saving || resetting}
            className="inline-flex h-8 items-center rounded-md border border-pen-card-border px-3.5 font-sans text-xs font-medium text-pen-muted hover:text-pen-foreground disabled:opacity-50"
          >
            Discard changes
          </button>
        )}
        {hasOverride && !dirty && (
          <button
            type="button"
            onClick={clearOverride}
            disabled={saving || resetting || loading}
            className="inline-flex h-8 items-center rounded-md border border-pen-card-border px-3.5 font-sans text-xs font-medium text-pen-muted hover:text-pen-foreground disabled:opacity-50"
          >
            {resetting ? "Resetting…" : "Use workspace default"}
          </button>
        )}
      </div>
    </section>
  );
}

function EmailIdentityCard({ departments }: { departments: DeptOption[] }) {
  const [filterId, setFilterId] = useState<string>(departments[0]?.id ?? "");

  if (departments.length === 0) return null;

  const visibleDepartments = departments.filter((d) => d.id === filterId);

  return (
    <section className="w-full max-w-[920px] rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-4">
      <div className="pb-1.5">
        <h2 className="font-sans text-sm font-semibold text-pen-foreground">
          Department sender identity
        </h2>
        <p className="font-sans text-[11.5px] text-pen-subtle">
          Leave a field blank to use the workspace default. The address/domain must already be verified in Resend before saving.
        </p>
      </div>

      {departments.length > 1 && (
        <div className="flex flex-col gap-1.5 border-t border-pen-surface py-3">
          <label className="pen-text-label">Filter by department</label>
          <Select value={filterId} onValueChange={(v) => setFilterId(v ?? departments[0]?.id ?? "")}>
            <SelectTrigger className="h-9 w-full max-w-[320px] rounded-md border-pen-card-border bg-pen-bg font-sans text-[12.5px] text-pen-foreground">
              <span>{departments.find((d) => d.id === filterId)?.name ?? "Select department"}</span>
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id} className="font-sans text-[12.5px]">
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {visibleDepartments.map((d) => (
        <EmailIdentityRow key={d.id} department={d} />
      ))}
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
  fromName = "PEN Platform",
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
  const [tab, setTab] = useState<"general" | "templates">(canSeeGeneral ? "general" : "templates");
  const [switches, setSwitches] = useState<Record<string, boolean>>(() =>
    mergeSwitches(defaultSwitches(), initialConfig),
  );

  function onWorkspaceSwitchChange(id: NotifyKey, checked: boolean) {
    const next = { ...switches, [id]: checked };
    setSwitches(next);
    void updateWorkspace({ emailConfig: next }).catch(() =>
      toast.error("Failed to save email settings"),
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 px-5 pt-8 sm:px-8 lg:px-10">
        <header className="flex max-w-[920px] flex-col gap-[3px]">
          <h1 className="pen-text-admin-title">
            Email settings
          </h1>
          <p className="font-sans text-[13px] text-pen-muted">
            Notifications and templates for outgoing email.
          </p>
        </header>

        <div className="flex max-w-[920px] gap-1 border-b border-pen-card-border">
          {(
            canSeeGeneral
              ? [
                  { id: "general" as const, label: "General" },
                  { id: "templates" as const, label: "Templates" },
                ]
              : [{ id: "templates" as const, label: "Templates" }]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "h-9 rounded-t-md px-3.5 font-sans text-[12.5px] font-medium",
                tab === t.id
                  ? "border-b-2 border-pen-blue text-pen-foreground"
                  : "text-pen-muted hover:text-pen-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "general" && canSeeGeneral ? (
        <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
          <ConnectionCard
            resendConfigured={resendConfigured}
            webhookConfigured={webhookConfigured}
            fromName={fromName}
            fromEmail={fromEmail}
          />

          {branding ? (
            <EmailBrandingCard
              departments={departments}
              workspaceDefaults={branding}
            />
          ) : null}

          <EmailIdentityCard departments={departments} />

          <EmailNotificationsCard
            departments={departments}
            switches={switches}
            onWorkspaceSwitchChange={onWorkspaceSwitchChange}
          />
        </div>
      ) : (
        <SettingsEmailTemplatesPage departments={departments} />
      )}
    </div>
  );
}
