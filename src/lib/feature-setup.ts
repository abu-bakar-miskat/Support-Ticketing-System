import type { StatusCategory } from "@/lib/status-category";
import {
  MARKETPLACE_FEATURE_COPY,
  MARKETPLACE_FEATURE_KEYS,
  isMarketplaceFeatureKey,
  type MarketplaceFeatureKey,
} from "@/lib/template-features";

export const TEMPLATE_ASSIGNMENT_METHODS = ["ROUND_ROBIN", "WORKLOAD_BASED", "MANUAL", "RULE_BASED"] as const;

export type TemplateAssignmentMethod = (typeof TEMPLATE_ASSIGNMENT_METHODS)[number];

export const ASSIGNMENT_METHOD_LABELS: Record<TemplateAssignmentMethod, string> = {
  ROUND_ROBIN: "Round robin",
  WORKLOAD_BASED: "By workload",
  MANUAL: "Manual",
  RULE_BASED: "By rules",
};

export type FeatureCopy = {
  explanation: string;
  useCase: string;
};

export type SavedFeature = {
  id: string;
  name: string;
  key: MarketplaceFeatureKey;
  explanation: string;
  useCase: string;
  statuses: { category?: StatusCategory; label: string; color: string; order: number; isComplete: boolean }[];
  lists: { name: string; statuses: string[] }[];
  tags: { name: string; color: string }[];
  ticketTemplates: { name: string; fields: string[] }[];
  sla: { name: string; firstResponseMins: number; resolutionMins: number }[];
  assignmentMethod: TemplateAssignmentMethod;
  supportForm: { name: string; fields: { label: string; required: boolean }[] };
  calendar: { workingDays: number[]; start: string; end: string };
  reportsPeriodDays: number;
};

export type FeatureSetup = {
  copy: Partial<Record<MarketplaceFeatureKey, FeatureCopy>>;
  tags: { name: string; color: string }[];
  ticketTemplates: { name: string; fields: string[] }[];
  sla: { name: string; firstResponseMins: number; resolutionMins: number }[];
  assignmentMethod: TemplateAssignmentMethod;
  supportForm: { name: string; fields: { label: string; required: boolean }[] };
  calendar: { workingDays: number[]; start: string; end: string };
  reportsPeriodDays: number;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function emptyFeatureSetup(): FeatureSetup {
  return {
    copy: {},
    tags: [],
    ticketTemplates: [],
    sla: [],
    assignmentMethod: "ROUND_ROBIN",
    supportForm: { name: "", fields: [] },
    calendar: { workingDays: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
    reportsPeriodDays: 30,
  };
}

export function savedFeatureToSetup(feature: SavedFeature): FeatureSetup {
  return {
    ...emptyFeatureSetup(),
    copy: { [feature.key]: { explanation: feature.explanation, useCase: feature.useCase } },
    tags: feature.tags,
    ticketTemplates: feature.ticketTemplates,
    sla: feature.sla,
    assignmentMethod: feature.assignmentMethod,
    supportForm: feature.supportForm,
    calendar: feature.calendar,
    reportsPeriodDays: feature.reportsPeriodDays,
  };
}

export function featureCopy(setup: FeatureSetup, key: MarketplaceFeatureKey): FeatureCopy {
  const saved = setup.copy[key];
  const builtin = MARKETPLACE_FEATURE_COPY[key];
  return {
    explanation: saved?.explanation?.trim() || builtin.explanation,
    useCase: saved?.useCase?.trim() || builtin.useCase,
  };
}

export function parseFeatureSetup(value: unknown): FeatureSetup {
  const base = emptyFeatureSetup();
  if (!value || typeof value !== "object") return base;
  const row = value as Record<string, unknown>;
  return {
    copy: parseCopy(row.copy),
    tags: parseTags(row.tags),
    ticketTemplates: parseTicketTemplates(row.ticketTemplates),
    sla: parseSla(row.sla),
    assignmentMethod: isAssignmentMethod(row.assignmentMethod) ? row.assignmentMethod : base.assignmentMethod,
    supportForm: parseSupportForm(row.supportForm),
    calendar: parseCalendar(row.calendar) ?? base.calendar,
    reportsPeriodDays: isPeriod(row.reportsPeriodDays) ? row.reportsPeriodDays : base.reportsPeriodDays,
  };
}

/** One line describing how this feature is set up, for the marketplace card. */
export function featureSetupSummary(
  key: MarketplaceFeatureKey,
  setup: FeatureSetup,
  statuses: { label: string }[],
): string | null {
  if (key === "board" || key === "workflows") {
    const labels = statuses.map((status) => status.label).filter(Boolean);
    return labels.length > 0 ? labels.join(" · ") : null;
  }
  if (key === "tagsLabels") {
    const names = setup.tags.map((tag) => tag.name).filter(Boolean);
    return names.length > 0 ? names.join(" · ") : null;
  }
  if (key === "ticketTemplates") {
    const names = setup.ticketTemplates.map((template) => template.name).filter(Boolean);
    return names.length > 0 ? names.join(" · ") : null;
  }
  if (key === "slaPolicies") {
    const lines = setup.sla
      .filter((policy) => policy.name)
      .map((policy) => `${policy.name}: reply ${formatMinutes(policy.firstResponseMins)}, resolve ${formatMinutes(policy.resolutionMins)}`);
    return lines.length > 0 ? lines.join(" · ") : null;
  }
  if (key === "assignmentMethods") return ASSIGNMENT_METHOD_LABELS[setup.assignmentMethod];
  if (key === "supportForm") {
    const fields = setup.supportForm.fields.map((field) => field.label).filter(Boolean);
    if (!setup.supportForm.name && fields.length === 0) return null;
    return [setup.supportForm.name, fields.join(", ")].filter(Boolean).join(" — ");
  }
  if (key === "calendar") {
    const days = [...setup.calendar.workingDays].sort((a, b) => a - b).map((day) => DAY_NAMES[day] ?? "").filter(Boolean);
    return `${days.join(", ")} ${setup.calendar.start}–${setup.calendar.end}`;
  }
  if (key === "reports") return `Last ${setup.reportsPeriodDays} days`;
  return null;
}

export function scopedFeatureRequest(value: string): { featureKey: MarketplaceFeatureKey; templateId: string } | null {
  if (!value.startsWith("feature:")) return null;
  const [, key, templateId] = value.split(":");
  if (!isMarketplaceFeatureKey(key) || !templateId) return null;
  return { featureKey: key, templateId };
}

export function plainFeatureRequestKey(value: string): string {
  return scopedFeatureRequest(value)?.featureKey ?? value;
}

function parseCopy(value: unknown): FeatureSetup["copy"] {
  if (!value || typeof value !== "object") return {};
  const copy: FeatureSetup["copy"] = {};
  for (const key of MARKETPLACE_FEATURE_KEYS) {
    const row = (value as Record<string, unknown>)[key];
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const explanation = typeof item.explanation === "string" ? item.explanation.trim() : "";
    const useCase = typeof item.useCase === "string" ? item.useCase.trim() : "";
    if (!explanation && !useCase) continue;
    copy[key] = { explanation, useCase };
  }
  return copy;
}

function parseTags(value: unknown): FeatureSetup["tags"] {
  if (!Array.isArray(value)) return [];
  const tags: FeatureSetup["tags"] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const tag = row as Record<string, unknown>;
    const name = typeof tag.name === "string" ? tag.name.trim() : "";
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const color = typeof tag.color === "string" && /^#[0-9a-fA-F]{6}$/.test(tag.color) ? tag.color : "#64748b";
    tags.push({ name, color });
  }
  return tags;
}

function parseTicketTemplates(value: unknown): FeatureSetup["ticketTemplates"] {
  if (!Array.isArray(value)) return [];
  const templates: FeatureSetup["ticketTemplates"] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const template = row as Record<string, unknown>;
    const name = typeof template.name === "string" ? template.name.trim() : "";
    if (!name) continue;
    const fields = Array.isArray(template.fields)
      ? template.fields.filter((field): field is string => typeof field === "string" && field.trim().length > 0).map((field) => field.trim())
      : [];
    templates.push({ name, fields });
  }
  return templates;
}

