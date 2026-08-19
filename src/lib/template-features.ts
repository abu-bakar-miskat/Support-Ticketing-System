/**
 * Named settings-nav sections a Super Admin can bundle into a Template
 * (Template Catalogue). A plain const array (not a Prisma enum) so adding a
 * new gateable feature never needs a migration — TemplateFeature.key is a
 * free-text column, same pattern as PLATFORM_FEATURE_KEYS in feature-keys.ts.
 */
export const TEMPLATE_FEATURE_KEYS = [
  /** Public intake/support forms — /settings/intake-forms. */
  "supportForm",
  /** Department/tenant email settings — /settings/email. */
  "emailSettings",
  /** API key management — /settings/api-keys. */
  "apiKeys",
  /** Notion data import — /settings/import. */
  "importForm",
] as const;

export type TemplateFeatureKey = (typeof TEMPLATE_FEATURE_KEYS)[number];

export function isTemplateFeatureKey(value: unknown): value is TemplateFeatureKey {
  return typeof value === "string" && (TEMPLATE_FEATURE_KEYS as readonly string[]).includes(value);
}
