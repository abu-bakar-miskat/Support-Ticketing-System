/**
 * Named platform features a Super Admin can disable per tenant (slice 19,
 * SA-04). A plain const array (not a Prisma enum) so adding a new key never
 * needs a migration — `FeatureFlag.key` is a free-text column.
 */
export const PLATFORM_FEATURE_KEYS = [
  /** Connecting a department/sub-department mailbox for email intake (slice 14). */
  "mailboxConnections",
  /** Bulk reassignment of a source agent's tickets (slice 13, ASG-05). */
  "bulkReassign",
  /** Custom/cross-department reporting + async export jobs (slice 18, RPT-04/05/06). */
  "customReports",
  /** Per-department SLA policies and timers (slice 10). */
  "slaPolicies",
  /** Rule-based/round-robin/workload-based auto-assignment (slice 11, ASG-01). */
  "assignmentRules",
  /** Public intake forms (slice 08). */
  "intakeForms",
  /** Candidate recruitment boards + screening. */
  "recruitment",
  /** Time entries / time tracking. */
  "timeTracking",
  /** Temporary grants of access across departments (department cards UI + APIs). */
  "crossDepartmentAccess",
] as const;

export type FeatureKey = (typeof PLATFORM_FEATURE_KEYS)[number];

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && (PLATFORM_FEATURE_KEYS as readonly string[]).includes(value);
}

/** Map a dashboard/settings path to the platform flag that hides it (SA-04 UI). */
export function platformFlagForPath(href: string): FeatureKey | null {
  if (href.includes("/settings/sla") || href.includes("/sla-policies")) return "slaPolicies";
  if (href.includes("/settings/rules") || href.includes("/automation-rules")) return "assignmentRules";
  if (href.includes("/settings/assignment")) return "assignmentRules";
  if (href.includes("/settings/intake-forms") || href === "/settings/intake-forms") return "intakeForms";
  if (href.includes("/mailboxes") || href.includes("/mailbox")) return "mailboxConnections";
  if (href === "/reports" || href.startsWith("/reports")) return "customReports";
  if (href.includes("/recruitment")) return "recruitment";
  if (href === "/time" || href.startsWith("/time")) return "timeTracking";
  return null;
}

export function isPathEnabledByFlags(href: string, flags: Partial<Record<FeatureKey, boolean>> | null | undefined): boolean {
  const key = platformFlagForPath(href);
  if (!key || !flags) return true;
  return flags[key] !== false;
}
