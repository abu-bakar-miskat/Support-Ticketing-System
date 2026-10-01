import { LayoutGrid, Wrench } from "lucide-react";

/**
 * Named settings-nav and sidebar sections a Super Admin can bundle into a
 * Template (Template Catalogue). A plain const array (not a Prisma enum) so
 * adding a new gateable feature never needs a migration — TemplateFeature.key
 * is a free-text column, same pattern as PLATFORM_FEATURE_KEYS in
 * feature-keys.ts.
 *
 * Core personal/essential nav (Home, My Profile, Settings, Notifications,
 * the department switcher) is intentionally NOT gateable — hiding those would
 * leave a tenant unable to navigate the app at all.
 */
export const TEMPLATE_FEATURE_KEYS = [
  /** Tasks — sidebar "Tasks" (/tasks). */
  "tasks",
  /** Public intake/support forms — /support-forms. */
  "supportForm",
  /** Department/tenant email settings — /settings/email. */
  "emailSettings",
  /** API key management — /settings/api-keys. */
  "apiKeys",
  /** Notion data import — /settings/import. */
  "importForm",
  /** Members — sidebar "Members" (/department) + /settings/members. */
  "members",
  /** Shared Mailboxes — sidebar "Shared Mailboxes" (/mailboxes). */
  "sharedMailboxes",
  /** Departments management — /settings/departments. */
  "departmentsSettings",
  /** Branding — /settings/branding. */
  "branding",
  /** Projects — sidebar "Projects" (/projects) + /settings/projects. */
  "projects",
  /** Tags & labels — /settings/tags. */
  "tagsLabels",
  /** Ticket Templates — /settings/templates. */
  "ticketTemplates",
  /** Workflows & statuses — /settings/workflows. */
  "workflows",
  /** SLA policies — /settings/sla. */
  "slaPolicies",
  /** Automation rules — /settings/rules. */
  "automationRules",
  /** Assignment methods — /settings/assignment. */
  "assignmentMethods",
  /** Board view — sidebar "Board" (/board). */
  "board",
  /** Timeline view — sidebar "Timeline" (/timeline). */
  "timeline",
  /** Modules view — sidebar "Modules" (/modules). */
  "modules",
  /** Reports — sidebar "Reports" (/reports). */
  "reports",
  /** Calendar — sidebar "Calendar" (/calendar). */
  "calendar",
  /** My Time — sidebar "My Time" (/time). */
  "myTime",
  /** Activity feed — sidebar "Activity" (/activity). */
  "activity",
  /** SubDepartment Reports — sidebar "Sub Departments" (/sub-departments). */
  "subDepartmentReports",
  /** Help Center — sidebar "Help Center" (/docs). */
  "helpCenter",
] as const;

export type TemplateFeatureKey = (typeof TEMPLATE_FEATURE_KEYS)[number];

export function isTemplateFeatureKey(value: unknown): value is TemplateFeatureKey {
  return typeof value === "string" && (TEMPLATE_FEATURE_KEYS as readonly string[]).includes(value);
}

/** Display labels for the checklist in the Template Catalogue create/edit UI. */
export const TEMPLATE_FEATURE_LABELS: Record<TemplateFeatureKey, string> = {
  tasks: "Tasks",
  supportForm: "Support forms",
  emailSettings: "Email settings",
  apiKeys: "API keys",
  importForm: "Import from Notion",
  members: "Members",
  sharedMailboxes: "Shared Mailboxes",
  departmentsSettings: "Departments",
  branding: "Branding",
  projects: "Projects",
  tagsLabels: "Tags & labels",
  ticketTemplates: "Ticket Templates",
  workflows: "Workflows & statuses",
  slaPolicies: "SLA policies",
  automationRules: "Automation rules",
  assignmentMethods: "Assignment rules",
  board: "Board",
  timeline: "Timeline",
  modules: "Modules",
  reports: "Reports",
  calendar: "Calendar",
  myTime: "My Time",
  activity: "Activity",
  subDepartmentReports: "Sub Departments",
  helpCenter: "Help Center",
};

/**
 * Opt-in features. A new department is created without them. A tenant admin
 * requests one from the Features marketplace; it appears in the department
 * only after a super admin approves (or grants it directly).
 */
export const MARKETPLACE_FEATURE_KEYS = [
  "timeline",
  "reports",
  "subDepartmentReports",
  "calendar",
  "sharedMailboxes",
  "board",
  "activity",
  "tagsLabels",
  "workflows",
  "ticketTemplates",
  "assignmentMethods",
  "apiKeys",
  "slaPolicies",
  "supportForm",
] as const;

export type MarketplaceFeatureKey = (typeof MARKETPLACE_FEATURE_KEYS)[number];

const MARKETPLACE_FEATURE_KEY_SET = new Set<string>(MARKETPLACE_FEATURE_KEYS);

export function isMarketplaceFeatureKey(value: unknown): value is MarketplaceFeatureKey {
  return typeof value === "string" && MARKETPLACE_FEATURE_KEY_SET.has(value);
}

/** Stored on Department.featureKeys when a feature template has been approved. */
export function templateGrantToken(templateId: string): string {
  return `template:${templateId}`;
}

