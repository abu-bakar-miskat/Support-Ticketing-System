"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SlaSettingsPage } from "@/components/settings/sla-settings-page";

type SubDepartmentOption = { id: string; name: string };
type DepartmentOption = { id: string; name: string; subDepartments: SubDepartmentOption[] };

/**
 * Department-wise SLA configuration for the tenant's Departments area. A tenant
 * admin picks a department, then configures its department-level SLA per support
 * form via the shared {@link SlaSettingsPage}. Sub-department-scoped SLA is
 * managed separately on the department's own settings page; at run time a
 * ticket's sub-department policies override these department-level ones, which
 * override the tenant-level defaults (see lib/sla-engine.ts
 * `resolveSlaPolicyTiers`).
 */
export function DepartmentsSlaPage({ departments }: { departments: DepartmentOption[] }) {
  const [selectedId, setSelectedId] = useState<string>(departments[0]?.id ?? "");
  const selected = departments.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="w-full">
      <div className="px-5 pt-8 sm:px-8 lg:px-10">
        <h1 className="sts-text-modal-title mb-1">SLA</h1>
        <p className="mb-5 max-w-2xl font-sans text-[12.5px] text-sts-muted">
          Configure service-level targets per department, grouped by support form. A department&apos;s
          own SLA policies override the tenant-level defaults; departments without any inherit them.
        </p>

        {departments.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-sts-card-border px-3 py-10 text-center font-sans text-[12px] text-sts-muted">
            No departments available to configure.
          </p>
        ) : (
          <div className="max-w-xs">
            <label className="sts-text-label mb-1.5 block">Department</label>
            <SearchableSelect
              value={selectedId}
              onChange={(v) => setSelectedId(v ?? "")}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="Select a department"
              size="md"
              aria-label="Department"
            />
          </div>
        )}
      </div>

      {selected && (
        <SlaSettingsPage
          key={selected.id}
          departmentId={selected.id}
          departmentName={selected.name}
          subDepartments={selected.subDepartments}
          hideBackLink
          showSubDepartment={false}
          showMailboxSla={false}
        />
      )}
    </div>
  );
}
