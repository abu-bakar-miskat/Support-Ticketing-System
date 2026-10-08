import type { CSSProperties } from "react";

/**
 * Tint classes for a grouped-sidebar nav card, driven by a `--grp` CSS variable
 * holding the group's accent hex (set inline via groupStyle). color-mix against
 * transparent keeps the tints readable in dark mode too. Shared by the platform
 * and tenant sidebars and the colour-editor previews.
 */
export const GROUP_CARD_CLASS =
  "rounded-2xl border border-[color-mix(in_srgb,var(--grp)_14%,transparent)] bg-[color-mix(in_srgb,var(--grp)_8%,transparent)]";
export const GROUP_LABEL_CLASS =
  "px-[9px] pt-1.5 pb-1 font-sans text-[10.5px] font-semibold tracking-[1px] text-sts-subtle uppercase";
export const GROUP_ITEM_ACTIVE_CLASS =
  "bg-[color-mix(in_srgb,var(--grp)_20%,transparent)] font-semibold text-sts-foreground";
export const GROUP_ITEM_IDLE_CLASS =
  "font-normal text-sts-muted hover:bg-[color-mix(in_srgb,var(--grp)_12%,transparent)] hover:text-sts-foreground";

/** Compact nav row shared by the department sidebar and the Settings sub-nav,
 * so both get identical sizing, hover tint and press feedback (sts-nav-link). */
export const GROUP_NAV_ROW_CLASS =
  "sts-nav-link relative flex h-7 items-center gap-2 rounded-lg px-2 font-sans text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--grp)_55%,transparent)]";

/**
 * Selected nav row: group tint + the theme accent for the label/icon, plus a
 * short bar in the group colour on the left edge.
 */
export const GROUP_NAV_ACTIVE_CLASS =
  "sts-nav-active bg-[color-mix(in_srgb,var(--grp)_20%,transparent)] font-semibold text-sts-blue before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-[var(--grp)]";

export function groupStyle(color: string): CSSProperties {
  return { "--grp": color } as CSSProperties;
}
