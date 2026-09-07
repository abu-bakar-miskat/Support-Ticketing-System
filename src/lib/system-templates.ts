/**
 * System templates: catalogue Templates that back a Department type. A
 * department's `type` (see department-types.ts) is defined by its template —
 * the template's feature set is what the type renders. System templates are
 * seeded by default (ensureSystemTemplates), always present, and cannot be
 * archived or deleted from the catalogue (guarded in the templates API + UI).
 *
 * Client-safe: constants + slug helpers only. The prisma-backed
 * ensureSystemTemplates lives in template-catalogue.ts (server-only).
 */
import type { TemplateFeatureKey } from "@/lib/template-features";
import {
  DEFAULT_DEPARTMENT_TYPE,
  isValidDepartmentType,
  type DepartmentType,
} from "@/lib/department-types";

export type SystemTemplate = {
  slug: string;
  name: string;
  description: string;
  /** The Department type this template defines. */
  departmentType: DepartmentType;
  featureKeys: TemplateFeatureKey[];
};

/**
 * Support desk template. Intake forms, email, SLAs, automation and assignment —
 * deliberately EXCLUDING development tooling (projects, modules, timeline,
 * Notion import). This is what a "support" department renders.
 */
export const SUPPORT_TEMPLATE: SystemTemplate = {
  slug: "support",
  name: "Support",
  description:
    "Customer-support desk: intake forms, email, SLAs, automation and assignment. No development tooling (projects, modules, sprints).",
  departmentType: "support",
  featureKeys: [
    // Views a support team uses (no timeline/modules — those are sprint/dev views)
    "tasks", "board", "reports", "calendar", "myTime", "activity", "subDepartmentReports", "helpCenter",
    // Workspace
    "members", "branding", "departmentsSettings",
    // Configuration — support operations
    "tagsLabels", "ticketTemplates", "workflows", "slaPolicies", "automationRules", "assignmentMethods",
    // Integrations — customer channels
    "supportForm", "emailSettings", "apiKeys",
  ],
};

/** Every system template. Seeded by default and protected from deletion. */
export const SYSTEM_TEMPLATES: SystemTemplate[] = [SUPPORT_TEMPLATE];

const SYSTEM_TEMPLATE_SLUGS = new Set(SYSTEM_TEMPLATES.map((t) => t.slug));

/** True when a template slug is a protected system template (non-deletable). */
export function isSystemTemplateSlug(slug: string | null | undefined): boolean {
  return typeof slug === "string" && SYSTEM_TEMPLATE_SLUGS.has(slug);
}

/** The system template that defines a given department type, if any. */
export function systemTemplateForDepartmentType(type: string): SystemTemplate | undefined {
  return SYSTEM_TEMPLATES.find((t) => t.departmentType === type);
}

/**
 * Board/interface type implied by a New Department template selection.
 * Built-in type slugs and system template slugs map to a known DepartmentType;
 * other catalogue templates fall back to the default type.
 */
export function departmentTypeForTemplateSlug(slug: string): DepartmentType {
  if (isValidDepartmentType(slug)) return slug;
  const sys = SYSTEM_TEMPLATES.find((t) => t.slug === slug);
  return sys?.departmentType ?? DEFAULT_DEPARTMENT_TYPE;
}
