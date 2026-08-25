import { cn } from "@/lib/utils";

const ALT = "Support Ticketing System";

/** Full stacked brand lockup (icon + wordmark), with a light variant for dark surfaces. */
export function PenLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center justify-center", className)}
      aria-label={ALT}
      role="img"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/support-logo.png" alt="" className="h-24 w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/support-logo-white.png"
        alt=""
        className="hidden h-24 w-auto dark:block"
      />
    </span>
  );
}

/** Compact brand mark (headset/chat icon only) for sidebars and collapsed states. */
export function BrandIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center justify-center", className)}
      aria-label={ALT}
      role="img"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/support-icon.png" alt="" className="h-full w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/support-icon-white.png"
        alt=""
        className="hidden h-full w-auto dark:block"
      />
    </span>
  );
}
