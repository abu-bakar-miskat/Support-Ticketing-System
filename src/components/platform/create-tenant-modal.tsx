"use client";

import { Tip } from "@/components/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  AGREEMENT_POLICY_TITLE,
  AGREEMENT_POLICY_INTRO,
  AGREEMENT_POLICY_SECTIONS,
  AGREEMENT_POLICY_VERSION,
} from "@/lib/agreement-policy";

/** Local YYYY-MM-DD for a date, suitable for <input type="date"> value. */
function toDateInput(d: Date): string {
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

type TenantTypeOption = {
  id: string;
  key: string;
  label: string;
};

type UserResult = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export function CreateTenantModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [typeKey, setTypeKey] = useState<string>("");
  const [types, setTypes] = useState<TenantTypeOption[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [adminEmail, setAdminEmail] = useState("");
  const [pickedUser, setPickedUser] = useState<UserResult | null>(null);
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchSeq = useRef(0);
  const [submitting, setSubmitting] = useState(false);

  // Agreement (SA-02): the tenant is only operational while a valid agreement
  // covers today, so we capture the term up front and require the Super Admin
  // to read + accept the policy before the tenant can be created.
  const today = new Date();
  const oneYearOut = new Date(today);
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
  const [startDate, setStartDate] = useState(toDateInput(today));
  const [endDate, setEndDate] = useState(toDateInput(oneYearOut));
  const [accepted, setAccepted] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  const datesValid = Boolean(startDate && endDate) && new Date(endDate) > new Date(startDate);
  const canSubmit = Boolean(name.trim()) && datesValid && accepted && !submitting;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/tenant-types")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: TenantTypeOption[]) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setTypes(list);
        if (list.length > 0) setTypeKey(list[0].key);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingTypes(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (pickedUser || adminEmail.trim().length < 2) return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(
        `/api/admin/users/search?q=${encodeURIComponent(adminEmail.trim())}&excludeTenantAdmins=1`,
      ).catch(() => null);
      if (seq !== searchSeq.current) return;
      const body = res && res.ok ? await res.json().catch(() => ({ users: [] })) : { users: [] };
      setSearchResults(body.users ?? []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [adminEmail, pickedUser]);

  function pickUser(u: UserResult) {
    setPickedUser(u);
    setAdminEmail(u.email);
    setSearchOpen(false);
  }

  function clearPickedUser() {
    setPickedUser(null);
    setAdminEmail("");
  }

  async function handleSubmit(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    if (!datesValid) {
      toast.error("Agreement end date must be after the start date.");
      return;
    }
    if (!accepted) {
      toast.error("Please read and accept the tenant agreement first.");
      return;
    }
    setSubmitting(true);

    const createRes = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), ...(typeKey ? { type: typeKey } : {}) }),
    });
    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      setSubmitting(false);
      toast.error(created.error ?? "Failed to create tenant");
      return;
    }

    // Record the accepted agreement term for the new tenant. Without this the
    // tenant has no agreement and is non-operational when enforcement is on.
    const agreementRes = await fetch(`/api/admin/tenants/${created.id}/agreements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate }),
    });
    if (!agreementRes.ok) {
      const body = await agreementRes.json().catch(() => ({}));
      setSubmitting(false);
      toast.error(
        `Tenant created, but recording the agreement failed: ${body.error ?? "unknown error"}. Add it from the tenant's Agreements tab.`,
      );
      return;
    }

    const email = adminEmail.trim();
    if (email) {
      const memberRes = await fetch(`/api/admin/tenants/${created.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: "admin" }),
      });
      if (!memberRes.ok) {
        const body = await memberRes.json().catch(() => ({}));
        setSubmitting(false);
        toast.error(`Tenant created, but adding the admin failed: ${body.error ?? "unknown error"}`);
        return;
      }
    }

    toast.success(`${name.trim()} has been created.`);
    window.location.reload();
  }

  return (
    <div className="sts-overlay-backdrop fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="sts-glass-panel flex max-h-[calc(90vh/var(--sts-font-scale,1))] w-full max-w-md flex-col overflow-hidden rounded-[8px] ring-1 ring-white/35 dark:ring-white/10">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-sts-card-border px-[22px]">
          <h2 className="sts-text-modal-title">Create tenant</h2>
          <Tip label="Close">
            <button
              aria-label="Close"
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex size-7 items-center justify-center rounded-full text-sts-muted hover:bg-sts-surface hover:text-sts-foreground disabled:opacity-50"
            >
              <X size={17} strokeWidth={2} />
            </button>
          </Tip>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-[22px] py-5">
          <div className="space-y-1.5">
            <label className="font-sans text-[12.5px] font-medium text-sts-foreground">Tenant name</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-sans text-[12.5px] font-medium text-sts-foreground">Tenant type</label>
            <Select value={typeKey || "__none__"} onValueChange={(v) => setTypeKey(v === "__none__" ? "" : v ?? "")}>
              <SelectTrigger className="h-9 w-full">
                <span className="truncate font-sans text-[12.5px]">
                  {loadingTypes
                    ? "Loading…"
                    : typeKey
                      ? (types.find((t) => t.key === typeKey)?.label ?? "Selected")
                      : types.length === 0
                        ? "No types available"
                        : "Select a type"}
                </span>
              </SelectTrigger>
              <SelectContent className="max-h-56 border border-sts-card-border bg-sts-bg shadow-xl">
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.key} className="font-sans text-[12.5px]">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="font-sans text-[11px] text-sts-subtle">
              Manage the available types under Platform → Tenant Types.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="font-sans text-[12.5px] font-medium text-sts-foreground">Add tenant admin</label>
            <div className="relative">
              {pickedUser ? (
                <div className="flex h-9 items-center gap-2 rounded-full border border-sts-card-border bg-sts-card px-2.5">
                  <UserAvatar name={pickedUser.name} avatarUrl={pickedUser.avatarUrl} size={20} />
                  <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-sts-foreground">
                    {pickedUser.name || pickedUser.email}
                  </span>
                  <button
                    type="button"
                    aria-label="Clear selected user"
                    onClick={clearPickedUser}
                    className="sts-pressable rounded-full p-0.5 text-sts-subtle hover:text-sts-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <Input
                  type="text"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                  placeholder="Search a name or email, or type a new email (optional)"
                  className="h-9 w-full"
                  autoComplete="off"
                />
              )}
              {!pickedUser && searchOpen && adminEmail.trim().length >= 2 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-sts-card-border bg-sts-bg shadow-xl">
                  {searching ? (
                    <p className="px-2.5 py-2 font-sans text-[11.5px] text-sts-subtle">Searching…</p>
                  ) : searchResults.length === 0 ? (
                    <p className="px-2.5 py-2 font-sans text-[11.5px] text-sts-subtle">
                      No existing users match — an invite will be sent to this email.
                    </p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto p-1">
                      {searchResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickUser(u)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sts-surface"
                        >
                          <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size={22} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-sans text-[12.5px] font-medium text-sts-foreground">
                              {u.name || u.email}
                            </div>
                            <div className="truncate font-sans text-[11px] text-sts-subtle">{u.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="font-sans text-[11px] text-sts-subtle">
              Existing users are added instantly; a new email gets an invitation link.
            </p>
          </div>

          <div className="space-y-3 rounded-[8px] border border-sts-card-border bg-sts-card/40 p-3">
            <label className="font-sans text-[12.5px] font-medium text-sts-foreground">
              Agreement
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-sans text-[11px] text-sts-subtle">Start date</label>
                <Input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-sans text-[11px] text-sts-subtle">End date</label>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            {!datesValid && (startDate || endDate) && (
              <p className="font-sans text-[11px] text-red-500">
                End date must be after the start date.
              </p>
            )}

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--sts-id)]"
              />
              <span className="font-sans text-[12px] text-sts-foreground">
                I have read and accept the{" "}
                <button
                  type="button"
                  onClick={() => setPolicyOpen(true)}
                  className="font-medium text-[var(--sts-id)] underline underline-offset-2 hover:opacity-80"
                >
                  {AGREEMENT_POLICY_TITLE}
                </button>
                .
              </span>
            </label>
          </div>

        </form>

        <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-sts-card-border px-[22px]">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Creating…" : "Create tenant"}
          </Button>
        </div>
      </div>

      {policyOpen && (
        <div className="sts-overlay-backdrop fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="sts-glass-panel flex max-h-[calc(85vh/var(--sts-font-scale,1))] w-full max-w-lg flex-col overflow-hidden rounded-[8px] ring-1 ring-white/35 dark:ring-white/10">
            <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-sts-card-border px-[22px]">
              <h2 className="sts-text-modal-title">
                {AGREEMENT_POLICY_TITLE}
                <span className="ml-2 font-sans text-[11px] font-normal text-sts-subtle">
                  v{AGREEMENT_POLICY_VERSION}
                </span>
              </h2>
              <Tip label="Close">
                <button
                  aria-label="Close"
                  type="button"
                  onClick={() => setPolicyOpen(false)}
                  className="flex size-7 items-center justify-center rounded-full text-sts-muted hover:bg-sts-surface hover:text-sts-foreground"
                >
                  <X size={17} strokeWidth={2} />
                </button>
              </Tip>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-[22px] py-5">
              <p className="font-sans text-[12.5px] leading-relaxed text-sts-muted">
                {AGREEMENT_POLICY_INTRO}
              </p>
              {AGREEMENT_POLICY_SECTIONS.map((section) => (
                <div key={section.heading} className="space-y-1">
                  <h3 className="font-sans text-[12.5px] font-semibold text-sts-foreground">
                    {section.heading}
                  </h3>
                  <p className="font-sans text-[12px] leading-relaxed text-sts-muted">
                    {section.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-sts-card-border px-[22px]">
              <Button type="button" variant="outline" onClick={() => setPolicyOpen(false)}>
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setAccepted(true);
                  setPolicyOpen(false);
                }}
              >
                Accept agreement
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
