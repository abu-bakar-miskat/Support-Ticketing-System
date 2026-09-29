"use client";

import Link from "next/link";
import {
  Users, FolderKanban, LayoutList,
  Settings, Mail, Shield,
} from "lucide-react";
import { DepartmentIcon } from "@/components/icons/department-icon";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { InviteMemberDialog } from "@/components/platform/invite-member-dialog";
import { SettingsDepartmentsPage, type DepartmentRow, type TemplateOption } from "@/components/settings/settings-departments-page";
import { type MemberRow } from "@/components/settings/settings-members-page";
import { type DepartmentMailboxUsage } from "@/components/departments/departments-mailboxes";

type UserOption = { id: string; name: string; email: string; role: string };

type OrgStats = {
  deptCount: number;
  subDepartmentCount: number;
  managerCount: number;
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
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  alert?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="flex h-full flex-col gap-1.5 px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("size-3.5", alert && value > 0 ? "text-amber-500" : "text-sts-subtle")} />
        <span className="sts-text-section-label">{label}</span>
      </div>
      <p className={cn(
        "font-mono text-[22px] font-semibold leading-none tracking-tight",
        alert && value > 0 ? "text-amber-600 dark:text-amber-400" : "text-sts-foreground",
      )}>
        {value}
      </p>
    </div>
  );

  if (onClick) {
    return <button type="button" onClick={onClick} className="block h-full text-left transition-colors hover:bg-sts-surface">{inner}</button>;
  }
  if (href) {
    return <Link href={href} className="block h-full transition-colors hover:bg-sts-surface">{inner}</Link>;
  }
  return inner;
}

export function DepartmentsClient({
  departments,
  allUsers,
  orgStats,
  tenantName,
  tenantId,
  mailboxUsage,
  templateOptions,
  showCrossDeptAccess = false,
}: {
  departments: DepartmentRow[];
  allUsers: UserOption[];
  orgStats?: OrgStats;
  tenantName?: string | null;
  tenantId?: string | null;
  members?: MemberRow[];
  currentUserId?: string;
  mailboxUsage?: DepartmentMailboxUsage[];
  templateOptions?: TemplateOption[];
  showCrossDeptAccess?: boolean;
}) {
  const mailboxTotal = (mailboxUsage ?? []).reduce((sum, r) => sum + r.total, 0);

  async function enterWorkspace(deptId: string) {
    const res = await fetch("/api/active-dept", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deptId }),
    });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    if (!body.tenantSlug || !body.slug) return;
    window.location.assign(`/${body.tenantSlug}/${body.slug}`);
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* ── Org overview header ─────────────────────────────────────────────── */}
      {orgStats && (
        <div className="border-b border-sts-card-border bg-sts-card/40 px-6 py-5 sm:px-10">
          <PageHeader
            title={tenantName || "Organisation Overview"}
            description="Browse departments across this tenant. Enter a workspace, or manage people and access from each card."
            icon={DepartmentIcon}
            iconClassName="text-sts-blue"
            actions={
              <div className="flex items-center gap-2">
                {tenantId && (
                  <InviteMemberDialog
                    tenantId={tenantId}
                    departments={departments.map((d) => ({
                      id: d.id,
                      name: d.name,
                      subDepartments: d.subDepartments ?? [],
                    }))}
                  />
                )}
                <Link
                  href="/settings"
                  className="flex items-center gap-1.5 rounded-full border border-sts-card-border bg-sts-surface px-3 py-1.5 font-sans text-[12px] text-sts-muted transition-colors hover:border-sts-blue/40 hover:text-sts-foreground"
                >
                  <Settings className="size-3.5" />
                  Settings
                </Link>
              </div>
            }
            className="mb-4"
          />

          {/* Stats — single flat panel, hairline-divided */}
          <div className="grid grid-cols-2 divide-x divide-y divide-sts-card-border overflow-hidden rounded-xl border border-sts-card-border bg-sts-card sm:grid-cols-4 lg:grid-cols-7 lg:divide-y-0">
            <StatCard icon={DepartmentIcon} label="Departments" value={orgStats.deptCount} />
            <StatCard icon={Users} label="Sub-departments" value={orgStats.subDepartmentCount} />
            <StatCard icon={Shield} label="Managers" value={orgStats.managerCount} />
            <StatCard icon={Users} label="Members" value={orgStats.memberCount} href="/departments/users" />
            <StatCard icon={Mail} label="Mailboxes" value={mailboxTotal} href="/departments/mailboxes" />
            <StatCard icon={FolderKanban} label="Projects" value={orgStats.projectCount} href="/projects" />
            <StatCard icon={LayoutList} label="Open tickets" value={orgStats.openTickets} href="/all-tasks" />
          </div>
        </div>
      )}

      {/* ── Department management ───────────────────────────────────────────── */}
      <SettingsDepartmentsPage
        departments={departments}
        allUsers={allUsers}
        isAdmin
        tenantId={tenantId}
        onEnterWorkspace={enterWorkspace}
        templateOptions={templateOptions}
        showCrossDeptAccess={showCrossDeptAccess}
      />
    </div>
  );
}
