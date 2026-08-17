export const FONT_SIZE_STORAGE_KEY = "pen-font-size";

export const FONT_SIZES = ["default", "large"] as const;
export type FontSize = (typeof FONT_SIZES)[number];

export const FONT_SIZE_STEPS = FONT_SIZES;

export const FONT_SIZE_OPTIONS: {
  id: FontSize;
  label: string;
  description: string;
  previewClass: string;
}[] = [
  {
    id: "default",
    label: "Default",
    description: "Standard",
    previewClass: "text-[13px]",
  },
  {
    id: "large",
    label: "Large",
    description: "Easier to read",
    previewClass: "text-[15px]",
  },
];

export function stepFontSize(current: FontSize, direction: "in" | "out"): FontSize {
  const idx = FONT_SIZE_STEPS.indexOf(current);
  const safeIdx = idx < 0 ? FONT_SIZE_STEPS.indexOf("default") : idx;
  if (direction === "in") {
    return FONT_SIZE_STEPS[Math.min(safeIdx + 1, FONT_SIZE_STEPS.length - 1)];
  }
  return FONT_SIZE_STEPS[Math.max(safeIdx - 1, 0)];
}

export function canStepFontSize(current: FontSize, direction: "in" | "out"): boolean {
  const idx = FONT_SIZE_STEPS.indexOf(current);
  const safeIdx = idx < 0 ? FONT_SIZE_STEPS.indexOf("default") : idx;
  return direction === "in"
    ? safeIdx < FONT_SIZE_STEPS.length - 1
    : safeIdx > 0;
}

export function isFontSize(value: unknown): value is FontSize {
  return (
    typeof value === "string" &&
    (FONT_SIZES as readonly string[]).includes(value)
  );
}

export function parseFontSize(value: unknown): FontSize {
  return isFontSize(value) ? value : "default";
}

export function applyFontSize(size: FontSize) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (size === "default") {
    delete root.dataset.penFontSize;
  } else {
    root.dataset.penFontSize = size;
  }
}

export function readStoredFontSize(): FontSize | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    return isFontSize(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function persistFontSize(size: FontSize) {
  try {
    if (size === "default") {
      localStorage.removeItem(FONT_SIZE_STORAGE_KEY);
    } else {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, size);
    }
  } catch {
    /* ignore */
  }
  applyFontSize(size);
}
