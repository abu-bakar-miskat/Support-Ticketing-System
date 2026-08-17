/**
 * Tenant category labels. Stored as a plain string on Tenant.type so new types
 * need no migration — this list just drives the UI dropdown and validation.
 */
export const TENANT_TYPES = ["institution", "agency", "company"] as const;

export type TenantType = (typeof TENANT_TYPES)[number];

export const DEFAULT_TENANT_TYPE: TenantType = "company";

const LABELS: Record<TenantType, string> = {
  institution: "Institution",
  agency: "Agency",
  company: "Company",
};

export function isValidTenantType(value: unknown): value is TenantType {
  return typeof value === "string" && (TENANT_TYPES as readonly string[]).includes(value);
}

/** Human label for a stored type (title-cases unknown values as a fallback). */
export function tenantTypeLabel(value: string): string {
  if (isValidTenantType(value)) return LABELS[value];
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "—";
}
