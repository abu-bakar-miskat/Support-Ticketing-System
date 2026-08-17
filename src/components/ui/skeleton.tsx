import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={cn("pen-shimmer rounded-md bg-pen-surface", className)}
      style={style}
    />
  );
}
