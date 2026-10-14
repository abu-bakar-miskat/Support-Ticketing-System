"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";
import { getPortalRoot } from "@/lib/portal-root";

/**
 * Shares open/close delays across tooltips so moving between adjacent
 * triggers (e.g. a toolbar) shows the next tooltip instantly.
 * Mounted once in the root layout.
 */
function TooltipProvider({
  delay = 400,
  closeDelay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      delay={delay}
      closeDelay={closeDelay}
      {...props}
    />
  );
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

/** Tooltips are transient and always topmost — above the editor menus (z 10120). */
function TooltipContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "top",
  sideOffset = 6,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  // The popup only mounts client-side once open, so the portal root is safe to
  // resolve during render (getPortalRoot returns null on the server).
  return (
    <TooltipPrimitive.Portal container={getPortalRoot()}>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-[10200]"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-[10200] max-w-xs origin-(--transform-origin) rounded-md bg-foreground px-2 py-1 text-[11.5px] leading-snug font-medium text-balance text-background shadow-md duration-100 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

type TipProps = {
  /** Tooltip text. When falsy, the child renders without a tooltip. */
  label: React.ReactNode;
  /** The trigger element. Must forward refs and spread props (e.g. <Button>, <button>, <a>). */
  children: React.ReactElement;
  side?: TooltipPrimitive.Positioner.Props["side"];
  align?: TooltipPrimitive.Positioner.Props["align"];
  disabled?: boolean;
  /**
   * Wrap the trigger in a span so the tooltip still shows while the child is
   * disabled. Use for buttons whose tooltip explains why they're disabled.
   */
  wrap?: boolean;
};

/**
 * Convenience wrapper: `<Tip label="Delete"><Button size="icon" aria-label="Delete">…</Button></Tip>`.
 *
 * A tooltip is a visual hint, not an accessible name — icon-only triggers
 * still need their own `aria-label`.
 */
function Tip({ label, children, side, align, disabled, wrap }: TipProps) {
  if (!label) return children;
  // Disabled buttons get no pointer/focus events, so `wrap` anchors the tooltip
  // on a span instead — keeps "why is this disabled?" hints reachable. The span
  // is always rendered (only its tabIndex toggles) so the button never remounts
  // and loses focus when its disabled state flips.
  const childDisabled = Boolean(
    (children.props as { disabled?: boolean }).disabled,
  );
  const trigger = wrap ? (
    <span
      tabIndex={childDisabled ? 0 : undefined}
      className="inline-flex rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </span>
  ) : (
    children
  );
  return (
    <Tooltip disabled={disabled}>
      <TooltipTrigger render={trigger} />
      <TooltipContent side={side} align={align}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export { Tip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
