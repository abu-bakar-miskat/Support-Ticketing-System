import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={cn("sts-shimmer rounded-md bg-sts-surface", className)}
      style={style}
    />
  );
}
