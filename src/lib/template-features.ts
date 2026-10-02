import { LayoutGrid, Wrench } from "lucide-react";
import { toInternalAppPath } from "@/lib/tenant-path";

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

/**
 * What each marketplace feature does, and when a department would turn it on.
 * Shown on the Features marketplace card and in the template dialog.
 */
export const MARKETPLACE_FEATURE_COPY: Record<
  MarketplaceFeatureKey,
  { explanation: string; useCase: string }
> = {
  timeline: {
    explanation:
      "A timeline of this department's tickets, so you can see what's scheduled and how work lines up over days.",
    useCase:
      "Turn this on when the team plans work ahead and needs to see what's due across days, not only as a list or a board.",
  },
  reports: {
    explanation:
      "Volume and resolution-time reports for the last 30 days, plus time logged by the department.",
    useCase:
      "Turn this on when managers need to see how much work came in, how long it took to resolve, and where time went.",
  },
  subDepartmentReports: {
    explanation: "The list of sub-departments in this department, and who belongs to each one.",
    useCase:
      "Turn this on when the department is split into teams and people need one place to see or manage those teams.",
  },
  calendar: {
    explanation: "A shared calendar of working hours, off-days, and when people are unavailable.",
    useCase:
      "Turn this on when assignment should skip people who are off, or the team needs one view of leave and working hours.",
  },
  sharedMailboxes: {
    explanation:
      "A shared inbox that opens a ticket for each new email thread and keeps replies on that ticket.",
    useCase:
      "Turn this on when customers write to a shared address, such as support@, and those emails should become tickets on their own.",
  },
  board: {
    explanation: "Tickets laid out in columns by status, so the team can move work from open to done.",
    useCase:
      "Turn this on when people work the queue visually, moving tickets across stages instead of scanning a list.",
  },
  activity: {
    explanation: "A log of what changed in the department: status moves, assignments, and edits.",
    useCase: "Turn this on when you need to see what happened recently, or trace who changed a ticket.",
  },
  tagsLabels: {
    explanation: "Tags and labels you can put on tickets so they can be grouped and filtered.",
    useCase:
      "Turn this on when tickets need categories that cut across status, such as product area, topic, or customer type.",
  },
  workflows: {
    explanation:
      "The status columns for each sub-department's board, including which statuses count as done.",
    useCase:
      "Turn this on when a team needs its own stages — for example Open, Doing, Waiting, Done — instead of one default flow.",
  },
  ticketTemplates: {
    explanation: "Reusable tickets with the title, description, and fields already filled in.",
    useCase:
      "Turn this on when the same kinds of requests come up often and agents should start from a ready-made ticket.",
  },
  assignmentMethods: {
    explanation:
      "How new tickets are routed to agents: round-robin, by workload, or by rules you set. If nobody is eligible, the ticket stays unassigned and department admins are notified.",
    useCase:
      "Turn this on when new tickets should land on someone without a manager assigning each one by hand.",
  },
  apiKeys: {
    explanation:
      "Read-only keys for this department's projects and tickets. A key is shown once, can be revoked, and cannot see other departments.",
    useCase:
      "Turn this on when a dashboard, an automation, or Claude needs to read this department's tickets without someone signing in.",
  },
  slaPolicies: {
    explanation:
      "First-response and resolution time targets for this department, with a live timer on each ticket.",
    useCase:
      "Turn this on when the team has promised reply or resolution times and needs to see when a ticket is nearing or past that target.",
  },
  supportForm: {
    explanation:
      "Public forms people use to submit a request. A confirmed submission becomes a ticket in this department.",
    useCase:
      "Turn this on when people outside the team should be able to raise a request from a link you share, without an account.",
  },
};

