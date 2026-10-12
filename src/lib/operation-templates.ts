import { inferStatusCategory, type StatusCategory } from "@/lib/status-category";
import { DEFAULT_SUB_DEPARTMENT_STATUSES } from "@/lib/board-columns";
import type { FeatureSetup } from "@/lib/feature-setup";
import type { TemplateFeatureKey } from "@/lib/template-features";

/**
 * Pre-configured operation templates. Enabling one turns on a set of features
 * and gives the department its own board: custom statuses, plus filtered lists
 * that show only the columns that matter for that kind of work.
 */
export type OperationStatus = {
  category?: StatusCategory;
  label: string;
  color: string;
  order: number;
  isComplete: boolean;
};

export type OperationList = {
  name: string;
  /** Board columns this list keeps. The others are hidden. */
  statuses: string[];
};

export type OperationTemplate = {
  slug: string;
  name: string;
  useCase: string;
  /** Super-admin grouping. Built-in boards sit in Operations until one is saved. */
  group?: string;
  featureKeys: TemplateFeatureKey[];
  statuses: OperationStatus[];
  lists: OperationList[];
  /** Super-admin options for each feature. Built-ins start empty. */
  setup?: FeatureSetup;
};

function columns(
  rows: { label: string; color: string; isComplete?: boolean }[],
): OperationStatus[] {
  return rows.map((row, order) => ({
    label: row.label,
    color: row.color,
    order,
    category: inferStatusCategory({ ...row, order }),
    isComplete: inferStatusCategory({ ...row, order }) === "COMPLETE",
  }));
}

