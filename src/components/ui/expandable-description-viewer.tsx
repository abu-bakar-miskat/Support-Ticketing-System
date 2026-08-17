"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";
import { RichTextDisplay } from "@/components/ui/rich-text-editor";
import { getPortalRoot } from "@/lib/portal-root";
import { cn } from "@/lib/utils";

export function ExpandDescriptionButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md border border-pen-card-border text-pen-muted transition-colors hover:border-pen-blue/40 hover:bg-pen-surface hover:text-pen-foreground",
        className,
      )}
      aria-label="Expand description"
      title="Expand"
    >
      <Maximize2 className="size-3.5" strokeWidth={2} />
    </button>
  );
}

export function ExpandableDescriptionViewer({
  html,
  expanded,
  onExpandedChange,
  label = "Description",
  subtitle = "Read the full ticket description",
}: {
  html: string;
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
  label?: string;
  subtitle?: string;
}) {
  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onExpandedChange(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded, onExpandedChange]);

  if (!expanded || !html) return null;

  const portalRoot = getPortalRoot();
  if (!portalRoot) return null;

  return createPortal(
    <div className="fixed inset-0 z-10000 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close expanded description"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => onExpandedChange(false)}
      />
      <div className="pen-glass-panel relative flex max-h-[calc(100svh/var(--pen-font-scale,1)-32px)] w-full max-w-[960px] flex-col overflow-hidden rounded-[14px] ring-1 ring-white/35 dark:ring-white/10">
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-pen-card-border px-4 sm:px-5">
          <h3 className="font-sans text-[14px] font-semibold text-pen-foreground">
            {label}
          </h3>
          <span className="font-sans text-[11.5px] text-pen-subtle">
            {subtitle}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => onExpandedChange(false)}
            className="flex h-8 items-center gap-1.5 rounded-[6px] border border-pen-card-border px-2.5 font-sans text-[11.5px] font-medium text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
          >
            <Minimize2 className="size-3.5" strokeWidth={2} />
            Collapse
          </button>
          <button
            type="button"
            onClick={() => onExpandedChange(false)}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-md text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <RichTextDisplay html={html} className="text-[13px]" />
        </div>
        <div className="flex h-10 shrink-0 items-center border-t border-pen-card-border px-4 sm:px-5">
          <span className="font-sans text-[11px] text-pen-subtle">
            Press Esc to collapse
          </span>
        </div>
      </div>
    </div>,
    portalRoot,
  );
}
