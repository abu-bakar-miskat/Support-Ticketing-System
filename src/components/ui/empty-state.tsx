import type { ComponentType, ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Standard "nothing here" block for lists, tables and panels. Use instead of
 * ad-hoc "No … yet" strings so empty screens look the same everywhere and
 * always tell the user what they can do next.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: ReactNode
  /** Primary next step, e.g. a "Create ticket" button or "Clear filters" link. */
  action?: ReactNode
  /** Smaller padding for use inside cards, popovers and side panels. */
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-4 px-6 py-16",
        className
      )}
    >
      {Icon && (
        <span
          className={cn(
            "flex items-center justify-center rounded-2xl bg-sts-surface",
            compact ? "size-10" : "size-14"
          )}
        >
          <Icon className={cn("text-sts-muted", compact ? "size-5" : "size-6")} />
        </span>
      )}
      <div className="flex max-w-100 flex-col gap-1">
        <p
          className={cn(
            "font-sans font-semibold text-sts-foreground",
            compact ? "text-[13px]" : "text-[15px]"
          )}
        >
          {title}
        </p>
        {description && (
          <p className="font-sans text-[13px] leading-relaxed text-sts-muted">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
