"use client";

import { cn } from "@/lib/utils";

type Props = {
  name: string;
  color: string;
  avatarUrl?: string | null;
  /** Pixel size — used for both width/height. Default 28. */
  size?: number;
  className?: string;
};

/**
 * Project icon: shows the uploaded avatar image when available,
 * falls back to the colour square with a coloured dot.
 */
export function ProjectAvatar({ name, color, avatarUrl, size = 28, className }: Props) {
  if (avatarUrl) {
    return (
      <div
        className={cn("shrink-0 overflow-hidden rounded-lg ring-1 ring-black/5 dark:ring-white/10", className)}
        style={{ width: size, height: size, minWidth: size, maxWidth: size, maxHeight: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={name}
          width={size}
          height={size}
          style={{ width: size, height: size, display: "block", objectFit: "cover" }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg ring-1 ring-black/5 dark:ring-white/10",
        className,
      )}
      style={{
        width: size,
        height: size,
        minWidth: size,
        maxWidth: size,
        backgroundColor: `${color}18`,
      }}
    >
      <span
        className="rounded-[3px]"
        style={{
          width: Math.round(size * 0.43),
          height: Math.round(size * 0.43),
          backgroundColor: color,
          display: "block",
        }}
      />
    </div>
  );
}

/** Tiny inline dot used in sidebar / compact lists. */
export function ProjectDot({
  color,
  avatarUrl,
  name,
  size = 8,
}: {
  color: string;
  avatarUrl?: string | null;
  name: string;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <div
        className="shrink-0 overflow-hidden rounded-sm"
        style={{ width: size, height: size, minWidth: size, maxWidth: size, maxHeight: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt={name}
          width={size}
          height={size}
          style={{ width: size, height: size, display: "block", objectFit: "cover" }}
        />
      </div>
    );
  }
  return (
    <span
      className="shrink-0 rounded-sm"
      style={{ width: size, height: size, minWidth: size, display: "block", backgroundColor: color }}
    />
  );
}
