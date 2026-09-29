export const THEME_STORAGE_KEY = "sts-theme";

export type LightVariant = "clean";
export type DarkVariant = "clean-dark";
export type Theme = LightVariant | DarkVariant;

/** Sole light theme, and the app-wide default. */
export const DEFAULT_LIGHT: LightVariant = "clean";
/** Sole dark theme. */
export const DEFAULT_DARK: DarkVariant = "clean-dark";
export const DEFAULT_THEME: Theme = DEFAULT_LIGHT;

export const LIGHT_VARIANTS: LightVariant[] = ["clean"];
export const DARK_VARIANTS: DarkVariant[] = ["clean-dark"];

export function isLightVariant(t: string): t is LightVariant {
  return LIGHT_VARIANTS.includes(t as LightVariant);
}

export function isDarkVariant(t: string): t is DarkVariant {
  return DARK_VARIANTS.includes(t as DarkVariant);
}

/** Normalize any stored (possibly legacy) value to one of the two themes.
 * Default is light: only an explicitly-stored dark variant resolves to dark;
 * a fresh visitor (nothing stored) gets the light theme. */
export function normalizeTheme(stored: string | null | undefined): Theme {
  if (stored != null && isDarkVariant(stored)) {
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
