"use client";

import { ZoomIn, ZoomOut } from "lucide-react";
import { useFontSize } from "@/components/font-size/font-size-provider";
import { canStepFontSize, stepFontSize } from "@/lib/font-size";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function FontSizeZoomControls({ className }: Props) {
  const { fontSize, setFontSize, ready } = useFontSize();
  // The provider seeds fontSize from localStorage on the client, which can
  // differ from the server's value. Until it has resolved (post-mount, `ready`),
  // render both controls enabled so the server and first client render agree —
  // otherwise the `disabled` attribute mismatches and React warns on hydration.
  const canZoomOut = !ready || canStepFontSize(fontSize, "out");
  const canZoomIn = !ready || canStepFontSize(fontSize, "in");

  return (
    <div
      className={cn(
        "flex h-7 shrink-0 overflow-hidden rounded-md border border-pen-card-border bg-pen-surface dark:border-white/10 dark:bg-white/5",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setFontSize(stepFontSize(fontSize, "out"))}
        disabled={!canZoomOut}
        className="flex size-7 items-center justify-center text-pen-subtle transition-colors hover:text-pen-foreground disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Decrease font size"
        title="Decrease font size"
      >
        <ZoomOut className="size-3.5 shrink-0" />
      </button>
      <span className="w-px self-stretch bg-pen-card-border dark:bg-white/10" />
      <button
        type="button"
        onClick={() => setFontSize(stepFontSize(fontSize, "in"))}
        disabled={!canZoomIn}
        className="flex size-7 items-center justify-center text-pen-subtle transition-colors hover:text-pen-foreground disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Increase font size"
        title="Increase font size"
      >
        <ZoomIn className="size-3.5 shrink-0" />
      </button>
    </div>
  );
}