function parseSla(value: unknown): FeatureSetup["sla"] {
  if (!Array.isArray(value)) return [];
  const policies: FeatureSetup["sla"] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const policy = row as Record<string, unknown>;
    const name = typeof policy.name === "string" ? policy.name.trim() : "";
    const firstResponseMins = positiveInt(policy.firstResponseMins);
    const resolutionMins = positiveInt(policy.resolutionMins);
    if (!name || !firstResponseMins || !resolutionMins) continue;
    policies.push({ name, firstResponseMins, resolutionMins });
  }
  return policies;
}

function parseSupportForm(value: unknown): FeatureSetup["supportForm"] {
  if (!value || typeof value !== "object") return { name: "", fields: [] };
  const row = value as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const fields = Array.isArray(row.fields)
    ? row.fields.flatMap((field) => {
        if (!field || typeof field !== "object") return [];
        const item = field as Record<string, unknown>;
        const label = typeof item.label === "string" ? item.label.trim() : "";
        if (!label) return [];
        return [{ label, required: item.required === true }];
      })
    : [];
  return { name, fields };
}

function parseCalendar(value: unknown): FeatureSetup["calendar"] | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const workingDays = Array.isArray(row.workingDays)
    ? [...new Set(row.workingDays.filter((day): day is number => typeof day === "number" && day >= 0 && day <= 6))]
    : [];
  const start = typeof row.start === "string" && /^\d{2}:\d{2}$/.test(row.start) ? row.start : "09:00";
  const end = typeof row.end === "string" && /^\d{2}:\d{2}$/.test(row.end) ? row.end : "17:00";
  if (workingDays.length === 0) return null;
  return { workingDays, start, end };
}

function isAssignmentMethod(value: unknown): value is TemplateAssignmentMethod {
  return typeof value === "string" && (TEMPLATE_ASSIGNMENT_METHODS as readonly string[]).includes(value);
}

function isPeriod(value: unknown): value is number {
  return value === 7 || value === 30 || value === 90;
}

function positiveInt(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(number) || number < 1 || number > 100000) return null;
  return number;
}

function formatMinutes(mins: number): string {
  if (mins % 1440 === 0) return `${mins / 1440}d`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${mins}m`;
}
