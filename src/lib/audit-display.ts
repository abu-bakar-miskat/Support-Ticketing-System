import {
  isTemplateFeatureKey,
  TEMPLATE_FEATURE_LABELS,
  templateIdFromGrantToken,
} from "@/lib/template-features";

/** Field keys stored on audit payloads, shown with a readable label. */
const FIELD_LABELS: Record<string, string> = {
  departmentId: "Department",
  departmentName: "Department",
  featureKeys: "Features",
  featureKey: "Feature",
  templateName: "Template",
  reviewNote: "Note",
};

export function auditFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export type AuditLookups = {
  departments: Map<string, string>;
  templates: Map<string, string>;
  /** Feature request id → stored featureKey (a marketplace key or template token). */
  featureRequests: Map<string, string>;
};

export function featureDisplayName(value: string, templates: Map<string, string>): string {
  const templateId = templateIdFromGrantToken(value);
  if (templateId) return templates.get(templateId) ?? "Feature template";
  if (isTemplateFeatureKey(value)) return TEMPLATE_FEATURE_LABELS[value];
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function storedString(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const found = value[key];
  return typeof found === "string" && found.length > 0 ? found : null;
}

/** Ids that need a name lookup before an audit row can be shown. */
export function collectAuditLookupIds(events: {
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
}[]): { departmentIds: string[]; templateIds: string[]; featureRequestIds: string[] } {
  const departmentIds = new Set<string>();
  const templateIds = new Set<string>();
  const featureRequestIds = new Set<string>();

  for (const event of events) {
    if (event.targetType === "Template") templateIds.add(event.targetId);
    if (event.targetType === "FeatureRequest") featureRequestIds.add(event.targetId);
    for (const payload of [event.before, event.after]) {
      if (!isRecord(payload)) continue;
      if (typeof payload.departmentId === "string") departmentIds.add(payload.departmentId);
      const keys = [
        ...(Array.isArray(payload.featureKeys) ? payload.featureKeys : []),
        payload.featureKey,
      ];
      for (const key of keys) {
        const templateId = templateIdFromGrantToken(key);
        if (templateId) templateIds.add(templateId);
      }
    }
  }

  return {
    departmentIds: [...departmentIds],
    templateIds: [...templateIds],
    featureRequestIds: [...featureRequestIds],
  };
}

/** Add template ids referenced by loaded feature requests. */
export function templateIdsFromFeatureRequests(featureKeys: Iterable<string>): string[] {
  const ids = new Set<string>();
  for (const key of featureKeys) {
    const templateId = templateIdFromGrantToken(key);
    if (templateId) ids.add(templateId);
  }
  return [...ids];
}

function namedFeature(key: string, value: unknown, lookups: AuditLookups): string {
  const templateId = templateIdFromGrantToken(key);
  if (templateId && lookups.templates.has(templateId)) return lookups.templates.get(templateId)!;
  if (templateId) return storedString(value, "templateName") ?? "Feature template";
  return featureDisplayName(key, lookups.templates);
}

export function auditTargetTypeLabel(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function auditTargetName(
  event: { targetType: string; targetId: string; before: unknown; after: unknown },
  lookups: AuditLookups,
): string | null {
  if (event.targetType === "Template") {
    return (
      lookups.templates.get(event.targetId) ??
      storedString(event.after, "templateName") ??
      storedString(event.before, "templateName")
    );
  }
  if (event.targetType === "FeatureRequest") {
    const key =
      lookups.featureRequests.get(event.targetId) ??
      storedString(event.after, "featureKey") ??
      storedString(event.before, "featureKey");
    if (!key) return storedString(event.after, "templateName") ?? storedString(event.before, "templateName");
    return namedFeature(key, event.after ?? event.before, lookups);
  }
  return null;
}

/** Replace stored ids in a before/after payload with the names a person would recognize. */
export function presentAuditPayload(value: unknown, lookups: AuditLookups): unknown {
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = { ...value };

  if (typeof out.departmentId === "string") {
    const resolved = lookups.departments.get(out.departmentId);
    out.departmentId =
      (typeof resolved === "string" ? resolved : null) ??
      storedString(value, "departmentName") ??
      out.departmentId;
  } else if (isRecord(out.departmentId) && typeof out.departmentId.name === "string") {
    out.departmentId = out.departmentId.name;
  }
  delete out.departmentName;

  if (Array.isArray(out.featureKeys)) {
    const labels = out.featureKeys
      .filter((key): key is string => typeof key === "string")
      .map((key) => namedFeature(key, value, lookups));
    out.featureKeys = labels.join(", ");
  }
  if (typeof out.featureKey === "string") {
    out.featureKey = namedFeature(out.featureKey, value, lookups);
  }
  delete out.templateName;

  return out;
}
