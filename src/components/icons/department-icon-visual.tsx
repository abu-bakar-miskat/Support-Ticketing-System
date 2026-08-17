import { getDepartmentIcon } from "@/lib/department-icons";
import { cn } from "@/lib/utils";

type DepartmentIconVisualProps = {
  name: string;
  id?: string;
  isHub?: boolean;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  strokeWidth?: number;
};

const SIZE_CLASS = {
  xs: "size-3",
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
} as const;

/** Renders the icon assigned to a specific department. */
export function DepartmentIconVisual({
  name,
  id,
  isHub,
  className,
  size = "md",
  strokeWidth = 1.75,
}: DepartmentIconVisualProps) {
  const Icon = getDepartmentIcon(name, id, isHub);
  return (
    <Icon
      className={cn("shrink-0", SIZE_CLASS[size], className)}
      strokeWidth={strokeWidth}
      aria-hidden
    />
  );
}
