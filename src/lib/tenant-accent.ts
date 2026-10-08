/**
 * Per-tenant accent color → theme tokens.
 *
 * A tenant picks one brand hex; this derives everything the theme needs from
 * it, auto-adjusting for readability instead of rejecting colors:
 *  - light mode: darkened (toward black) until it reaches 3:1 against white;
 *  - dark mode: lightened (toward white) until it reaches 4.5:1 against the
 *    dark card surface;
 *  - on-accent text: white unless white falls below 3:1, then near-black.
 *
 * Pure and client-safe (used by the shell <style> and the branding pickers).
 */

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Product default accent (matches globals.css). */
export const DEFAULT_ACCENT = "#f84201";

const WHITE = "#ffffff";
const INK = "#111827";
/** Dark-theme card surface (--sts-card-solid in html.dark). */
const DARK_SURFACE = "#0e0d0c";

const LIGHT_MIN_CONTRAST = 3;
const DARK_MIN_CONTRAST = 4.5;
/** Ticket ids / links in dark mode read as small text — aim higher. */
const DARK_ID_CONTRAST = 7;
const FG_MIN_CONTRAST = 3;

type Rgb = [number, number, number];

/** Normalize `#abc` / `#AABBCC` to lowercase `#aabbcc`; null when invalid. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!HEX_RE.test(v)) return null;
  const h = v.slice(1).toLowerCase();
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
}

function toRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

function mix(a: string, b: string, weightOfB: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * weightOfB) as Rgb);
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mix `color` toward `target` in small steps until it reaches `min` contrast with `against`. */
function adjustUntil(color: string, target: string, against: string, min: number): string {
  for (let w = 0; w <= 1; w += 0.02) {
    const c = mix(color, target, w);
    if (contrastRatio(c, against) >= min) return c;
  }
  return target;
}

function onColor(fill: string): string {
  return contrastRatio(fill, WHITE) >= FG_MIN_CONTRAST ? WHITE : INK;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type AccentPalette = {
  /** The tenant's chosen color, normalized. */
  base: string;
  light: { accent: string; fg: string; tint: string; id: string };
  dark: { accent: string; fg: string; tint: string; id: string };
  /** True when the light/dark accent had to be shifted from `base` for contrast. */
  adjustedLight: boolean;
  adjustedDark: boolean;
};

/** Derive light + dark theme accents from a brand hex; null when invalid. */
export function deriveAccentPalette(value: unknown): AccentPalette | null {
  const base = normalizeHex(value);
  if (!base) return null;

  const lightAccent = adjustUntil(base, "#000000", WHITE, LIGHT_MIN_CONTRAST);
  const darkAccent = adjustUntil(base, WHITE, DARK_SURFACE, DARK_MIN_CONTRAST);

  return {
    base,
    light: {
      accent: lightAccent,
      fg: onColor(lightAccent),
      tint: mix(WHITE, lightAccent, 0.09),
      id: lightAccent,
    },
    dark: {
      accent: darkAccent,
      fg: onColor(darkAccent),
      tint: rgba(darkAccent, 0.16),
      id: adjustUntil(darkAccent, WHITE, DARK_SURFACE, DARK_ID_CONTRAST),
    },
    adjustedLight: lightAccent !== base,
    adjustedDark: darkAccent !== base,
  };
}

function tokenBlock(t: AccentPalette["light"]): string {
  return [
    `--sts-accent:${t.accent}`,
    `--sts-button:${t.accent}`,
    `--sts-button-fg:${t.fg}`,
    `--sts-blue:${t.accent}`,
    `--sts-blue-fg:${t.fg}`,
    `--sts-blue-tint:${t.tint}`,
    `--sts-id:${t.id}`,
    `--primary:${t.accent}`,
    `--primary-foreground:${t.fg}`,
    `--ring:${t.accent}`,
    `--sidebar-primary:${t.accent}`,
    `--sidebar-primary-foreground:${t.fg}`,
    `--sidebar-ring:${t.accent}`,
    `--chart-1:${t.accent}`,
  ].join(";");
}

/**
 * CSS overriding the theme's accent tokens for a tenant, or null for the
 * product default. Unlayered, so it wins over the `@layer base` theme values.
 * Only emits values built from a validated hex — safe to inline in <style>.
 */
export function tenantAccentCss(value: unknown): string | null {
  const p = deriveAccentPalette(value);
  if (!p || p.base === DEFAULT_ACCENT) return null;
  return `:root{${tokenBlock(p.light)}}html.dark,html[data-theme="dark"]{${tokenBlock(p.dark)}}`;
}
