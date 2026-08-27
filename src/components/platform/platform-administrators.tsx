"use client";

import { useMemo, useRef, useState } from "react";
import { ShieldCheck, X, Building2, Crown, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

type DeptInfo = { id: string; name: string; isManager: boolean; subDepartments: string[] };
type AdminRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role?: string;
  isSuperAdmin?: boolean;
  tenants?: string[];
  departments?: DeptInfo[];
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  sub_manager: "Lead",
  agent: "Agent",
};

// Role filter buckets. "Super Admin" is the isSuperAdmin boolean (not a Role
// enum value); "Manager" folds in sub_manager (Lead) so no user is hidden.
type RoleFilter = "all" | "super_admin" | "admin" | "manager" | "agent";
const ROLE_FILTERS: { id: RoleFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "super_admin", label: "Super Admin" },
  { id: "admin", label: "Admin" },
  { id: "manager", label: "Manager" },
  { id: "agent", label: "Agent" },
];

function matchesRoleFilter(u: AdminRow, f: RoleFilter): boolean {
  switch (f) {
    case "all": return true;
    case "super_admin": return !!u.isSuperAdmin;
    case "admin": return u.role === "admin";
    case "manager": return u.role === "manager" || u.role === "sub_manager";
    case "agent": return u.role === "agent";
  }
}

/** Departments a user touches, as pills. Matches the admin-list rendering. */
function DeptPills({ departments }: { departments?: DeptInfo[] }) {
  if (departments && departments.length > 0) {
    return (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {departments.map((dept) => (
          <span
            key={dept.id}
            className="inline-flex items-center gap-1 rounded-md border border-sts-card-border bg-sts-surface px-1.5 py-0.5 font-sans text-[11px] text-sts-foreground"
            title={dept.subDepartments.length ? `Sub departments: ${dept.subDepartments.join(", ")}` : undefined}
          >
            {dept.isManager ? (
              <Crown className="size-3 text-sts-blue" />
            ) : (
              <Building2 className="size-3 text-sts-subtle" />
            )}
            <span className="font-medium">{dept.name}</span>
            {dept.subDepartments.length > 0 && (
              <span className="text-sts-subtle">· {dept.subDepartments.join(", ")}</span>
            )}
          </span>
        ))}
      </div>
    );
  }
  if (departments) {
    return (
      <div className="mt-1.5 font-sans text-[11px] italic text-sts-subtle">No department membership</div>
    );
  }
  return null;
}