/** Short explanation seeded onto each built-in feature template. */
export const MARKETPLACE_FEATURE_DESCRIPTIONS: Record<MarketplaceFeatureKey, string> = {
  timeline: MARKETPLACE_FEATURE_COPY.timeline.explanation,
  reports: MARKETPLACE_FEATURE_COPY.reports.explanation,
  subDepartmentReports: MARKETPLACE_FEATURE_COPY.subDepartmentReports.explanation,
  calendar: MARKETPLACE_FEATURE_COPY.calendar.explanation,
  sharedMailboxes: MARKETPLACE_FEATURE_COPY.sharedMailboxes.explanation,
  board: MARKETPLACE_FEATURE_COPY.board.explanation,
  activity: MARKETPLACE_FEATURE_COPY.activity.explanation,
  tagsLabels: MARKETPLACE_FEATURE_COPY.tagsLabels.explanation,
  workflows: MARKETPLACE_FEATURE_COPY.workflows.explanation,
  ticketTemplates: MARKETPLACE_FEATURE_COPY.ticketTemplates.explanation,
  assignmentMethods: MARKETPLACE_FEATURE_COPY.assignmentMethods.explanation,
  apiKeys: MARKETPLACE_FEATURE_COPY.apiKeys.explanation,
  slaPolicies: MARKETPLACE_FEATURE_COPY.slaPolicies.explanation,
  supportForm: MARKETPLACE_FEATURE_COPY.supportForm.explanation,
};

/** Previous one-line seeds. Still treated as built-in copy, not a custom description. */
const LEGACY_MARKETPLACE_FEATURE_DESCRIPTIONS: Record<MarketplaceFeatureKey, string> = {
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

const BUILTIN_FEATURE_DESCRIPTIONS = new Set<string>(
  MARKETPLACE_FEATURE_KEYS.flatMap((key) => [
    MARKETPLACE_FEATURE_COPY[key].explanation,
    LEGACY_MARKETPLACE_FEATURE_DESCRIPTIONS[key],
  ]),
);

export type FeatureTemplateNarrative = {
  /** An author-written description. Built-in one-liners and explanations are left out. */
  customDescription: string | null;
  useCases: { key: string; label: string; text: string }[];
  included: { key: string; label: string; explanation: string | null }[];
};

/** Use case and feature explanations for a marketplace template dialog. */
export function featureTemplateNarrative(template: {
  description: string | null;
  features: { key: string; label: string }[];
}): FeatureTemplateNarrative {
  const description = template.description?.trim() || null;
  const useCases: FeatureTemplateNarrative["useCases"] = [];
  const included: FeatureTemplateNarrative["included"] = [];
  for (const feature of template.features) {
    const copy = isMarketplaceFeatureKey(feature.key) ? MARKETPLACE_FEATURE_COPY[feature.key] : null;
    if (copy) useCases.push({ key: feature.key, label: feature.label, text: copy.useCase });
    included.push({ key: feature.key, label: feature.label, explanation: copy?.explanation ?? null });
  }
  return {
    customDescription: description && !BUILTIN_FEATURE_DESCRIPTIONS.has(description) ? description : null,
    useCases,
    included,
  };
}

/** Card blurb: a custom description, otherwise the use case. */
export function featureTemplateCardText(narrative: FeatureTemplateNarrative): string | null {
  if (narrative.customDescription) return narrative.customDescription;
  if (narrative.useCases.length > 0) return narrative.useCases.map((item) => item.text).join(" ");
  const explanations = narrative.included.map((item) => item.explanation).filter((text): text is string => !!text);
  return explanations.length > 0 ? explanations.join(" ") : null;
}

/**
 * True when a built-in feature template still has the old one-line description
 * (or none) and should pick up the current explanation. Custom text is left alone.
 */
export function isStaleBuiltinFeatureDescription(
  slug: string,
  current: string | null,
  next: string,
): boolean {
  if (!isMarketplaceFeatureKey(slug)) return false;
  if ((current?.trim() ?? "") === next) return false;
  const trimmed = current?.trim() ?? "";
  if (!trimmed) return true;
  return trimmed === LEGACY_MARKETPLACE_FEATURE_DESCRIPTIONS[slug];
}

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

/**
 * The feature key that gates `pathname`, or null when the route is un-gated.
 * Accepts the public URL (`/acme/support/board`) and the internal path (`/board`).
 */
export function featureKeyForPath(pathname: string): TemplateFeatureKey | null {
  const path = toInternalAppPath(pathname);
  for (const [prefix, key] of FEATURE_PATH_ENTRIES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return key;
  }
  return null;
}
