import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  badge?: ReactNode;
  titleExtra?: ReactNode;
  actions?: ReactNode;
  trailing?: ReactNode;
  clampDescription?: boolean;
  className?: string;
};

export function PageHeader({
  title,
  description,
  icon: Icon,
  iconClassName,
  badge,
  titleExtra,
  actions,
  trailing,
  clampDescription = false,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="flex items-center gap-2">
            {Icon && (
              <Icon
                className={cn(
                  "size-[18px] shrink-0 sm:size-5",
                  iconClassName ?? "text-pen-foreground",
                )}
                strokeWidth={1.8}
              />
            )}
            <h1 className="pen-text-page-title leading-none">{title}</h1>
          </div>
          {(badge || titleExtra) && (
            <div className="flex items-center gap-2">
              {badge}
              {titleExtra}
            </div>
          )}
        </div>
        {description && (
          <p
            className={cn(
              "mt-0.5 pen-text-page-desc",
              Icon && "pl-7",
              clampDescription && "line-clamp-2",
            )}
          >
            {description}
          </p>
        )}
      </div>
      {(actions || trailing) && (
        <div className="flex shrink-0 flex-col items-end gap-2">
          {actions && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          )}
          {trailing}
        </div>
      )}
    </header>
  );
}
