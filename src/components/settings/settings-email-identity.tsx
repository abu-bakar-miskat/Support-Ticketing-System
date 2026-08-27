"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  fetchEmailIdentity,
  setEmailIdentity,
  checkDomainStatus,
  type DomainStatusInfo,
} from "@/lib/api/email-notifications";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DeptOption } from "./settings-email-templates-page";

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
    fetchEmailIdentity(department.id, department.subDepartmentId)
      .then((data) => {
        if (cancelled) return;
        setDefaults({ fromName: data.defaultFromName, fromEmail: data.defaultFromEmail });
        setFromName(data.overrideFromName ?? "");
        setFromEmail(data.overrideFromEmail ?? "");
      })
      .catch(() => toast.error(`Failed to load email identity for ${department.name}`))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [department.id, department.name, department.subDepartmentId]);

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
      await setEmailIdentity({ fromName: fromName.trim() }, department.id, department.subDepartmentId);
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
      await setEmailIdentity({ fromEmail: fromEmail.trim() }, department.id, department.subDepartmentId);
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
    <div className="flex flex-col gap-3 border-t border-sts-surface py-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="font-sans text-[12.5px] font-semibold text-sts-foreground">{department.name}</label>
        {!loading && (
          <span
            className={cn(
              "inline-flex h-[20px] items-center rounded-full px-2 font-sans text-[11px] font-medium",
              hasCustomEmail
                ? "bg-sts-blue/10 text-sts-blue"
                : "bg-sts-surface text-sts-subtle",
            )}
          >
            {hasCustomEmail ? "Custom address" : "Using workspace default"}
          </span>
        )}
      </div>
      {!loading && (
        <p className="font-sans text-[11.5px] text-sts-subtle">
          Currently sending as{" "}
          <span className="font-mono text-sts-foreground">
            {activeName} &lt;{activeEmail}&gt;
          </span>
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label className="sts-text-label">From name</label>
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              disabled={loading}
              placeholder={defaults.fromName}
              className="h-9 w-full rounded-md border border-sts-card-border bg-sts-bg px-3 font-sans text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={saveName}
            disabled={savingName || loading}
            className="inline-flex h-9 shrink-0 items-center rounded-md bg-sts-blue px-3.5 font-sans text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingName ? "Saving…" : "Save"}
          </button>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="sts-text-label">From email</label>
            {checkingDomain && (
              <span className="font-sans text-[11px] text-sts-subtle">Checking domain…</span>
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
              className="h-9 min-w-0 flex-1 rounded-md border border-sts-card-border bg-sts-bg px-3 font-sans text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue disabled:opacity-50"
            />
            <button
              type="button"
              onClick={saveEmail}
              disabled={savingEmail || loading || checkingDomain || !emailSaveAllowed}
              title={!emailSaveAllowed ? "Domain must be verified in Resend before saving" : undefined}
              className="inline-flex h-9 shrink-0 items-center rounded-md bg-sts-blue px-3.5 font-sans text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingEmail ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="font-sans text-[11px] text-sts-subtle">
            Use an address on a domain you&apos;ve verified in Resend, e.g. something@your_domain.com.
          </p>
        </div>
      </div>
    </div>
  );
}

export function EmailIdentityCard({ departments }: { departments: DeptOption[] }) {
  const [filterId, setFilterId] = useState<string>(departments[0]?.id ?? "");

  if (departments.length === 0) return null;

  const visibleDepartments = departments.filter((d) => d.id === filterId);

  return (
    <section className="w-full max-w-[920px] rounded-[10px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-4">
      <div className="pb-1.5">
        <h2 className="font-sans text-sm font-semibold text-sts-foreground">
          Department sender identity
        </h2>
        <p className="font-sans text-[11.5px] text-sts-subtle">
          Leave a field blank to use the workspace default. The address/domain must already be verified in Resend before saving.
        </p>
      </div>

      {departments.length > 1 && (
        <div className="flex flex-col gap-1.5 border-t border-sts-surface py-3">
          <label className="sts-text-label">Filter by department</label>
          <Select value={filterId} onValueChange={(v) => setFilterId(v ?? departments[0]?.id ?? "")}>
            <SelectTrigger className="h-9 w-full max-w-[320px] rounded-md border-sts-card-border bg-sts-bg font-sans text-[12.5px] text-sts-foreground">
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
