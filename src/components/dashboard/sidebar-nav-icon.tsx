import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SidebarNavIcon({
  icon: Icon,
  className,
  size = "nav",
}: {
  icon: LucideIcon;
  className?: string;
  size?: "nav" | "sm";
}) {
  return (
    <Icon
      className={cn(
        size === "sm" ? "size-3.5" : "size-4",
        "shrink-0",
        className,
      )}
      strokeWidth={1.75}
      aria-hidden
    />
  );
}
