export const THEME_STORAGE_KEY = "pen-theme";
export const PREV_LIGHT_KEY = "pen-prev-light";

export type LightVariant =
  | "light"
  | "forest"
  | "ocean"
  | "ice-age"
  | "desert"
  | "blossom"
  | "tangerine";
export type DarkVariant =
  | "dark"
  | "aurora"
  | "midnight"
  | "amoled"
  | "dracula"
  | "monochrome"
  | "cosmic-night";
export type Theme = LightVariant | DarkVariant | "system";

export const LIGHT_VARIANTS: LightVariant[] = [
  "light",
  "forest",
  "ocean",
  "ice-age",
  "desert",
  "blossom",
  "tangerine",
];

export const DARK_VARIANTS: DarkVariant[] = [
  "dark",
  "aurora",
  "midnight",
  "amoled",
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

export const LIGHT_THEME_SWATCHES: {
  id: LightVariant;
  label: string;
  gradient: string;
}[] = [
  {
    id: "light",
    label: "Light",
    gradient: "linear-gradient(135deg, #c8dff0 0%, #f5f2ec 60%)",
  },
  {
    id: "forest",
    label: "Forest",
    gradient: "linear-gradient(135deg, #b8dca8 0%, #eff3eb 60%)",
  },
  {
    id: "ocean",
    label: "Ocean",
    gradient: "linear-gradient(135deg, #8ccee4 0%, #eaf4f7 60%)",
  },
  {
    id: "ice-age",
    label: "Ice Age",
    gradient: "linear-gradient(135deg, #a8bce8 0%, #edf0f7 60%)",
  },
  {
    id: "desert",
    label: "Desert",
    gradient: "linear-gradient(135deg, #e8c878 0%, #f7f0e6 60%)",
  },
  {
    id: "blossom",
    label: "Blossom",
    gradient: "linear-gradient(135deg, #e890ae 0%, #f8e8ee 60%)",
  },
  {
    id: "tangerine",
    label: "Tangerine",
    gradient: "linear-gradient(135deg, #e06835 0%, #f5a060 45%, #e8eaf0 80%)",
  },
];

export const DARK_THEME_SWATCHES: {
  id: DarkVariant;
  label: string;
  gradient: string;
}[] = [
  {
    id: "dark",
    label: "Dark",
    gradient: "linear-gradient(135deg, #2db49b 0%, #1a2030 70%)",
  },
  {
    id: "aurora",
    label: "Aurora",
    gradient: "linear-gradient(135deg, #3ee6b5 0%, #7a5aff 45%, #0a0f1e 85%)",
  },
  {
    id: "midnight",
    label: "Midnight",
    gradient: "linear-gradient(135deg, #3a7aff 0%, #0d1520 70%)",
  },
  {
    id: "amoled",
    label: "AMOLED",
    gradient: "linear-gradient(135deg, #00d4ff 0%, #000000 70%)",
  },
  {
    id: "dracula",
    label: "Dracula",
    gradient: "linear-gradient(135deg, #bd8aff 0%, #1a1628 70%)",
  },
  {
    id: "monochrome",
    label: "Monochrome",
    gradient: "linear-gradient(135deg, #d0d0d0 0%, #111111 70%)",
  },
  {
    id: "cosmic-night",
    label: "Cosmic Night",
    gradient: "linear-gradient(135deg, #8875f0 0%, #c090ff 40%, #181828 80%)",
  },
];

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return isDarkVariant(theme) ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  const isSystemDark = theme === "system" && resolveTheme("system") === "dark";
  const isDark = isDarkVariant(theme) || isSystemDark;
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  if (isDark) {
    // For dark variants, set the variant name so CSS overrides apply.
    // For system-resolved dark and default "dark", set "dark".
    root.dataset.theme = isDarkVariant(theme) ? theme : "dark";
  } else if (isLightVariant(theme) && theme !== "light") {
    root.dataset.theme = theme;
  } else {
    delete root.dataset.theme;
  }
}
