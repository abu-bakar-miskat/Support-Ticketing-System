"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TenantAvatar } from "@/components/platform/tenant-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { TenantBranding } from "@/lib/tenant-branding";
import {
  TenantAgreements,
  type AgreementRow,
} from "@/components/platform/tenant-agreements";
import {
  TenantTemplates,
  type CatalogueEntry,
} from "@/components/platform/tenant-templates";

type UserResult = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

type TenantInfo = {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
  deleted: boolean;
  departments: number;
  members: number;
};

type Member = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
};

const MEMBER_ROLES = ["admin", "manager", "sub_manager", "staff"] as const;
const roleLabel = (r: string) =>
  r === "admin"
    ? "Tenant admin"
    : r === "sub_manager"
      ? "Sub-manager"
      : r.charAt(0).toUpperCase() + r.slice(1);

function DepartmentMultiSelect({
  label,
  departments,
  selected,
  onToggle,
  compact = false,
}: {
  label: string;
  departments: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerLabel =
    selected.length === 0
      ? "Select department(s)"
      : selected.length === 1
        ? (departments.find((d) => d.id === selected[0])?.name ?? "1 selected")
        : `${selected.length} departments selected`;

  return (
    <div className={compact ? "shrink-0" : undefined}>
      {!compact && (
        <p className="font-sans text-[11.5px] font-medium text-pen-foreground">
          {label}
          <span className="ml-1 font-normal text-pen-subtle">— pick one or more</span>
        </p>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          title={label}
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg border border-pen-card-border bg-pen-card px-2.5 text-left font-sans text-[12.5px] text-pen-foreground transition-colors hover:border-pen-muted",
            compact ? "min-w-[190px]" : "mt-1.5 w-full",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 text-pen-subtle" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-64 rounded-xl border border-pen-card-border bg-pen-bg p-0 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-pen-card-border px-3 py-2">
            <span className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-pen-subtle">
              Departments
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => selected.forEach(onToggle)}
                className="font-sans text-[11.5px] text-pen-muted hover:text-pen-red"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5">
            {departments.length === 0 ? (
              <p className="px-2.5 py-2 font-sans text-[11.5px] text-pen-subtle">
                This tenant has no departments yet.
              </p>
            ) : (
              departments.map((d) => {
                const checked = selected.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onToggle(d.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                      checked ? "bg-pen-blue-tint" : "hover:bg-pen-surface",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                        checked ? "border-pen-blue bg-pen-blue" : "border-pen-card-border bg-transparent",
                      )}
                    >
                      {checked && <Check className="size-2.5 text-white" strokeWidth={3} />}
                    </span>
                    <span className="truncate font-sans text-[12.5px] text-pen-foreground">{d.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function TenantManageClient({
  tenant,
  initialBranding,
  initialMembers,
  departments,
  initialAgreements,
  initialCatalogue,
}: {
  tenant: TenantInfo;
  initialBranding: TenantBranding;
  initialMembers: Member[];
  departments: { id: string; name: string }[];
  initialAgreements: AgreementRow[];
  initialCatalogue: CatalogueEntry[];
}) {
  const [displayName, setDisplayName] = useState(
    initialBranding.displayName ?? "",
  );
  const [logoUrl, setLogoUrl] = useState(initialBranding.logoUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lifecycle (SA-01): suspend/reactivate + soft-delete/restore.
  const [tenantStatus, setTenantStatus] = useState(tenant.status);
  const [deleted, setDeleted] = useState(tenant.deleted);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  // Members
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("staff");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [addingMember, setAddingMember] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [pickedUser, setPickedUser] = useState<UserResult | null>(null);
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchSeq = useRef(0);

  const previewName = displayName.trim() || tenant.name;
  const needsDepartments = inviteRole !== "admin";

  useEffect(() => {
    if (pickedUser || inviteEmail.trim().length < 2) return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(
        `/api/admin/tenants/${tenant.id}/members?q=${encodeURIComponent(inviteEmail.trim())}`,
      ).catch(() => null);
      if (seq !== searchSeq.current) return;
      const body =
        res && res.ok
          ? await res.json().catch(() => ({ users: [] }))
          : { users: [] };
      setSearchResults(body.users ?? []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [inviteEmail, pickedUser, tenant.id]);

  function pickUser(u: UserResult) {
    setPickedUser(u);
    setInviteEmail(u.email);
    setSearchOpen(false);
  }

  function clearPickedUser() {
    setPickedUser(null);
    setInviteEmail("");
  }

  function toggleDept(id: string) {
    setSelectedDepts((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    if (needsDepartments && selectedDepts.length === 0) {
      setError(
        "Select at least one department for a manager, lead, or staff member.",
      );
      return;
    }
    setAddingMember(true);
    setError(null);
    setStatus(null);
    setInviteLink(null);
    const res = await fetch(`/api/admin/tenants/${tenant.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        role: inviteRole,
        departmentIds: needsDepartments ? selectedDepts : [],
      }),
    });
    const body = await res.json().catch(() => ({}));
    setAddingMember(false);
    if (!res.ok) {
      setError(body.error ?? "Failed to add member");
      return;
    }
    setInviteEmail("");
    setPickedUser(null);
    setSelectedDepts([]);
    if (body.added && body.member) {
      setMembers((prev) => {
        const rest = prev.filter((m) => m.id !== body.member.id);
        return [...rest, body.member];
      });
      setStatus(
        `${body.member.name || body.member.email} added as ${roleLabel(inviteRole)}.`,
      );
    } else if (body.invited) {
      setInviteLink(body.acceptPath);
      setStatus(`Invitation created for ${body.email}. Share the link below.`);
    }
  }

  async function removeMember(userId: string) {
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/tenants/${tenant.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to remove member");
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== userId));
  }

  // Restrict/re-enable a member's account (Profile.isActive) — unlike
  // removeMember, this keeps their membership and all data intact; it just
  // blocks sign-in.
  async function setMemberActive(userId: string, isActive: boolean) {
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/tenants/${tenant.id}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isActive }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to update member access");
      return;
    }
    setMembers((prev) =>
      prev.map((m) => (m.id === userId ? { ...m, isActive } : m)),
    );
    setStatus(
      isActive
        ? "Access re-enabled."
        : "Access restricted — the member is signed out.",
    );
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    setError(null);
    setStatus(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/admin/tenants/${tenant.id}/logo`, {
      method: "POST",
      body: form,
    });
    setUploading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Logo upload failed");
      return;
    }
    const body = await res.json();
    setLogoUrl(body.url);
    setStatus("Logo uploaded.");
  }

  async function saveBranding(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/tenants/${tenant.id}/branding`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to save branding");
      return;
    }
    setStatus("Branding saved.");
  }

  async function enterTenant() {
    const res = await fetch("/api/active-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: tenant.id }),
    });
    if (res.ok) window.location.href = "/departments";
  }

  async function updateStatus(next: "active" | "suspended") {
    setLifecycleBusy(true);
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLifecycleBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to update status");
      return;
    }
    setTenantStatus(next);
    setStatus(
      next === "suspended" ? "Tenant suspended." : "Tenant reactivated.",
    );
  }

  async function softDeleteTenant() {
    if (
      !window.confirm(
        "Soft-delete this tenant? Members lose access until it's restored. No data is removed.",
      )
    )
      return;
    setLifecycleBusy(true);
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
      method: "DELETE",
    });
    setLifecycleBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to delete tenant");
      return;
    }
    setDeleted(true);
    setStatus("Tenant soft-deleted. You can restore it anytime.");
  }

  async function restoreTenant() {
    setLifecycleBusy(true);
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/tenants/${tenant.id}/restore`, {
      method: "POST",
    });
    setLifecycleBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to restore tenant");
      return;
    }
    setDeleted(false);
    setStatus("Tenant restored.");
  }

  const canEnter = !deleted && tenantStatus === "active";

  const sectionCard =
    "rounded-xl border border-pen-card-border bg-pen-card p-4 shadow-pen-card";
  const labelClass =
    "block font-sans text-[12.5px] font-medium text-pen-foreground";

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 pb-20 lg:px-10">
        <Link
          href="/platform"
          className="inline-flex items-center gap-1 font-sans text-[12.5px] text-pen-muted transition-colors hover:text-pen-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All tenants
        </Link>

        {/* Header */}
        <header className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TenantAvatar
              name={tenant.name}
              logoUrl={logoUrl.trim() || null}
              size={44}
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="pen-text-page-title leading-none">
                  {tenant.name}
                </h1>
                {deleted ? (
                  <span className="rounded-full bg-pen-red/10 px-2 py-0.5 font-sans text-[11px] font-medium text-pen-red">
                    Deleted
                  </span>
                ) : tenantStatus === "suspended" ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-sans text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    Suspended
                  </span>
                ) : (
                  <span className="rounded-full bg-pen-green/10 px-2 py-0.5 font-sans text-[11px] font-medium text-pen-green">
                    Active
                  </span>
                )}
              </div>
              <div className="mt-1 font-sans text-[11.5px] text-pen-subtle">
                /{tenant.slug} · {tenant.departments} dept
                {tenant.departments === 1 ? "" : "s"} · {tenant.members} member
                {tenant.members === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <Button size="lg" onClick={enterTenant} disabled={!canEnter}>
            Enter tenant
          </Button>
        </header>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
          </div>
        )}
        {status && (
          <div className="mt-4 rounded-lg border border-pen-green/30 bg-pen-green/10 px-3 py-2 font-sans text-[12.5px] text-pen-green">
            {status}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          {/* Left: settings column */}
          <div className="flex flex-col gap-6 xl:col-span-1">
            {/* Templates (dynamic, replaces the old static Tenant.type) */}
            <TenantTemplates tenantId={tenant.id} initialCatalogue={initialCatalogue} />

            {/* Branding editor + live preview */}
            <section className={cn(sectionCard, "space-y-4")}>
              <form onSubmit={saveBranding} className="space-y-4">
                <h2 className="font-sans text-[12.5px] font-semibold text-pen-foreground">
                  Logo &amp; name
                </h2>

                <div>
                  <label className={labelClass}>Display name</label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={tenant.name}
                    className="mt-1 h-9"
                  />
                </div>

                <div>
                  <label className={labelClass}>Logo</label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://example.com/logo.svg"
                      className="h-9"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="relative shrink-0"
                      disabled={uploading}
                    >
                      {uploading ? "Uploading…" : "Upload"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                        className="absolute inset-0 cursor-pointer opacity-0"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadLogo(f);
                          e.target.value = "";
                        }}
                      />
                    </Button>
                  </div>
                  <p className="mt-1 font-sans text-[11px] text-pen-subtle">
                    Paste a URL or upload an image (≤5 MB).
                  </p>
                </div>

                <Button type="submit" size="lg" disabled={saving}>
                  {saving ? "Saving…" : "Save branding"}
                </Button>
              </form>

              {/* Live preview — how the tenant's logo + name appear in the sidebar. */}
              <div className="rounded-lg border border-pen-card-border p-3">
                <div className="mb-2 font-sans text-[11px] font-medium tracking-[0.6px] text-pen-subtle uppercase">
                  Preview
                </div>
                <div className="flex items-center gap-2">
                  <TenantAvatar
                    name={tenant.name}
                    logoUrl={logoUrl.trim() || null}
                    size={32}
                  />
                  <span className="truncate font-sans text-[13px] font-semibold text-pen-foreground">
                    {previewName}
                  </span>
                </div>
              </div>
            </section>

            {/* Status & lifecycle (SA-01) */}
            <section className={sectionCard}>
              <h2 className="font-sans text-[12.5px] font-semibold text-pen-foreground">
                Status &amp; lifecycle
              </h2>
              <p className="mt-1 font-sans text-[11.5px] text-pen-subtle">
                Suspend to temporarily block sign-in for every member.
                Soft-delete is reversible — no data is ever removed.
              </p>

              {deleted ? (
                <div className="mt-3 flex flex-col gap-2 rounded-lg border border-pen-red/30 bg-pen-red/5 p-3">
                  <p className="font-sans text-[12px] text-pen-foreground">
                    This tenant is soft-deleted. Members cannot sign in.
                  </p>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-fit"
                    onClick={restoreTenant}
                    disabled={lifecycleBusy}
                  >
                    {lifecycleBusy ? "Restoring…" : "Restore tenant"}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-pen-card-border p-3">
                    <div>
                      <p className="font-sans text-[12.5px] font-medium text-pen-foreground">
                        {tenantStatus === "suspended" ? "Suspended" : "Active"}
                      </p>
                      <p className="font-sans text-[11.5px] text-pen-subtle">
                        {tenantStatus === "suspended"
                          ? "Members are locked out."
                          : "Members can sign in normally."}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="lg"
                      className="shrink-0"
                      onClick={() =>
                        updateStatus(
                          tenantStatus === "suspended" ? "active" : "suspended",
                        )
                      }
                      disabled={lifecycleBusy}
                    >
                      {tenantStatus === "suspended" ? "Reactivate" : "Suspend"}
                    </Button>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-pen-red/25 bg-pen-red/5 p-3">
                    <div>
                      <p className="font-sans text-[12.5px] font-medium text-pen-red">
                        Soft-delete tenant
                      </p>
                      <p className="font-sans text-[11.5px] text-pen-subtle">
                        Reversible — restore anytime.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="lg"
                      className="shrink-0"
                      onClick={softDeleteTenant}
                      disabled={lifecycleBusy}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </section>
          </div>

          {/* Members */}
          <section className={cn(sectionCard, "h-fit xl:col-span-2")}>
            <div className="flex items-center justify-between">
              <h2 className="font-sans text-[12.5px] font-semibold text-pen-foreground">
                Members
              </h2>
              <span className="font-sans text-[11.5px] text-pen-subtle">
                {members.length} member{members.length === 1 ? "" : "s"}
              </span>
            </div>

            {/* Add or invite */}
            <form onSubmit={addMember} className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  {pickedUser ? (
                    <div className="flex h-9 items-center gap-2 rounded-lg border border-pen-card-border bg-pen-card px-2.5">
                      <UserAvatar
                        name={pickedUser.name}
                        avatarUrl={pickedUser.avatarUrl}
                        size={20}
                      />
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
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onFocus={() => setSearchOpen(true)}
                      onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                      placeholder="Search a name or email, or type a new email"
                      className="h-9 w-full"
                      autoComplete="off"
                    />
                  )}
                  {!pickedUser &&
                    searchOpen &&
                    inviteEmail.trim().length >= 2 && (
                      <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-pen-card-border bg-pen-bg shadow-xl">
                        {searching ? (
                          <p className="px-2.5 py-2 font-sans text-[11.5px] text-pen-subtle">
                            Searching…
                          </p>
                        ) : searchResults.length === 0 ? (
                          <p className="px-2.5 py-2 font-sans text-[11.5px] text-pen-subtle">
                            No existing users match — an invite will be sent to
                            this email.
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
                                <UserAvatar
                                  name={u.name}
                                  avatarUrl={u.avatarUrl}
                                  size={22}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-sans text-[12.5px] font-medium text-pen-foreground">
                                    {u.name || u.email}
                                  </div>
                                  <div className="truncate font-sans text-[11px] text-pen-subtle">
                                    {u.email}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                </div>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v ?? "staff")}
                >
                  <SelectTrigger className="h-9! min-w-[150px] bg-pen-card! hover:bg-pen-surface!">
                    <span className="font-sans text-[12.5px]">
                      {roleLabel(inviteRole)}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_ROLES.map((r) => (
                      <SelectItem
                        key={r}
                        value={r}
                        className="font-sans text-[12.5px]"
                      >
                        {roleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {needsDepartments && (
                  <DepartmentMultiSelect
                    label={inviteRole === "manager" ? "Manages department(s)" : "Member of department(s)"}
                    departments={departments}
                    selected={selectedDepts}
                    onToggle={toggleDept}
                    compact
                  />
                )}
                <Button
                  type="submit"
                  size="lg"
                  disabled={
                    addingMember ||
                    !inviteEmail.trim() ||
                    (needsDepartments && selectedDepts.length === 0)
                  }
                >
                  {addingMember ? "Adding…" : "Add member"}
                </Button>
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
                  {error}
                </div>
              )}
            </form>
            <p className="mt-1 font-sans text-[11px] text-pen-subtle">
              Admins get the whole tenant; managers/leads/staff are scoped to
              the departments you pick. Existing users are added instantly; a
              new email gets an invitation link.
            </p>

            {inviteLink && (
              <div className="mt-3 rounded-lg border border-pen-card-border bg-pen-surface p-2">
                <p className="font-sans text-[11px] text-pen-muted">
                  Invitation link (share with the invitee):
                </p>
                <code className="mt-1 block truncate font-mono text-[11.5px] text-pen-foreground">
                  {typeof window !== "undefined" ? window.location.origin : ""}
                  {inviteLink}
                </code>
              </div>
            )}

            <ul className="mt-4 max-h-[530px] divide-y divide-pen-card-border overflow-y-auto">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <UserAvatar name={m.name} avatarUrl={m.avatarUrl} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-sans text-[12.5px] font-medium text-pen-foreground">
                      {m.name || m.email}
                    </div>
                    <div className="truncate font-sans text-[11px] text-pen-subtle">
                      {m.email}
                    </div>
                  </div>
                  {!m.isActive && (
                    <span className="rounded-full bg-pen-red/10 px-2 py-0.5 font-sans text-[11px] font-medium text-pen-red">
                      Restricted
                    </span>
                  )}
                  <span className="rounded-full bg-pen-blue-tint px-2 py-0.5 font-sans text-[11px] font-medium text-pen-blue">
                    {roleLabel(m.role)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMemberActive(m.id, !m.isActive)}
                  >
                    {m.isActive ? "Restrict" : "Re-enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${m.name || m.email}`}
                    onClick={() => removeMember(m.id)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
              {members.length === 0 && (
                <li className="py-3 font-sans text-[12px] text-pen-subtle">
                  No members yet.
                </li>
              )}
            </ul>
          </section>

          <TenantAgreements
            tenantId={tenant.id}
            initialAgreements={initialAgreements}
          />
        </div>
      </div>
    </div>
  );
}
