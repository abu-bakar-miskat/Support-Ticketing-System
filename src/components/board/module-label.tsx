import { cn } from "@/lib/utils";

/** Inline module segment for board cards (project · module). */
export function CardModuleSegment({
  moduleName,
  withSeparator = true,
}: {
  moduleName: string | null;
  withSeparator?: boolean;
}) {
  if (!moduleName) return null;
  return (
    <>
      {withSeparator && <span className="text-pen-card-border">·</span>}
      <span
        className="max-w-[90px] truncate font-sans text-[11.5px] text-pen-subtle"
        title={moduleName}
      >
        {moduleName}
      </span>
    </>
  );
}

/** Module column cell for list/table views. */
export function ModuleCell({
  moduleName,
  className,
}: {
  moduleName: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "max-w-[120px] truncate font-sans text-[11.5px] text-pen-muted",
        className,
      )}
      title={moduleName ?? undefined}
    >
      {moduleName ?? "—"}
    </span>
  );
}
