"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";

type TemplateOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type UserResult = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export function CreateTenantModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [adminEmail, setAdminEmail] = useState("");
  const [pickedUser, setPickedUser] = useState<UserResult | null>(null);
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchSeq = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/templates")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: TemplateOption[]) => {
        if (!cancelled) setTemplates(Array.isArray(data) ? data.filter((t) => t.isActive) : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingTemplates(false);
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
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(adminEmail.trim())}`).catch(
        () => null,
      );
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
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    const createRes = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      setSubmitting(false);
      setError(created.error ?? "Failed to create tenant");
      return;
    }

    if (templateId) {
      const templateRes = await fetch(`/api/admin/tenants/${created.id}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (!templateRes.ok) {
        const body = await templateRes.json().catch(() => ({}));
        setSubmitting(false);
        setError(`Tenant created, but assigning the template failed: ${body.error ?? "unknown error"}`);
        return;
      }
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
        setError(`Tenant created, but adding the admin failed: ${body.error ?? "unknown error"}`);
        return;
      }
    }

    window.location.reload();
  }

  return (
    <div className="pen-overlay-backdrop fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="pen-glass-panel flex max-h-[calc(90vh/var(--pen-font-scale,1))] w-full max-w-md flex-col overflow-hidden rounded-[14px] ring-1 ring-white/35 dark:ring-white/10">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-pen-card-border px-[22px]">
          <h2 className="pen-text-modal-title">Create tenant</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex size-7 items-center justify-center rounded-md text-pen-muted hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-50"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-[22px] py-5">
          <div className="space-y-1.5">
            <label className="font-sans text-[12.5px] font-medium text-pen-foreground">Tenant name</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-sans text-[12.5px] font-medium text-pen-foreground">Starting template</label>
            <Select value={templateId || "__none__"} onValueChange={(v) => setTemplateId(v === "__none__" ? "" : v ?? "")}>
              <SelectTrigger className="h-9 w-full">
                <span className="truncate font-sans text-[12.5px]">
                  {loadingTemplates
                    ? "Loading…"
                    : templateId
                      ? (templates.find((t) => t.id === templateId)?.name ?? "Selected")
                      : "No template"}
                </span>
              </SelectTrigger>
              <SelectContent className="max-h-56 border border-pen-card-border bg-pen-bg shadow-xl">
                <SelectItem value="__none__" className="font-sans text-[12.5px]">
                  No template
                </SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="font-sans text-[12.5px]">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="font-sans text-[11px] text-pen-subtle">
              Grants the tenant this template&apos;s features immediately. Optional — more can be requested later.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="font-sans text-[12.5px] font-medium text-pen-foreground">Add tenant admin</label>
            <div className="relative">
              {pickedUser ? (
                <div className="flex h-9 items-center gap-2 rounded-lg border border-pen-card-border bg-pen-card px-2.5">
                  <UserAvatar name={pickedUser.name} avatarUrl={pickedUser.avatarUrl} size={20} />
                  <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-pen-foreground">
                    {pickedUser.name || pickedUser.email}
                  </span>
                  <button
                    type="button"
                    aria-label="Clear selected user"
                    onClick={clearPickedUser}
                    className="pen-pressable rounded-full p-0.5 text-pen-subtle hover:text-pen-foreground"
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
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-pen-card-border bg-pen-bg shadow-xl">
                  {searching ? (
                    <p className="px-2.5 py-2 font-sans text-[11.5px] text-pen-subtle">Searching…</p>
                  ) : searchResults.length === 0 ? (
                    <p className="px-2.5 py-2 font-sans text-[11.5px] text-pen-subtle">
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
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-pen-surface"
                        >
                          <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size={22} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-sans text-[12.5px] font-medium text-pen-foreground">
                              {u.name || u.email}
                            </div>
                            <div className="truncate font-sans text-[11px] text-pen-subtle">{u.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="font-sans text-[11px] text-pen-subtle">
              Existing users are added instantly; a new email gets an invitation link.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
              {error}
            </div>
          )}
        </form>

        <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-pen-card-border px-[22px]">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? "Creating…" : "Create tenant"}
          </Button>
        </div>
      </div>
    </div>
  );
}
