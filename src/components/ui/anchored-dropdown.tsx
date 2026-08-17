"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { getPortalRoot } from "@/lib/portal-root";
import { cn } from "@/lib/utils";

type Placement = "top" | "bottom";

/**
 * Portals a floating dropdown out of any scroll/overflow ancestor so it is never
 * clipped, anchoring it to `anchorRef` with fixed positioning. Matches the
 * anchor's width and flips between top/bottom based on available viewport space.
 *
 * Use for autocompletes (e.g. @mention) that must NOT steal focus from an input
 * — unlike a Popover, this renders passively and relies on the caller's own
 * keyboard/close handling.
 */
export function AnchoredDropdown<T extends HTMLElement>({
  anchorRef,
  open,
  placement = "bottom",
  className,
  maxHeight = 200,
  children,
}: {
  anchorRef: React.RefObject<T | null>;
  open: boolean;
  placement?: Placement;
  className?: string;
  maxHeight?: number;
  children: React.ReactNode;
}) {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const [pos, setPos] = React.useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  React.useEffect(() => {
    setContainer(getPortalRoot());
  }, []);

  const recompute = React.useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    // Honor requested placement unless there isn't room and the other side has more.
    const openUp =
      placement === "top"
        ? spaceAbove >= maxHeight || spaceAbove >= spaceBelow
        : !(spaceBelow >= maxHeight || spaceBelow >= spaceAbove);
    if (openUp) {
      setPos({
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.top + 4,
      });
    } else {
      setPos({ left: rect.left, width: rect.width, top: rect.bottom + 4 });
    }
  }, [anchorRef, placement, maxHeight]);

  React.useEffect(() => {
    if (!open) return;
    recompute();
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open, recompute]);

  if (!open || !container || !pos) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: pos.left,
        width: pos.width,
        top: pos.top,
        bottom: pos.bottom,
        maxHeight,
      }}
      className={cn("z-[80] overflow-y-auto", className)}
    >
      {children}
    </div>,
    container,
  );
}
