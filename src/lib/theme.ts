export const THEME_STORAGE_KEY = "pen-theme";

export type LightVariant = "tangerine";
export type DarkVariant = "amoled";
export type Theme = LightVariant | DarkVariant;

/** Sole light theme, and the app-wide default. */
export const DEFAULT_LIGHT: LightVariant = "tangerine";
/** Sole dark theme. */
export const DEFAULT_DARK: DarkVariant = "amoled";
export const DEFAULT_THEME: Theme = DEFAULT_LIGHT;

export const LIGHT_VARIANTS: LightVariant[] = ["tangerine"];
export const DARK_VARIANTS: DarkVariant[] = ["amoled"];

// Values written by the previous multi-theme system that no longer exist. A
// stored dark variant maps to AMOLED; anything else falls back to Tangerine.
export const LEGACY_DARK_VALUES = [
  "dark",
  "aurora",
  "midnight",
  "dracula",
  "monochrome",
  "cosmic-night",
];

export function isLightVariant(t: string): t is LightVariant {
  return LIGHT_VARIANTS.includes(t as LightVariant);
}

export function isDarkVariant(t: string): t is DarkVariant {
  return DARK_VARIANTS.includes(t as DarkVariant);
}

/** Normalize any stored (possibly legacy) value to one of the two themes. */
export function normalizeTheme(stored: string | null | undefined): Theme {
  if (stored === DEFAULT_DARK || (stored != null && LEGACY_DARK_VALUES.includes(stored))) {
    return DEFAULT_DARK;
  }
  return DEFAULT_LIGHT;
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  return isDarkVariant(theme) ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", isDarkVariant(theme));
  root.dataset.theme = theme;
}

/** Force the neutral base light palette (public support pages) — no variant tint. */
export function applyNeutralLight() {
  const root = document.documentElement;
  root.classList.remove("dark");
  delete root.dataset.theme;
}