export function PlatformAdministrators({
  admins: initialAdmins,
  allUsers,
  currentUserId,
}: {
  admins: AdminRow[];
  allUsers: AdminRow[];
  currentUserId: string;
}) {
  const [admins, setAdmins] = useState<AdminRow[]>(initialAdmins);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The admin awaiting removal confirmation (null = dialog closed).
  const [confirmRemove, setConfirmRemove] = useState<AdminRow | null>(null);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AdminRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchSeq = useRef(0);

  // "All users" directory: role filter + free-text search (client-side).
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [dirQuery, setDirQuery] = useState("");

  const filteredUsers = useMemo(() => {
    const q = dirQuery.trim().toLowerCase();
    return allUsers.filter(
      (u) =>
        matchesRoleFilter(u, roleFilter) &&
        (!q ||
          (u.name ?? "").toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.departments ?? []).some((d) => d.name.toLowerCase().includes(q))),
    );
  }, [allUsers, roleFilter, dirQuery]);

  const roleCounts = useMemo(() => {
    const counts: Record<RoleFilter, number> = {
      all: allUsers.length,
      super_admin: 0,
      admin: 0,
      manager: 0,
      agent: 0,
    };
    for (const u of allUsers) {
      for (const f of ["super_admin", "admin", "manager", "agent"] as RoleFilter[]) {
        if (matchesRoleFilter(u, f)) counts[f] += 1;
      }
    }
    return counts;
  }, [allUsers]);

  function onQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(value.trim())}`).catch(() => null);
      if (seq !== searchSeq.current) return;
      const body = res && res.ok ? await res.json().catch(() => ({ users: [] })) : { users: [] };
      setSearchResults(body.users ?? []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }

  async function addAdmin(user: AdminRow) {
    setQuery("");
    setSearchResults([]);
    setSearchOpen(false);
    setError(null);
    setBusyId(user.id);
    const res = await fetch("/api/admin/super-admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    const body = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(body.error ?? "Failed to grant super-admin access");
      return;
    }
    setAdmins((prev) =>
      prev.some((a) => a.id === user.id) ? prev : [...prev, body.admin].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  // Throws on failure so the ConfirmDialog surfaces a toast and keeps the modal
  // open; on success it closes the dialog and toasts.
  async function removeAdmin(user: AdminRow) {
    setError(null);
    const res = await fetch("/api/admin/super-admins", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to remove super-admin access");
    }
    setAdmins((prev) => prev.filter((a) => a.id !== user.id));
  }

  const existingIds = new Set(admins.map((a) => a.id));

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={ShieldCheck}
          title="Platform administrators"
          description="Super admins can manage every tenant, template, and feature flag on the platform. Grant this sparingly."
        />

        <div className="mt-6 max-w-sm">
          <label className="mb-1.5 block font-sans text-[12.5px] font-medium text-sts-foreground">
            Add administrator
          </label>
          <div className="relative">
            <Input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search a name or email"
              className="h-9 w-full"
              autoComplete="off"
            />
            {searchOpen && query.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-sts-card-border bg-sts-bg shadow-xl">
                {searching ? (
                  <p className="px-2.5 py-2 font-sans text-[11.5px] text-sts-subtle">Searching…</p>
                ) : searchResults.length === 0 ? (
                  <p className="px-2.5 py-2 font-sans text-[11.5px] text-sts-subtle">No matching users.</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto p-1">
                    {searchResults.map((u) => {
                      const already = existingIds.has(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          disabled={already}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addAdmin(u)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sts-surface disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size={22} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-sans text-[12.5px] font-medium text-sts-foreground">
                              {u.name || u.email}
                            </div>
                            <div className="truncate font-sans text-[11px] text-sts-subtle">{u.email}</div>
                          </div>
                          {already && <span className="font-sans text-[11px] text-sts-subtle">Already admin</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
            {error}
          </div>
        )}

        <div className="mt-8">
          <h2 className="font-sans text-[13px] font-semibold text-sts-foreground">
            Current administrators ({admins.length})
          </h2>
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-sts-card-border bg-sts-card p-2 shadow-sts-card">
            {admins.map((admin) => {
              const isSelf = admin.id === currentUserId;
              const roleLabel = admin.role ? ROLE_LABELS[admin.role] ?? admin.role : null;
              // undefined = just added via search (not yet hydrated); [] = server
              // confirmed no memberships.
              const departments = admin.departments;
              const tenants = admin.tenants ?? [];
              return (
                <div
                  key={admin.id}
                  className="flex items-start justify-between gap-3 rounded-lg px-2 py-2 hover:bg-sts-surface/50"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    <UserAvatar name={admin.name} avatarUrl={admin.avatarUrl} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="truncate font-sans text-[13px] font-medium text-sts-foreground">
                          {admin.name || admin.email}
                        </span>
                        {isSelf && <span className="font-sans text-[11px] text-sts-subtle">(you)</span>}
                        {roleLabel && (
                          <span className="rounded-full bg-sts-blue-tint px-1.5 py-0.5 font-sans text-[10px] font-medium text-sts-blue">
                            {roleLabel}
                          </span>
                        )}
                      </div>
                      <div className="truncate font-sans text-[11.5px] text-sts-subtle">{admin.email}</div>

                      {tenants.length > 0 && (
                        <div className="mt-1 font-sans text-[11px] text-sts-subtle">
                          {tenants.join(", ")}
                        </div>
                      )}

                      <DeptPills departments={departments} />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={isSelf || busyId === admin.id}
                    title={isSelf ? "You can't remove your own super-admin access" : undefined}
                    onClick={() => setConfirmRemove(admin)}
                  >
                    <X className="size-3.5" />
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        {/* All users directory — filter by role, see each user's departments */}
        <div className="mt-10">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-sts-subtle" />
            <h2 className="font-sans text-[13px] font-semibold text-sts-foreground">
              All users ({filteredUsers.length})
            </h2>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex gap-0.5 rounded-lg border border-sts-card-border bg-sts-surface p-0.5">
              {ROLE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setRoleFilter(f.id)}
                  className={cn(
                    "rounded-md px-3 py-1 font-sans text-[11.5px] font-medium transition-colors",
                    roleFilter === f.id
                      ? "bg-sts-blue text-white shadow-sm dark:text-gray-900"
                      : "text-sts-muted hover:text-sts-foreground",
                  )}
                >
                  {f.label}
                  <span className={cn("ml-1.5", roleFilter === f.id ? "opacity-70" : "text-sts-subtle")}>
                    {roleCounts[f.id]}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sts-subtle" />
              <Input
                type="text"
                value={dirQuery}
                onChange={(e) => setDirQuery(e.target.value)}
                placeholder="Search name, email, department"
                className="h-8 w-[240px] pl-8"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-sts-card-border bg-sts-card p-2 shadow-sts-card">
            {filteredUsers.length === 0 ? (
              <p className="px-2 py-6 text-center font-sans text-[12px] text-sts-subtle">
                No users match this filter.
              </p>
            ) : (
              filteredUsers.map((user) => {
                const roleLabel = user.isSuperAdmin
                  ? "Super Admin"
                  : user.role
                    ? ROLE_LABELS[user.role] ?? user.role
                    : null;
                const tenants = user.tenants ?? [];
                return (
                  <div key={user.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-sts-surface/50">
                    <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="truncate font-sans text-[13px] font-medium text-sts-foreground">
                          {user.name || user.email}
                        </span>
                        {user.id === currentUserId && (
                          <span className="font-sans text-[11px] text-sts-subtle">(you)</span>
                        )}
                        {roleLabel && (
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 font-sans text-[10px] font-medium",
                              user.isSuperAdmin
                                ? "bg-sts-blue text-white dark:text-gray-900"
                                : "bg-sts-blue-tint text-sts-blue",
                            )}
                          >
                            {roleLabel}
                          </span>
                        )}
                      </div>
                      <div className="truncate font-sans text-[11.5px] text-sts-subtle">{user.email}</div>
                      {tenants.length > 0 && (
                        <div className="mt-1 font-sans text-[11px] text-sts-subtle">{tenants.join(", ")}</div>
                      )}
                      <DeptPills departments={user.departments} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(open) => { if (!open) setConfirmRemove(null); }}
        title="Remove administrator"
        description={
          confirmRemove
            ? `Remove super-admin access from ${confirmRemove.name || confirmRemove.email}? They'll lose the ability to manage tenants, templates, and feature flags across the platform.`
            : ""
        }
        confirmLabel="Remove"
        successMessage={confirmRemove ? `${confirmRemove.name || confirmRemove.email} is no longer an administrator` : undefined}
        onConfirm={async () => { if (confirmRemove) await removeAdmin(confirmRemove); }}
      />
    </div>
  );
}
