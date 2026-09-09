"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import {
  fetchEmailIdentity,
  setEmailSenders,
  checkDomainStatus,
  type DomainStatusInfo,
  type EmailSenderInfo,
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

type SenderDraft = { localId: string; id?: string; name: string; email: string; isDefault: boolean };

function newSenderDraft(partial: Partial<SenderDraft> = {}): SenderDraft {
  return {
    localId: partial.localId ?? `new-${Math.random().toString(36).slice(2, 9)}`,
    id: partial.id,
    name: partial.name ?? "",
    email: partial.email ?? "",
    isDefault: partial.isDefault ?? false,
  };
}

function sendersFromIdentity(data: {
  senders?: EmailSenderInfo[];
  overrideFromName: string | null;
  overrideFromEmail: string | null;
}): SenderDraft[] {
  if (data.senders && data.senders.length > 0) {
    return data.senders.map((s) =>
      newSenderDraft({ id: s.id, name: s.name, email: s.email, isDefault: s.isDefault }),
    );
  }
  if (data.overrideFromEmail) {
    return [
      newSenderDraft({
        id: "legacy",
        name: data.overrideFromName ?? "",
        email: data.overrideFromEmail,
        isDefault: true,
      }),
    ];
  }
  return [newSenderDraft({ isDefault: true })];
}

/**
 * DS-02: one department's sender / reply-to list. Exactly one row is the
 * default From used for outbound mail; that same address is Reply-To when
 * the send has no inbound reply-token.
 */