export function templateIdFromGrantToken(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("template:")) return null;
  const id = value.slice("template:".length);
  return id.length > 0 ? id : null;
}

/** Features that stay available without a marketplace grant. */
export const ALWAYS_ON_FEATURE_KEYS: TemplateFeatureKey[] = TEMPLATE_FEATURE_KEYS.filter(
  (key) => !MARKETPLACE_FEATURE_KEY_SET.has(key),
);

export const MARKETPLACE_FEATURE_DESCRIPTIONS: Record<MarketplaceFeatureKey, string> = {
  timeline: "Plan and schedule work on a timeline.",
  reports: "Department reports and exports.",
  subDepartmentReports: "Sub-department list and management.",
  calendar: "Department calendar.",
  sharedMailboxes: "Shared mailboxes for email intake.",
  board: "Work tickets in columns by status.",
  activity: "A log of changes across the department.",
  tagsLabels: "Tags and labels on tickets.",
  workflows: "Workflows and ticket statuses.",
  ticketTemplates: "Reusable ticket templates.",
  assignmentMethods: "Rules that assign tickets automatically.",
  apiKeys: "API keys for this department.",
  slaPolicies: "Response and resolution time targets.",
  supportForm: "Public forms people use to submit requests.",
};

/** Checklist groups for the department grant panel and the marketplace. */
export const MARKETPLACE_FEATURE_GROUPS: { label: string; icon: typeof LayoutGrid; keys: MarketplaceFeatureKey[] }[] = [
  {
    label: "Sidebar",
    icon: LayoutGrid,
    keys: ["timeline", "reports", "subDepartmentReports", "calendar", "sharedMailboxes", "board", "activity"],
  },
  {
    label: "Configuration settings",
    icon: Wrench,
    keys: ["tagsLabels", "workflows", "ticketTemplates", "assignmentMethods", "apiKeys", "slaPolicies", "supportForm"],
  },
];

/**
 * `null` featureKeys is a legacy department created before marketplace grants:
 * every marketplace feature is already on. An array is the explicit grant list
 * (new departments start at []).
 */
export function grantedMarketplaceFeatures(raw: unknown): MarketplaceFeatureKey[] | "ALL" {
  if (raw == null) return "ALL";
  if (!Array.isArray(raw)) return [];
  const keys: MarketplaceFeatureKey[] = [];
  for (const key of raw) {
    if (isMarketplaceFeatureKey(key) && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** Section grouping for the checklist in the Template Catalogue create/edit UI and cards. */
export const TEMPLATE_FEATURE_GROUPS: { label: string; icon: typeof LayoutGrid; keys: TemplateFeatureKey[] }[] = [
  {
    label: "Sidebar",
    icon: LayoutGrid,
    keys: ["tasks", "board", "timeline", "modules", "reports", "calendar", "myTime", "activity", "subDepartmentReports", "helpCenter", "members", "sharedMailboxes"],
  },
  {
    label: "Configuration settings",
    icon: Wrench,
    keys: ["projects", "tagsLabels", "ticketTemplates", "workflows", "slaPolicies", "assignmentMethods", "supportForm", "apiKeys", "importForm", "emailSettings"],
  },
];

/**
 * Maps a route prefix to the feature key that gates it. Kept in lockstep with
 * the sidebar (`sidebar.tsx` navViews/navMain) and settings nav
 * (`settings-nav.ts`) `templateFeatureKey`s. Ordered longest-prefix first so
 * `/settings/*` sub-routes resolve before generic prefixes. Un-gated routes
 * (Home, Profile, Settings root, Notifications, Departments) are absent → never
 * blocked.
 */
const FEATURE_PATH_ENTRIES: [prefix: string, key: TemplateFeatureKey][] = [
  ["/settings/api-keys", "apiKeys"],
  ["/settings/assignment", "assignmentMethods"],
  ["/settings/branding", "branding"],
  ["/settings/departments", "departmentsSettings"],
  ["/settings/email", "emailSettings"],
  ["/settings/import", "importForm"],
  ["/settings/members", "members"],
  ["/settings/projects", "projects"],
  ["/settings/rules", "automationRules"],
  ["/settings/sla-defaults", "slaPolicies"],
  ["/settings/sla", "slaPolicies"],
  ["/settings/support-forms", "supportForm"],
  ["/settings/tags", "tagsLabels"],
  ["/settings/templates", "ticketTemplates"],
  ["/settings/workflows", "workflows"],
  ["/sub-departments", "subDepartmentReports"],
  ["/support-forms", "supportForm"],
  ["/activity", "activity"],
  ["/board", "board"],
  ["/calendar", "calendar"],
  ["/department", "members"],
  ["/mailboxes", "sharedMailboxes"],
  ["/modules", "modules"],
  ["/projects", "projects"],
  ["/reports", "reports"],
  ["/tasks", "tasks"],
  ["/time", "myTime"],
  ["/timeline", "timeline"],
  ["/docs", "helpCenter"],
].sort((a, b) => b[0].length - a[0].length) as [string, TemplateFeatureKey][];

/** The feature key that gates `pathname`, or null when the route is un-gated. */
export function featureKeyForPath(pathname: string): TemplateFeatureKey | null {
  for (const [prefix, key] of FEATURE_PATH_ENTRIES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return key;
  }
  return null;
}
