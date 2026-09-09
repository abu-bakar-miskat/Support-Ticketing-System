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
      title="Sub-departments"
      aside={<span className="font-sans text-[11px] text-sts-subtle">{subDepartments.length} in scope</span>}
    >
      <div className="max-h-[min(420px,48vh)] overflow-y-auto overscroll-contain">
        {subDepartments.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2.5 border-b border-sts-card-border/40 px-4 py-3 last:border-b-0"
          >
            <span className="block size-[8px] shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-sans text-[12.5px] font-semibold text-sts-foreground">{s.name}</span>
                <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-sts-subtle">{s.prefix}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 font-sans text-[10.5px] text-sts-muted">
                <span>{s.members} member{s.members === 1 ? "" : "s"}</span>
                <span>{s.open} open</span>
                {s.overdue > 0 && <span className="text-red-500">{s.overdue} overdue</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </RailCard>
  );
}
