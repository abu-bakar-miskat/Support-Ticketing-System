"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarColorFor } from "@/lib/avatar";
import { useUnavailability } from "@/components/providers/availability-provider";

/** The raw avatar image/circle — no wrapper, no hover behaviour. */
export function AvatarVisual({
  name,
  avatarUrl,
  size,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        style={{ width: size, height: size, minWidth: size }}
        className={cn("block rounded-full object-cover shrink-0", className)}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        minWidth: size,
        fontSize: size * 0.38,
        backgroundColor: avatarColorFor(name),
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-sans font-semibold text-white",
        className,
      )}
    >
      {initials}
    </div>
  );
}

function UnavailableBadge({
  size,
  label,
}: {
  size: number;
  label: string;
}) {
  const badge = Math.max(10, Math.round(size * 0.42));
  const icon = Math.max(6, Math.round(badge * 0.62));
  return (
    <span
      title={label}
      aria-label={label}
      className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full border border-pen-card bg-amber-500 text-white shadow-sm dark:border-[#2a2a28]"
      style={{ width: badge, height: badge }}
    >
      <CalendarOff style={{ width: icon, height: icon }} strokeWidth={2.5} />
    </span>
  );
}

/**
 * Shared avatar component — shows the profile photo if available,
 * falls back to a coloured circle with initials.
 *
 * Pass `userId` to auto-show an unavailability badge when the user is on holiday.
 * Pass `unavailable` / `unavailableLabel` to override the global lookup.
 * Pass `meta` to enable a hover card that shows name, team, and role.
 */
export function UserAvatar({
  name,
  avatarUrl,
  size = 28,
  className,
  meta,
  userId,
  unavailable,
  unavailableLabel,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  meta?: { subDepartment?: string | null; role?: string | null; email?: string | null };
  userId?: string | null;
  unavailable?: boolean;
  unavailableLabel?: string | null;
}) {
  const fromContext = useUnavailability(userId);
  const isAway = unavailable ?? Boolean(fromContext);
  const awayLabel =
    unavailableLabel ??
    (fromContext
      ? fromContext.reason
        ? `${fromContext.label} · ${fromContext.reason}`
        : fromContext.label
      : "Away");

  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showCard = useCallback(() => {
    clearTimeout(hideTimer.current);
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const CARD_W = 208;
    const CARD_H = isAway ? 96 : 80;
    const spaceBelow = window.innerHeight - r.bottom;
    const top =
      spaceBelow >= CARD_H ? (r.bottom + 6) / zoom : (r.top - CARD_H - 6) / zoom;
    let left = r.left / zoom;
    if (left + CARD_W > document.body.offsetWidth - 8) {
      left = r.right / zoom - CARD_W;
    }
    setCardPos({ top, left: Math.max(8, left) });
  }, [isAway]);

  const hideCard = useCallback(() => {
    hideTimer.current = setTimeout(() => setCardPos(null), 120);
  }, []);

  const cancelHide = useCallback(() => {
    clearTimeout(hideTimer.current);
  }, []);

  const avatar = (
    <span
      className="relative inline-flex shrink-0 items-center justify-center leading-none"
      style={{ width: size, height: size }}
    >
      <AvatarVisual name={name} avatarUrl={avatarUrl} size={size} className={className} />
      {isAway && <UnavailableBadge size={size} label={awayLabel} />}
    </span>
  );

  if (!meta) {
    return avatar;
  }

  const cardSize = Math.max(size, 36);

  return (
    <>
      <span
        ref={triggerRef}
        className="relative inline-flex shrink-0 items-center justify-center leading-none"
        style={{ width: size, height: size }}
        onMouseEnter={showCard}
        onMouseLeave={hideCard}
      >
        <AvatarVisual name={name} avatarUrl={avatarUrl} size={size} className={className} />
        {isAway && <UnavailableBadge size={size} label={awayLabel} />}
      </span>

      {mounted &&
        cardPos &&
        createPortal(
          <div
            ref={cardRef}
            onMouseEnter={cancelHide}
            onMouseLeave={hideCard}
            style={{ position: "fixed", top: cardPos.top, left: cardPos.left, zIndex: 9999 }}
            className="w-52 rounded-xl border border-pen-card-border bg-pen-card px-3.5 py-3 shadow-pen-card backdrop-blur-[var(--pen-glass-blur)] animate-in fade-in-0 zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-2.5">
              <span className="relative inline-flex shrink-0">
                <AvatarVisual name={name} avatarUrl={avatarUrl} size={cardSize} />
                {isAway && <UnavailableBadge size={cardSize} label={awayLabel} />}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                  {name}
                </p>
                {isAway && (
                  <p className="truncate font-sans text-[11.5px] font-medium text-amber-600 dark:text-amber-400">
                    {awayLabel}
                  </p>
                )}
                {meta.role && (
                  <p className="truncate font-sans text-[11.5px] capitalize text-pen-muted">
                    {meta.role}
                  </p>
                )}
                {meta.subDepartment && (
                  <p className="truncate font-sans text-[11.5px] text-pen-subtle">
                    {meta.subDepartment}
                  </p>
                )}
                {meta.email && !meta.role && !meta.subDepartment && (
                  <p className="truncate font-sans text-[11.5px] text-pen-subtle">
                    {meta.email}
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
