"use client";

import { cn } from "@/lib/utils";

type PanelLayout = "scroll-pad" | "scroll-page" | "board";

function layoutClasses(layout: PanelLayout) {
  switch (layout) {
    case "board":
      return "flex h-full min-h-0 flex-col overflow-hidden";
    case "scroll-pad":
      return "flex h-full min-h-0 flex-col overflow-y-auto p-2 sm:p-3";
    case "scroll-page":
      return "h-full min-h-0 overflow-y-auto pen-page-pad";
  }
}

export function ProjectTabPanel({
  active,
  mounted,
  layout,
  children,
}: {
  active: boolean;
  mounted: boolean;
  layout: PanelLayout;
  children: React.ReactNode;
}) {
  if (!mounted) return null;

  return (
    <div
      className={cn(
        "col-start-1 row-start-1 min-h-0 min-w-0",
        active ? layoutClasses(layout) : "hidden",
      )}
      aria-hidden={!active}
      inert={!active ? true : undefined}
    >
      {children}
    </div>
  );
}
