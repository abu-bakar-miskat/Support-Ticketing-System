"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { labelColor } from "@/components/board/board-types";

// `/api/labels` is scoped to the active department, so the cache must be keyed
// by it — otherwise switching departments serves another department's colors.
function activeDeptId(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)pen_active_dept=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function useLabelsColorMap(): Map<string, string> {
  const { data } = useQuery({
    queryKey: ["labels", activeDeptId()],
    queryFn: () => fetch("/api/labels").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
  const map = new Map<string, string>();
  for (const label of (data?.labels ?? [])) {
    map.set(label.name, label.color);
  }
  return map;
}

// Pick white or near-black text for readability on a solid color fill.
function readableTextOn(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}

function tagClipPath(arrowDepth: number, notchDepth: number) {
  return `polygon(0 0, calc(100% - ${arrowDepth}px) 0%, 100% 50%, calc(100% - ${arrowDepth}px) 100%, 0 100%, ${notchDepth}px 50%)`;
}

type TagPillProps = {
  label: string;
  /** Explicit saved color; skips the async lookup when the caller already knows it. */
  color?: string | null;
  size?: "sm" | "md";
  className?: string;
};

export function TagPill({ label, color, size = "sm", className }: TagPillProps) {
  const colorsMap = useLabelsColorMap();
  // Saved color is the source of truth; fall back to a deterministic per-label
  // color so the design stays identical (solid fill) everywhere the tag renders.
  const fillColor = color ?? colorsMap.get(label) ?? labelColor(label);

  const arrowDepth = size === "sm" ? 5 : 7;
  const notchDepth = size === "sm" ? 3 : 5;

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap font-sans font-semibold",
        size === "sm" ? "py-[2px] text-[9.5px]" : "py-0.4 text-[11.5px]",
        className,
      )}
      style={{
        clipPath: tagClipPath(arrowDepth, notchDepth),
        paddingLeft: `${notchDepth + 4}px`,
        paddingRight: `${arrowDepth + 4}px`,
        backgroundColor: fillColor,
        color: readableTextOn(fillColor),
      }}
    >
      {label}
    </span>
  );
}