export const OPERATION_TEMPLATES: OperationTemplate[] = [
  {
    slug: "op-software-development",
    name: "Software Development",
    useCase: "A delivery board for building software, from backlog through review.",
    featureKeys: ["board", "timeline", "workflows", "tagsLabels", "ticketTemplates"],
    statuses: columns([
      { label: "Backlog", color: "#94a3b8" },
      { label: "To Do", color: "#64748b" },
      { label: "In Progress", color: "#0a76b9" },
      { label: "In Review", color: "#7c3aed" },
      { label: "Done", color: "#16a34a", isComplete: true },
    ]),
    lists: [
      { name: "In progress", statuses: ["In Progress"] },
      { name: "In review", statuses: ["In Review"] },
      { name: "Backlog", statuses: ["Backlog", "To Do"] },
    ],
  },
  {
    slug: "op-marketing",
    name: "Marketing",
    useCase: "A campaign board from idea to published.",
    featureKeys: ["board", "calendar", "tagsLabels", "reports"],
    statuses: columns([
      { label: "Ideas", color: "#94a3b8" },
      { label: "Planning", color: "#64748b" },
      { label: "In Progress", color: "#0a76b9" },
      { label: "In Review", color: "#7c3aed" },
      { label: "Published", color: "#16a34a", isComplete: true },
    ]),
    lists: [
      { name: "This week", statuses: ["In Progress"] },
      { name: "Awaiting review", statuses: ["In Review"] },
      { name: "Ideas", statuses: ["Ideas", "Planning"] },
    ],
  },
  {
    slug: "op-design",
    name: "Design",
    useCase: "A design board from the brief through approval.",
    featureKeys: ["board", "calendar", "tagsLabels"],
    statuses: columns([
      { label: "Brief", color: "#94a3b8" },
      { label: "In Design", color: "#0a76b9" },
      { label: "Review", color: "#7c3aed" },
      { label: "Revisions", color: "#f59e0b" },
      { label: "Approved", color: "#16a34a", isComplete: true },
    ]),
    lists: [
      { name: "In design", statuses: ["In Design"] },
      { name: "Needs review", statuses: ["Review", "Revisions"] },
      { name: "Approved", statuses: ["Approved"] },
    ],
  },
  {
    slug: "op-sales",
    name: "Sales",
    useCase: "A pipeline board from first lead to won or lost.",
    featureKeys: ["board", "calendar", "reports", "tagsLabels"],
    statuses: columns([
      { label: "Lead", color: "#94a3b8" },
      { label: "Contacted", color: "#64748b" },
      { label: "Proposal", color: "#0a76b9" },
      { label: "Negotiation", color: "#f59e0b" },
      { label: "Won", color: "#16a34a", isComplete: true },
      { label: "Lost", color: "#dc2626", isComplete: true },
    ]),
    lists: [
      { name: "Open pipeline", statuses: ["Lead", "Contacted", "Proposal", "Negotiation"] },
      { name: "Proposals", statuses: ["Proposal", "Negotiation"] },
      { name: "Won", statuses: ["Won"] },
    ],
  },
  {
    slug: "op-operations",
    name: "Operations",
    useCase: "An operations board for incoming work, blockers, and what's done.",
    featureKeys: ["board", "calendar", "activity", "workflows", "assignmentMethods"],
    statuses: columns([
      { label: "Inbox", color: "#94a3b8" },
      { label: "In Progress", color: "#0a76b9" },
      { label: "Waiting", color: "#f59e0b" },
      { label: "Blocked", color: "#dc2626" },
      { label: "Done", color: "#16a34a", isComplete: true },
    ]),
    lists: [
      { name: "Inbox", statuses: ["Inbox"] },
      { name: "Blocked", statuses: ["Blocked"] },
      { name: "Waiting", statuses: ["Waiting"] },
    ],
  },
  {
    slug: "op-service-management",
    name: "Service Management",
    useCase: "A support board for new requests, escalations, and resolutions.",
    featureKeys: ["board", "supportForm", "slaPolicies", "sharedMailboxes", "assignmentMethods", "tagsLabels"],
    statuses: columns([
      { label: "New", color: "#94a3b8" },
      { label: "Open", color: "#0a76b9" },
      { label: "Pending", color: "#f59e0b" },
      { label: "Escalated", color: "#dc2626" },
      { label: "Resolved", color: "#16a34a", isComplete: true },
    ]),
    lists: [
      { name: "New", statuses: ["New"] },
      { name: "Escalated", statuses: ["Escalated"] },
      { name: "Pending", statuses: ["Pending"] },
    ],
  },
  {
    slug: "op-human-resources",
    name: "Human Resources",
    useCase: "A people board from the request through offer.",
    featureKeys: ["board", "calendar", "ticketTemplates", "tagsLabels"],
    statuses: columns([
      { label: "Requested", color: "#94a3b8" },
      { label: "Screening", color: "#64748b" },
      { label: "Interview", color: "#0a76b9" },
      { label: "Offer", color: "#7c3aed" },
      { label: "Closed", color: "#16a34a", isComplete: true },
    ]),
    lists: [
      { name: "Screening", statuses: ["Screening"] },
      { name: "Interviews", statuses: ["Interview"] },
      { name: "Offers", statuses: ["Offer"] },
    ],
  },
  {
    slug: "op-legal",
    name: "Legal",
    useCase: "A matter board from intake through approval.",
    featureKeys: ["board", "tagsLabels", "slaPolicies", "activity"],
    statuses: columns([
      { label: "Intake", color: "#94a3b8" },
      { label: "Review", color: "#0a76b9" },
      { label: "Negotiation", color: "#f59e0b" },
      { label: "Approval", color: "#7c3aed" },
      { label: "Closed", color: "#16a34a", isComplete: true },
    ]),
    lists: [
      { name: "In review", statuses: ["Review", "Negotiation"] },
      { name: "Awaiting approval", statuses: ["Approval"] },
      { name: "Closed", statuses: ["Closed"] },
    ],
  },
  {
    slug: "op-it-operations",
    name: "IT Operations",
    useCase: "An IT board from the report through resolution.",
    featureKeys: ["board", "slaPolicies", "activity", "workflows", "tagsLabels"],
    statuses: columns([
      { label: "Reported", color: "#94a3b8" },
      { label: "Triage", color: "#64748b" },
      { label: "In Progress", color: "#0a76b9" },
      { label: "Waiting", color: "#f59e0b" },
      { label: "Resolved", color: "#16a34a", isComplete: true },
    ]),
    lists: [
      { name: "Triage", statuses: ["Reported", "Triage"] },
      { name: "In progress", statuses: ["In Progress"] },
      { name: "Waiting", statuses: ["Waiting"] },
    ],
  },
  {
    slug: "op-finance",
    name: "Finance",
    useCase: "A finance board from submission through payment.",
    featureKeys: ["board", "reports", "calendar", "tagsLabels", "slaPolicies"],
    statuses: columns([
      { label: "Submitted", color: "#94a3b8" },
      { label: "In Review", color: "#0a76b9" },
      { label: "Approved", color: "#7c3aed" },
      { label: "Processing", color: "#f59e0b" },
      { label: "Paid", color: "#16a34a", isComplete: true },
    ]),
    lists: [
      { name: "Awaiting review", statuses: ["Submitted", "In Review"] },
      { name: "Approved", statuses: ["Approved", "Processing"] },
      { name: "Paid", statuses: ["Paid"] },
    ],
  },
];

const BY_SLUG = new Map(OPERATION_TEMPLATES.map((template) => [template.slug, template]));

function statusKey(labels: readonly string[]): string {
  return [...labels].sort().join("\n");
}

const REPLACEABLE_STATUS_SETS = new Set<string>([
  statusKey(DEFAULT_SUB_DEPARTMENT_STATUSES.map((status) => status.label)),
  ...OPERATION_TEMPLATES.map((template) => statusKey(template.statuses.map((status) => status.label))),
]);

export function operationTemplateBySlug(slug: string | null | undefined): OperationTemplate | null {
  if (!slug) return null;
  return BY_SLUG.get(slug) ?? null;
}

/** True when the board is still a default or another operation preset, so it can be replaced. */
export function isReplaceableStatusSet(labels: readonly string[]): boolean {
  return REPLACEABLE_STATUS_SETS.has(statusKey(labels));
}

/**
 * Map each current column onto the new board by position. Extra current columns
 * land on the last new status.
 */
export function remapStatusLabels(current: readonly string[], next: readonly string[]): Map<string, string> {
  const map = new Map<string, string>();
  if (next.length === 0) return map;
  current.forEach((label, index) => {
    map.set(label, next[Math.min(index, next.length - 1)]!);
  });
  return map;
}
