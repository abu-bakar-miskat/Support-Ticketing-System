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
  ["/settings/sla", "slaPolicies"],
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
