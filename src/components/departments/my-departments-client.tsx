"use client";

import { useState } from "react";
import { DepartmentIcon } from "@/components/icons/department-icon";
import { DepartmentIconVisual } from "@/components/icons/department-icon-visual";
import { Users, FolderKanban, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";

export type MyDepartmentItem = {
  id: string;
  name: string;
  isHub: boolean;
  subDepartmentCount: number;
  projectCount: number;
  memberCount: number;
  accessType: "manager" | "guest" | "member";
};

function RoleBadge({ type }: { type: MyDepartmentItem["accessType"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-[7px] py-px font-sans text-[10px] font-semibold uppercase tracking-wide",
        type === "manager" && "bg-purple-500/15 text-purple-600 dark:text-purple-400",
        type === "guest"   && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
        type === "member"  && "bg-pen-surface text-pen-subtle",
      )}
    >
      {type === "manager" ? "Manager" : type === "guest" ? "Guest" : "Member"}
    </span>
  );
}

function DeptCard({ dept }: { dept: MyDepartmentItem }) {
  const [entering, setEntering] = useState(false);

  async function enter() {
    setEntering(true);
    await fetch("/api/active-dept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deptId: dept.id }),
    });
    window.location.href = "/";
  }

  return (
    <div className="flex flex-col rounded-2xl border border-pen-card-border bg-pen-card transition-colors hover:border-pen-blue/30">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pt-5 pb-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pen-blue/10">
          <DepartmentIconVisual
            name={dept.name}
            id={dept.id}
            isHub={dept.isHub}
            size="lg"
            className="text-pen-blue"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="pen-text-modal-title leading-tight">
              {dept.name}
            </h3>
            <RoleBadge type={dept.accessType} />
            {dept.isHub && (
              <span className="inline-flex items-center rounded-full bg-violet-100 px-[7px] py-px font-sans text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                Hub
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 font-sans text-[12px] text-pen-subtle">
              <Users className="size-3.5" />
              {dept.subDepartmentCount} {dept.subDepartmentCount === 1 ? "team" : "teams"}
            </span>
            <span className="flex items-center gap-1 font-sans text-[12px] text-pen-subtle">
              <Users className="size-3.5" />
              {dept.memberCount} {dept.memberCount === 1 ? "member" : "members"}
            </span>
            <span className="flex items-center gap-1 font-sans text-[12px] text-pen-subtle">
              <FolderKanban className="size-3.5" />
              {dept.projectCount} {dept.projectCount === 1 ? "project" : "projects"}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-pen-card-border px-5 py-3.5">
        <button
          type="button"
          onClick={enter}
          disabled={entering}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-pen-blue px-4 py-2.5 font-sans text-[13px] font-semibold text-white transition-colors hover:bg-pen-blue/90 disabled:opacity-60"
        >
          {entering ? "Entering…" : "Enter workspace"}
          {!entering && <ArrowRight className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function MyDepartmentsClient({ departments }: { departments: MyDepartmentItem[] }) {
  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="border-b border-pen-card-border bg-pen-card/50 px-6 py-6 sm:px-10">
        <PageHeader
          title="My Departments"
          description={`You have access to ${departments.length} departments. Select one to enter its workspace.`}
          icon={DepartmentIcon}
          iconClassName="text-pen-blue"
        />
      </div>

      {/* Department grid */}
      <div className="px-6 py-6 sm:px-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => (
            <DeptCard key={dept.id} dept={dept} />
          ))}
        </div>
      </div>
    </div>
  );
}