function EmailIdentityRow({ department }: { department: DeptOption }) {
  const [defaults, setDefaults] = useState({ fromName: "", fromEmail: "" });
  const [senders, setSenders] = useState<SenderDraft[]>([newSenderDraft({ isDefault: true })]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [domainByEmail, setDomainByEmail] = useState<Record<string, DomainStatusInfo>>({});
  const [checkingDomain, setCheckingDomain] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEmailIdentity(department.id, department.subDepartmentId)
      .then((data) => {
        if (cancelled) return;
        setDefaults({ fromName: data.defaultFromName, fromEmail: data.defaultFromEmail });
        setSenders(sendersFromIdentity(data));
      })
      .catch((e) => toastError(`Failed to load email identity for ${department.name}`, e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [department.id, department.name, department.subDepartmentId]);

  const emailsToCheck = senders.map((s) => s.email.trim()).filter((e) => EMAIL_RE.test(e));

  useEffect(() => {
    if (emailsToCheck.length === 0) {
      setDomainByEmail({});
      return;
    }
    let cancelled = false;
    setCheckingDomain(true);
    const timer = setTimeout(() => {
      Promise.all(emailsToCheck.map((email) => checkDomainStatus(email).then((status) => [email, status] as const)))
        .then((pairs) => {
          if (cancelled) return;
          const next: Record<string, DomainStatusInfo> = {};
          for (const [email, status] of pairs) next[email] = status;
          setDomainByEmail(next);
        })
        .catch(() => { if (!cancelled) setDomainByEmail({}); })
        .finally(() => { if (!cancelled) setCheckingDomain(false); });
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); setCheckingDomain(false); };
    // emailsToCheck is derived from senders; join is a stable dep for the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailsToCheck.join("|")]);

  function patchSender(localId: string, patch: Partial<SenderDraft>) {
    setSenders((prev) => prev.map((s) => (s.localId === localId ? { ...s, ...patch } : s)));
  }

  function setDefault(localId: string) {
    setSenders((prev) => prev.map((s) => ({ ...s, isDefault: s.localId === localId })));
  }

  function removeSender(localId: string) {
    setSenders((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((s) => s.localId !== localId);
      if (!next.some((s) => s.isDefault)) next[0] = { ...next[0], isDefault: true };
      return next;
    });
  }

  const filledSenders = senders.filter((s) => s.email.trim());
  const invalidEmail = filledSenders.some((s) => !EMAIL_RE.test(s.email.trim()));
  const unverified = filledSenders.some((s) => {
    const status = domainByEmail[s.email.trim()]?.status;
    return status && status !== "verified" && status !== "not_configured";
  });
  const saveAllowed = !invalidEmail && !checkingDomain && !unverified;

  async function save() {
    setSaving(true);
    try {
      const saved = await setEmailSenders(
        department.id,
        senders
          .filter((s) => s.email.trim())
          .map((s) => ({
            id: s.id && s.id !== "legacy" ? s.id : undefined,
            name: s.name.trim(),
            email: s.email.trim(),
            isDefault: s.isDefault,
          })),
        department.subDepartmentId,
      );
      setSenders(
        saved.length > 0
          ? saved.map((s) => newSenderDraft({ id: s.id, name: s.name, email: s.email, isDefault: s.isDefault }))
          : [newSenderDraft({ isDefault: true })],
      );
      toast.success(`Senders saved for ${department.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save senders");
    } finally {
      setSaving(false);
    }
  }

  const defaultSender = senders.find((s) => s.isDefault) ?? senders[0];
  const activeName = defaultSender?.name.trim() || defaults.fromName;
  const activeEmail = defaultSender?.email.trim() || defaults.fromEmail;

  return (
    <div className="flex flex-col gap-3 border-t border-sts-surface py-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="font-sans text-[12.5px] font-semibold text-sts-foreground">{department.name}</label>
        {!loading && (
          <span
            className={cn(
              "inline-flex h-[20px] items-center rounded-full px-2 font-sans text-[11px] font-medium",
              filledSenders.length > 0
                ? "bg-sts-blue/10 text-sts-blue"
                : "bg-sts-surface text-sts-subtle",
            )}
          >
            {filledSenders.length > 0
              ? `${filledSenders.length} sender${filledSenders.length === 1 ? "" : "s"}`
              : "Using workspace default"}
          </span>
        )}
      </div>
      {!loading && (
        <p className="font-sans text-[11.5px] text-sts-subtle">
          Default From / Reply-To:{" "}
          <span className="font-mono text-sts-foreground">
            {activeName} &lt;{activeEmail}&gt;
          </span>
        </p>
      )}

      <div className="flex flex-col gap-2">
        {senders.map((sender) => {
          const email = sender.email.trim();
          const domainStatus = EMAIL_RE.test(email) ? domainByEmail[email] : null;
          const meta = domainStatus ? DOMAIN_STATUS_META[domainStatus.status] : null;
          return (
            <div
              key={sender.localId}
              className="flex flex-col gap-2 rounded-md border border-sts-card-border bg-sts-bg p-2.5 sm:flex-row sm:items-end"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <label className="sts-text-label">From name</label>
                <input
                  value={sender.name}
                  onChange={(e) => patchSender(sender.localId, { name: e.target.value })}
                  disabled={loading}
                  placeholder={defaults.fromName}
                  className="h-9 w-full rounded-md border border-sts-card-border bg-sts-card px-3 font-sans text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue disabled:opacity-50"
                />
              </div>
              <div className="flex min-w-0 flex-[1.2] flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="sts-text-label">From / Reply-To email</label>
                  {meta && (
                    <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 font-sans text-[11px] font-medium", meta.className)}>
                      {meta.label}
                    </span>
                  )}
                </div>
                <input
                  value={sender.email}
                  onChange={(e) => patchSender(sender.localId, { email: e.target.value })}
                  disabled={loading}
                  placeholder={defaults.fromEmail}
                  className="h-9 w-full rounded-md border border-sts-card-border bg-sts-card px-3 font-sans text-[12.5px] text-sts-foreground outline-none focus:border-sts-blue disabled:opacity-50"
                />
              </div>
              <div className="flex shrink-0 items-center gap-2 pb-0.5">
                <label className="flex items-center gap-1.5 font-sans text-[12px] text-sts-muted">
                  <input
                    type="radio"
                    name={`default-sender-${department.id}`}
                    checked={sender.isDefault}
                    onChange={() => setDefault(sender.localId)}
                    disabled={loading}
                  />
                  Default
                </label>
                <button
                  type="button"
                  onClick={() => removeSender(sender.localId)}
                  disabled={loading || senders.length <= 1}
                  className="h-9 rounded-full px-2 font-sans text-[12px] text-sts-subtle hover:text-sts-foreground disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSenders((prev) => [...prev, newSenderDraft()])}
          disabled={loading}
          className="inline-flex h-8 items-center rounded-full border border-sts-card-border px-3 font-sans text-xs font-medium text-sts-muted hover:text-sts-foreground disabled:opacity-50"
        >
          Add sender
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || !saveAllowed}
          title={unverified ? "Each address must be on a verified Resend domain" : undefined}
          className="inline-flex h-8 items-center rounded-full bg-sts-blue px-3.5 font-sans text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save senders"}
        </button>
        {checkingDomain && (
          <span className="font-sans text-[11px] text-sts-subtle">Checking domains…</span>
        )}
      </div>
      <p className="font-sans text-[11px] text-sts-subtle">
        The default address is used as From and as Reply-To (when the message has no inbound reply token). Addresses must be on a domain verified in Resend.
      </p>
    </div>
  );
}

export function EmailIdentityCard({ departments }: { departments: DeptOption[] }) {
  const [filterId, setFilterId] = useState<string>(departments[0]?.id ?? "");

  if (departments.length === 0) return null;

  const visibleDepartments = departments.filter((d) => d.id === filterId);

  return (
    <section className="w-full max-w-[920px] rounded-[6px] border border-sts-card-border bg-sts-card px-[22px] pt-4 pb-4">
      <div className="pb-1.5">
        <h2 className="font-sans text-sm font-semibold text-sts-foreground">
          Department senders
        </h2>
        <p className="font-sans text-[11.5px] text-sts-subtle">
          Configure one or more From / Reply-To addresses per department. Mark one as the default. Addresses must already be verified in Resend.
        </p>
      </div>

      {departments.length > 1 && (
        <div className="flex flex-col gap-1.5 border-t border-sts-surface py-3">
          <label className="sts-text-label">Filter by department</label>
          <Select value={filterId} onValueChange={(v) => setFilterId(v ?? departments[0]?.id ?? "")}>
            <SelectTrigger className="h-9 w-full max-w-[320px] rounded-full border-sts-card-border bg-sts-bg font-sans text-[12.5px] text-sts-foreground">
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
