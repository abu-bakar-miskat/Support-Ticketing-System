import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "")
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Tinted trigger — the whole field reflects the tag color */
export function coloredTriggerStyles(accent: string): CSSProperties {
  return {
    backgroundColor: hexToRgba(accent, 0.14),
    borderColor: hexToRgba(accent, 0.4),
    boxShadow: `inset 0 1px 0 ${hexToRgba(accent, 0.12)}`,
  }
}

export const coloredSelectTriggerClass = cn(
  "h-9 w-full rounded-lg border px-2.5 shadow-none",
  "font-sans text-[12px] font-semibold text-pen-foreground",
  "bg-transparent transition-[filter,box-shadow,border-color]",
  "hover:brightness-105 dark:bg-transparent dark:hover:bg-transparent",
  "focus-visible:ring-2 focus-visible:ring-offset-0",
  "[&_svg]:shrink-0 [&_svg]:opacity-60",
)

/** Neutral trigger for unassigned assignee */
export const neutralSelectTriggerClass = cn(
  coloredSelectTriggerClass,
  "border-pen-card-border/80",
)

export const neutralTriggerStyles: CSSProperties = {
  backgroundColor: "rgba(148, 163, 184, 0.1)",
  borderColor: "rgba(148, 163, 184, 0.28)",
}

export const sidebarSelectContentClass = cn(
  "pen-field-dropdown min-w-(--anchor-width)",
  "border-pen-card-border bg-white text-pen-foreground shadow-lg",
  "ring-1 ring-black/5 dark:bg-[#2a2e36] dark:text-pen-foreground dark:ring-white/10",
  "[backdrop-filter:none] [-webkit-backdrop-filter:none]",
)

export const sidebarDropdownPanelClass = cn(
  "pen-field-dropdown rounded-lg",
  "border-pen-card-border bg-white text-pen-foreground shadow-lg",
  "ring-1 ring-black/5 dark:bg-[#2a2e36] dark:text-pen-foreground dark:ring-white/10",
  "[backdrop-filter:none] [-webkit-backdrop-filter:none]",
)

export const sidebarSelectItemClass = cn(
  "pen-field-dropdown-item font-sans text-[12px]",
)

export const sidebarDateInputClass = cn(
  "relative h-8 w-full min-w-0 rounded-[6px] border border-pen-card-border bg-pen-surface px-2 pr-8",
  "font-sans text-[11.5px] text-pen-foreground",
  "outline-none focus:border-pen-blue focus:ring-1 focus:ring-pen-blue/30",
  "dark:bg-[#2a2e36]",
)

export function coloredDotClass(size: "sm" | "md" = "sm") {
  return cn("shrink-0 rounded-full", size === "md" ? "size-2" : "size-[7px]")
}
