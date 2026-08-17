/**
 * Department templates. Stored as a plain string on Department.type so new
 * templates need no migration. Each type drives per-type settings + interface:
 *  - development: standard boards, sprints, modules, timeline.
 *  - support:     intake forms + customer replies; dev-planning views hidden.
 *  - hub:         cross-department oversight (kept in sync with Department.isHub).
 */
export const DEPARTMENT_TYPES = ["development", "support", "hub"] as const;

export type DepartmentType = (typeof DEPARTMENT_TYPES)[number];

export const DEFAULT_DEPARTMENT_TYPE: DepartmentType = "development";

const LABELS: Record<DepartmentType, string> = {
  development: "Development",
  support: "Support",
  hub: "Hub",
};

const DESCRIPTIONS: Record<DepartmentType, string> = {
  development: "Standard boards, sprints, modules and timeline.",
  support: "Intake forms and customer replies; sprints/modules hidden.",
  hub: "Cross-department oversight across the whole tenant.",
};

export function isValidDepartmentType(value: unknown): value is DepartmentType {
  return typeof value === "string" && (DEPARTMENT_TYPES as readonly string[]).includes(value);
}

/** Normalize any stored value to a known type (defaults to development). */
export function normalizeDepartmentType(value: unknown): DepartmentType {
  return isValidDepartmentType(value) ? value : DEFAULT_DEPARTMENT_TYPE;
}

export function departmentTypeLabel(value: string): string {
  if (isValidDepartmentType(value)) return LABELS[value];
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "—";
}

export function departmentTypeDescription(value: string): string {
  return isValidDepartmentType(value) ? DESCRIPTIONS[value] : "";
}

/** Dev-planning views (Modules, Timeline) are hidden for support departments. */
export function departmentHidesDevPlanning(type: string): boolean {
  return normalizeDepartmentType(type) === "support";
}

/** Support departments surface intake/support forms in the primary nav. */
export function departmentSurfacesSupport(type: string): boolean {
  return normalizeDepartmentType(type) === "support";
}
