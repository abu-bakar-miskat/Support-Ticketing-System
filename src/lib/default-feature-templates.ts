import { emptyFeatureSetup, type SavedFeature } from "@/lib/feature-setup";

/**
 * Starter templates. Each one is a saved customization of a single feature.
 * They are created once; a later edit or delete is left alone.
 */
export const DEFAULT_FEATURE_TEMPLATES: SavedFeature[] = [
  template({
    id: "ft-board-software-delivery",
    name: "Software delivery",
    key: "board",
    explanation: "A delivery board with backlog, review, and done columns.",
    useCase: "Use this when a team ships software and moves work from the backlog through review.",
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
  }),
  template({
    id: "ft-board-campaign-board",
    name: "Campaign board",
    key: "board",
    explanation: "A campaign board from the first idea through publish.",
    useCase: "Use this when marketing work moves from an idea to something that is live.",
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
  }),
  template({
    id: "ft-board-design-review",
    name: "Design review",
    key: "board",
    explanation: "A design board from the brief through approval.",
    useCase: "Use this when design work needs a brief, a review, and a clear approved state.",
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
  }),
  template({
    id: "ft-board-hiring-pipeline",
    name: "Hiring pipeline",
    key: "board",
    explanation: "A hiring board from application through offer.",
    useCase: "Use this when a people team tracks candidates from first application to a decision.",
    statuses: columns([
      { label: "Applied", color: "#94a3b8" },
      { label: "Screening", color: "#64748b" },
      { label: "Interview", color: "#0a76b9" },
      { label: "Offer", color: "#f59e0b" },
      { label: "Hired", color: "#16a34a", isComplete: true },
    ]),
    lists: [
      { name: "In process", statuses: ["Screening", "Interview"] },
      { name: "Offers", statuses: ["Offer"] },
      { name: "Hired", statuses: ["Hired"] },
    ],
  }),
  template({
    id: "ft-tagsLabels-priority-tags",
    name: "Priority tags",
    key: "tagsLabels",
    explanation: "Labels for how urgent a ticket is and what kind of work it is.",
    useCase: "Use this when the queue needs a shared set of tags for urgency and request type.",
    tags: [
      { name: "Urgent", color: "#dc2626" },
      { name: "Bug", color: "#f59e0b" },
      { name: "Feature", color: "#0a76b9" },
      { name: "Question", color: "#64748b" },
    ],
  }),
  template({
    id: "ft-slaPolicies-standard-support",
    name: "Standard support",
    key: "slaPolicies",
    explanation: "Reply and resolution targets for standard and urgent requests.",
    useCase: "Use this when support needs a clock on first reply and on resolution.",
    sla: [
      { name: "Standard", firstResponseMins: 60, resolutionMins: 480 },
      { name: "Urgent", firstResponseMins: 15, resolutionMins: 120 },
    ],
  }),
];

function template(
  partial: Pick<SavedFeature, "id" | "name" | "key" | "explanation" | "useCase"> & Partial<SavedFeature>,
): SavedFeature {
  const base = emptyFeatureSetup();
  return {
    statuses: [],
    lists: [],
    tags: base.tags,
    ticketTemplates: base.ticketTemplates,
    sla: base.sla,
    assignmentMethod: base.assignmentMethod,
    supportForm: base.supportForm,
    calendar: base.calendar,
    reportsPeriodDays: base.reportsPeriodDays,
    ...partial,
  };
}

function columns(
  rows: { label: string; color: string; isComplete?: boolean }[],
): SavedFeature["statuses"] {
  return rows.map((row, order) => ({
    label: row.label,
    color: row.color,
    order,
    isComplete: row.isComplete ?? false,
  }));
}
