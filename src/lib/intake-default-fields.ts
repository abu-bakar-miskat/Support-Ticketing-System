/**
 * The Classic Form (displayMode FORM) always renders four default "static"
 * fields that are not stored as IntakeFormField rows. Admins can rename their
 * title + placeholder per department; the fields themselves can't be removed.
 *
 * Overrides are stored on `Department.intakeDefaultFields` as a partial map of
 * key → { label, placeholder }. Anything missing falls back to the defaults
 * below. This module is safe to import on both the server and the client.
 */

export type DefaultFieldKey = "submitterName" | "submitterEmail" | "title" | "issueType";

export type DefaultFieldConfig = { label: string; placeholder: string };

export const DEFAULT_FIELD_KEYS: DefaultFieldKey[] = [
  "submitterName",
  "submitterEmail",
  "title",
  "issueType",
];

/** The built-in labels/placeholders — used whenever a department hasn't overridden a field. */
export const DEFAULT_INTAKE_FIELDS: Record<DefaultFieldKey, DefaultFieldConfig> = {
  submitterName: { label: "Your name", placeholder: "Full name" },
  submitterEmail: { label: "Email address", placeholder: "you@example.com" },
  title: { label: "Title", placeholder: "Brief summary of your request" },
  issueType: { label: "Issue type", placeholder: "Select an issue type…" },
};

const LABEL_MAX = 100;
const PLACEHOLDER_MAX = 200;

export type ResolvedDefaultFields = Record<DefaultFieldKey, DefaultFieldConfig>;

/** Merge a department's stored overrides over the built-in defaults. */
export function resolveIntakeDefaultFields(raw: unknown): ResolvedDefaultFields {
  const stored =
    raw && typeof raw === "object" ? (raw as Record<string, Partial<DefaultFieldConfig>>) : {};
  const out = {} as ResolvedDefaultFields;
  for (const key of DEFAULT_FIELD_KEYS) {
    const o = stored[key] ?? {};
    out[key] = {
      label:
        typeof o.label === "string" && o.label.trim()
          ? o.label.trim()
          : DEFAULT_INTAKE_FIELDS[key].label,
      placeholder:
        typeof o.placeholder === "string"
          ? o.placeholder
          : DEFAULT_INTAKE_FIELDS[key].placeholder,
    };
  }
  return out;
}

/**
 * Normalize an incoming PATCH body into a storable overrides object. Only
 * label/placeholder strings are kept (title + placeholder are the only editable
 * properties); unknown keys and other props are dropped.
 */
export function sanitizeIntakeDefaultFields(raw: unknown): Record<string, DefaultFieldConfig> {
  const input =
    raw && typeof raw === "object" ? (raw as Record<string, Partial<DefaultFieldConfig>>) : {};
  const out: Record<string, DefaultFieldConfig> = {};
  for (const key of DEFAULT_FIELD_KEYS) {
    const o = input[key];
    if (!o || typeof o !== "object") continue;
    out[key] = {
      label:
        typeof o.label === "string" && o.label.trim()
          ? o.label.trim().slice(0, LABEL_MAX)
          : DEFAULT_INTAKE_FIELDS[key].label,
      placeholder:
        typeof o.placeholder === "string"
          ? o.placeholder.slice(0, PLACEHOLDER_MAX)
          : DEFAULT_INTAKE_FIELDS[key].placeholder,
    };
  }
  return out;
}
