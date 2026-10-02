"use client";

import { Building2 } from "lucide-react";
import { RailCard } from "./rail-card";

export type SubDepartmentSummary = {
  id: string; name: string; prefix: string; color: string;
  members: number; open: number; overdue: number;
};

// Every sub-department in the manager's scope — including ones with no open
// work — so the header count reflects the real team structure, not just the
// sub-departments that happen to have tickets needing attention.
export function SubDepartmentsSection({ subDepartments }: { subDepartments: SubDepartmentSummary[] }) {
  if (subDepartments.length === 0) return null;

  return (
    <RailCard
      id="sub-departments"
      icon={Building2}
      accent="#0a76b9"
      title="Team coverage"
      aside={<span className="font-sans text-[11px] text-sts-subtle">{subDepartments.length} sub-department{subDepartments.length === 1 ? "" : "s"}</span>}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_52px_78px] gap-3 border-b border-sts-card-border bg-sts-surface/35 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_70px_70px_92px]">
        <span className="sts-text-table-head">Sub-department</span>
        <span className="sts-text-table-head hidden text-right sm:block">People</span>
        <span className="sts-text-table-head text-right">Open</span>
        <span className="sts-text-table-head text-right">Health</span>
      </div>
      <div className="max-h-[min(420px,48vh)] overflow-y-auto overscroll-contain">
        {subDepartments.map((s) => (
          <div
            key={s.id}
            className="grid grid-cols-[minmax(0,1fr)_52px_78px] items-center gap-3 border-b border-sts-card-border/40 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_70px_70px_92px]"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="block size-[8px] shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-sans text-[12.5px] font-semibold text-sts-foreground">{s.name}</span>
                  <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-sts-subtle">{s.prefix}</span>
                </div>
                <span className="mt-0.5 block truncate font-sans text-[10.5px] text-sts-subtle">
                  {s.open === 0 ? "No open work" : `${s.open} ticket${s.open === 1 ? "" : "s"} in progress`}
                </span>
              </div>
            </div>
            <span className="hidden text-right font-mono text-[12px] tabular-nums text-sts-muted sm:block">{s.members}</span>
            <span className="text-right font-mono text-[12px] font-semibold tabular-nums text-sts-foreground">{s.open}</span>
            <span className={`justify-self-end rounded-md px-2 py-1 font-sans text-[10px] font-semibold ${s.overdue > 0 ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
              {s.overdue > 0 ? `${s.overdue} overdue` : "On track"}
            </span>
          </div>
        ))}
      </div>
    </RailCard>
  );
}
