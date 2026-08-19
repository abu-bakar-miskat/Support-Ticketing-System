"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users, FolderKanban, LayoutList,
  AlertCircle, Settings,
} from "lucide-react";
import { DepartmentIcon } from "@/components/icons/department-icon";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { InviteMemberDialog } from "@/components/platform/invite-member-dialog";
import { SettingsDepartmentsPage, type DepartmentRow } from "@/components/settings/settings-departments-page";

type UserOption = { id: string; name: string; email: string; role: string };

type OrgStats = {
  deptCount: number;
  subDepartmentCount: number;
  memberCount: number;
  projectCount: number;
  openTickets: number;
  pendingRequests: number;
};

function StatCard({
  icon: Icon,
  label,
  value,
  alert,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  alert?: boolean;
  href?: string;
}) {
  const inner = (
    <div className={cn(
      "flex flex-col gap-2 rounded-2xl border p-5 transition-colors",
      alert && value > 0
        ? "border-amber-400/50 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5"
        : "border-pen-card-border bg-pen-card hover:border-pen-blue/30",
    )}>
      <div className="flex items-center gap-2">
        <span className={cn(
          "flex size-8 items-center justify-center rounded-xl",
          alert && value > 0 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-pen-blue/10",
        )}>
          <Icon className={cn("size-4", alert && value > 0 ? "text-amber-600 dark:text-amber-400" : "text-pen-blue")} />
        </span>
        <span className="pen-text-section-label">{label}</span>
      </div>
      <p className={cn(
        "font-mono text-[32px] font-semibold leading-none",
        alert && value > 0 ? "text-amber-600 dark:text-amber-400" : "text-pen-foreground",
      )}>
        {value}
      </p>
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{inner}</Link>;
  }
  return inner;
}

export function DepartmentsClient({
  departments,
  allUsers,
  orgStats,
  tenantName,
  tenantId,
}: {
  departments: DepartmentRow[];
  allUsers: UserOption[];
  orgStats?: OrgStats;
  tenantName?: string | null;
  tenantId?: string | null;
}) {
  const router = useRouter();

  async function enterWorkspace(deptId: string) {
    await fetch("/api/active-dept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deptId }),
    });
    window.location.href = "/";
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* ── Org overview header ─────────────────────────────────────────────── */}
      {orgStats && (
        <div className="border-b border-pen-card-border bg-pen-card/50 px-6 py-6 sm:px-10">
          <PageHeader
            title={tenantName || "Organisation Overview"}
            description="Manage departments, teams and access across this tenant."
            icon={DepartmentIcon}
            iconClassName="text-pen-blue"
            actions={
              <div className="flex items-center gap-2">
                {tenantId && (
                  <InviteMemberDialog
                    tenantId={tenantId}
                    departments={departments.map((d) => ({ id: d.id, name: d.name }))}
                  />
                )}
                <Link
                  href="/settings"
                  className="flex items-center gap-1.5 rounded-lg border border-pen-card-border bg-pen-surface px-3 py-1.5 font-sans text-[12px] text-pen-muted transition-colors hover:border-pen-blue/40 hover:text-pen-foreground"
                >
                  <Settings className="size-3.5" />
                  Settings
                </Link>
              </div>
            }
            className="mb-5"
          />

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard icon={DepartmentIcon}     label="Departments"       value={orgStats.deptCount} />
            <StatCard icon={Users}        label="Teams"             value={orgStats.subDepartmentCount} />
            <StatCard icon={Users}        label="Members"           value={orgStats.memberCount}    href="/settings/members" />
            <StatCard icon={FolderKanban} label="Projects"          value={orgStats.projectCount}   href="/projects" />
            <StatCard icon={LayoutList}   label="Open tickets"      value={orgStats.openTickets}    href="/all-tasks" />
            <StatCard icon={AlertCircle}  label="Pending approvals" value={orgStats.pendingRequests} alert href="/settings/sub-departments" />
          </div>
        </div>
      )}

      {/* ── Department management ────────────────────────────────────────────── */}
      <SettingsDepartmentsPage
        departments={departments}
        allUsers={allUsers}
        isAdmin
        onEnterWorkspace={enterWorkspace}
      />
    </div>
  );
}
