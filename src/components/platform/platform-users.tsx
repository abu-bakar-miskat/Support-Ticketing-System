"use client";

import { useMemo, useState } from "react";
import { Building2, Crown, Search, ScrollText, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  PlatformInviteMemberDialog,
  type InviteTenant,
} from "@/components/platform/platform-invite-member-dialog";
import { UserAuditModal } from "@/components/platform/user-audit-modal";
import { cn } from "@/lib/utils";

type DeptInfo = { id: string; name: string; isManager: boolean; subDepartments: string[] };
type UserRow = {
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

// Super admins are excluded from this directory, so the role filter only covers
// the tenant-scoped roles.
type RoleFilter = "all" | "admin" | "manager" | "sub_manager" | "agent";
const ROLE_FILTERS: { id: RoleFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "admin", label: "Admin" },
  { id: "manager", label: "Manager" },
  { id: "sub_manager", label: "Sub Manager" },
  { id: "agent", label: "Agent" },
];

function matchesRoleFilter(u: UserRow, f: RoleFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "admin":
      return u.role === "admin";
    case "manager":
      return u.role === "manager";
    case "sub_manager":
      return u.role === "sub_manager";
    case "agent":
      return u.role === "agent";
  }
}

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

export function PlatformUsers({
  users,
  tenants,
  currentUserId,
}: {
  users: UserRow[];
  tenants: InviteTenant[];
  currentUserId: string;
}) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [dirQuery, setDirQuery] = useState("");
  const [auditUser, setAuditUser] = useState<UserRow | null>(null);

  const filteredUsers = useMemo(() => {
    const q = dirQuery.trim().toLowerCase();
    return users.filter(
      (u) =>
        matchesRoleFilter(u, roleFilter) &&
        (!q ||
          (u.name ?? "").toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.departments ?? []).some((d) => d.name.toLowerCase().includes(q))),
    );
  }, [users, roleFilter, dirQuery]);

  const roleCounts = useMemo(() => {
    const counts: Record<RoleFilter, number> = {
      all: users.length,
      admin: 0,
      manager: 0,
      sub_manager: 0,
      agent: 0,
    };
    for (const u of users) {
      for (const f of ["admin", "manager", "sub_manager", "agent"] as RoleFilter[]) {
        if (matchesRoleFilter(u, f)) counts[f] += 1;
      }
    }
    return counts;
  }, [users]);

  return (
    <div className="min-h-screen overflow-y-auto">
      <div className="w-full px-6 py-8 lg:px-10">
        <PageHeader
          icon={Users}
          title="Platform users"
          description="All members across the platform, excluding super admins. Use Administrators to manage platform-level access."
          actions={<PlatformInviteMemberDialog tenants={tenants} />}
        />

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-full border border-sts-card-border bg-sts-surface p-0.5">
            {ROLE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setRoleFilter(f.id)}
                className={cn(
                  "rounded-full px-3 py-1 font-sans text-[11.5px] font-medium transition-colors",
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

        <div className="mt-3">
          <h2 className="font-sans text-[13px] font-semibold text-sts-foreground">
            {filteredUsers.length} {filteredUsers.length === 1 ? "user" : "users"}
          </h2>
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-sts-card-border bg-sts-card p-2 shadow-sts-card">
            {filteredUsers.length === 0 ? (
              <p className="px-2 py-6 text-center font-sans text-[12px] text-sts-subtle">
                No users match this filter.
              </p>
            ) : (
              filteredUsers.map((user) => {
                const roleLabel = user.role ? ROLE_LABELS[user.role] ?? user.role : null;
                const userTenants = user.tenants ?? [];
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
                          <span className="rounded-full bg-sts-blue-tint px-1.5 py-0.5 font-sans text-[10px] font-medium text-sts-blue">
                            {roleLabel}
                          </span>
                        )}
                      </div>
                      <div className="truncate font-sans text-[11.5px] text-sts-subtle">{user.email}</div>
                      {userTenants.length > 0 && (
                        <div className="mt-1 font-sans text-[11px] text-sts-subtle">{userTenants.join(", ")}</div>
                      )}
                      <DeptPills departments={user.departments} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setAuditUser(user)}
                      title="View audit log for this user"
                      className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-full border border-sts-card-border bg-sts-surface px-2.5 py-1 font-sans text-[11.5px] font-medium text-sts-muted transition-colors hover:text-sts-foreground"
                    >
                      <ScrollText className="size-3.5" />
                      Audit
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      {auditUser && (
        <UserAuditModal
          userId={auditUser.id}
          userName={auditUser.name || auditUser.email}
          onClose={() => setAuditUser(null)}
        />
      )}
    </div>
  );
}
