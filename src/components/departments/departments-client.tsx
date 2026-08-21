"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users, FolderKanban, LayoutList,
  AlertCircle, Settings, Mail,
} from "lucide-react";
import { DepartmentIcon } from "@/components/icons/department-icon";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { InviteMemberDialog } from "@/components/platform/invite-member-dialog";
import { SettingsDepartmentsPage, type DepartmentRow } from "@/components/settings/settings-departments-page";
import { SettingsMembersPage, type MemberRow } from "@/components/settings/settings-members-page";
import { DepartmentsMailboxes, type DepartmentMailboxUsage } from "@/components/departments/departments-mailboxes";

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

  if (onClick) {
    return <button type="button" onClick={onClick} className="block text-left">{inner}</button>;
  }
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
  members,
  currentUserId,
  mailboxUsage,
}: {
  departments: DepartmentRow[];
  allUsers: UserOption[];
  orgStats?: OrgStats;
  tenantName?: string | null;
  tenantId?: string | null;
  members?: MemberRow[];
  currentUserId?: string;
  mailboxUsage?: DepartmentMailboxUsage[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"departments" | "users" | "mailboxes">("departments");
  const mailboxTotal = (mailboxUsage ?? []).reduce((sum, r) => sum + r.total, 0);

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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <StatCard icon={DepartmentIcon}     label="Departments"       value={orgStats.deptCount} />
            <StatCard icon={Users}        label="Teams"             value={orgStats.subDepartmentCount} />
            <StatCard icon={Users}        label="Members"           value={orgStats.memberCount}    onClick={() => setTab("users")} />
            <StatCard icon={Mail}         label="Mailboxes"         value={mailboxTotal}            onClick={() => setTab("mailboxes")} />
            <StatCard icon={FolderKanban} label="Projects"          value={orgStats.projectCount}   href="/projects" />
            <StatCard icon={LayoutList}   label="Open tickets"      value={orgStats.openTickets}    href="/all-tasks" />
            <StatCard icon={AlertCircle}  label="Pending approvals" value={orgStats.pendingRequests} alert href="/settings/sub-departments" />
          </div>

          {/* Tabs */}
          <div className="mt-5 flex items-center gap-1 border-b border-pen-card-border">
            {([
              { key: "departments" as const, label: "Departments" },
              { key: "users" as const, label: `Users${members ? ` (${members.length})` : ""}` },
              { key: "mailboxes" as const, label: `Mailboxes${mailboxUsage ? ` (${mailboxTotal})` : ""}` },
            ]).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative -mb-px px-3 py-2.5 font-sans text-[13px] font-medium transition-colors",
                  tab === t.key
                    ? "text-pen-blue after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-pen-blue"
                    : "text-pen-muted hover:text-pen-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Department management / Users / Mailboxes ───────────────────────── */}
      {tab === "users" && members ? (
        <SettingsMembersPage
          members={members}
          isAdmin
          currentUserId={currentUserId}
        />
      ) : tab === "mailboxes" ? (
        <DepartmentsMailboxes rows={mailboxUsage ?? []} />
      ) : (
        <SettingsDepartmentsPage
          departments={departments}
          allUsers={allUsers}
          isAdmin
          onEnterWorkspace={enterWorkspace}
        />
      )}
    </div>
  );
}
