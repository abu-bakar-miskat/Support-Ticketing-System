import { cn } from "@/lib/utils"
import {
  shouldPulseCriticalPriority,
  UI_PRIORITY_STYLE,
  type UiPriority,
} from "@/components/board/board-types"

type PriorityDotProps = {
  priority: UiPriority
  status?: string
  size?: "sm" | "md"
  className?: string
}

export function PriorityDot({ priority, status, size = "sm", className }: PriorityDotProps) {
  const pulse = status ? shouldPulseCriticalPriority(priority, status) : false
  const style = UI_PRIORITY_STYLE[priority] ?? UI_PRIORITY_STYLE["medium"]

  return (
    <span
      className={cn(
        "block shrink-0 rounded-full",
        size === "sm" ? "size-[7px]" : "size-[9px]",
        style.dot,
        pulse && "pen-critical-breathe",
        className,
      )}
      aria-hidden
    />
  )
}

type PriorityPillProps = {
  priority: UiPriority
  status?: string
  size?: "sm" | "md"
  className?: string
}

export function PriorityPill({ priority, status, size = "sm", className }: PriorityPillProps) {
  const style = UI_PRIORITY_STYLE[priority] ?? UI_PRIORITY_STYLE["medium"]
  const pulse = status ? shouldPulseCriticalPriority(priority, status) : false

  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full font-sans font-medium",
        "ring-1 ring-inset ring-black/4 dark:ring-white/10",
        style.pillBg,
        style.pillText,
        size === "sm" ? "px-1.5 py-0.5 text-[9.5px]" : "px-2 py-0.5 text-[11.5px]",
        pulse && "pen-critical-breathe",
        className,
      )}
    >
      <span className={cn("shrink-0 rounded-full", style.dot, size === "sm" ? "size-[5px]" : "size-[6px]")} />
      {style.label}
    </span>
  )
}
