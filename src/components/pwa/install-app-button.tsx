"use client";

import { useState } from "react";
import { Download, MonitorSmartphone, Share, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type InstallAppButtonProps = {
  collapsed?: boolean;
  className?: string;
};

export function InstallAppButton({
  collapsed = false,
  className,
}: InstallAppButtonProps) {
  const { canPrompt, isIos, install, showInstallOption } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (!showInstallOption) return null;

  async function handleInstall() {
    if (canPrompt) {
      setInstalling(true);
      try {
        await install();
      } finally {
        setInstalling(false);
      }
      return;
    }
    setOpen(true);
  }

  if (canPrompt) {
    return (
      <button
        type="button"
        onClick={() => void handleInstall()}
        disabled={installing}
        title={collapsed ? "Install app" : undefined}
        className={cn(
          "flex w-full items-center rounded-lg border border-sts-blue/25 bg-sts-blue-tint font-sans text-[12px] font-semibold text-sts-id transition-colors",
          "hover:border-sts-blue/40 hover:bg-sts-blue/15 disabled:opacity-60",
          collapsed ? "justify-center p-2" : "gap-2 px-2.5 py-2",
          className,
        )}
      >
        <Download className="size-3.5 shrink-0" />
        {!collapsed && (
          <span>{installing ? "Installing…" : "Install app"}</span>
        )}
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        title={collapsed ? "Install app" : undefined}
        className={cn(
          "flex w-full items-center rounded-lg border border-sts-blue/25 bg-sts-blue-tint font-sans text-[12px] font-semibold text-sts-id transition-colors",
          "hover:border-sts-blue/40 hover:bg-sts-blue/15",
          collapsed ? "justify-center p-2" : "gap-2 px-2.5 py-2",
          className,
        )}
      >
        <Download className="size-3.5 shrink-0" />
        {!collapsed && <span>Install app</span>}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="right"
        sideOffset={8}
        className="w-[min(100vw-2rem,280px)] rounded-xl border border-sts-card-border bg-sts-bg p-0 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2 border-b border-sts-card-border px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-sts-blue/10">
              <MonitorSmartphone className="size-3.5 text-sts-blue" />
            </span>
            <div>
              <p className="font-sans text-[13px] font-semibold text-sts-foreground">
                Install PEN app
              </p>
              <p className="font-sans text-[11.5px] text-sts-subtle">
                Add to your home screen
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-0.5 text-sts-subtle hover:text-sts-foreground"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="space-y-2.5 px-3.5 py-3">
          {isIos ? (
            <>
              <p className="font-sans text-[12px] leading-snug text-sts-muted">
                On iPhone or iPad, use Safari&apos;s share menu:
              </p>
              <ol className="space-y-2 font-sans text-[12px] text-sts-foreground">
                <li className="flex gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sts-surface text-[11.5px] font-semibold">
                    1
                  </span>
                  <span className="flex items-center gap-1.5 pt-0.5">
                    Tap <Share className="size-3.5 text-sts-blue" /> Share
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sts-surface text-[11.5px] font-semibold">
                    2
                  </span>
                  <span className="pt-0.5">Choose &quot;Add to Home Screen&quot;</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sts-surface text-[11.5px] font-semibold">
                    3
                  </span>
                  <span className="pt-0.5">Tap Add</span>
                </li>
              </ol>
            </>
          ) : (
            <p className="font-sans text-[12px] leading-snug text-sts-muted">
              Look for the install icon in your browser&apos;s address bar
              (usually a monitor with a download arrow). Chrome and Edge on
              desktop support one-click install.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
