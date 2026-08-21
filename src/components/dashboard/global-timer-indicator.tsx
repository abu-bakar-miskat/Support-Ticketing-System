"use client";

import Link from "next/link";
import { useTimerStore } from "@/store";
import { useLiveTimer } from "@/hooks/use-live-timer";
import { cn } from "@/lib/utils";

function formatElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Shown in the top bar while the current user has a running time entry. */
export function GlobalTimerIndicator() {
  const entryId = useTimerStore((s) => s.entryId);
  const ticketDbId = useTimerStore((s) => s.ticketDbId);
  const ticketHumanId = useTimerStore((s) => s.ticketHumanId);
  const ticketTitle = useTimerStore((s) => s.ticketTitle);
  const startedAtMs = useTimerStore((s) => s.startedAtMs);
  const elapsedSecs = useLiveTimer(startedAtMs);

  if (!entryId || !startedAtMs) return null;

  const taskHref = ticketDbId ? `/tickets/${ticketDbId}` : "/time";
  const tooltip = ticketTitle
    ? `${ticketHumanId ? `${ticketHumanId} · ` : ""}${ticketTitle}`
    : ticketHumanId
      ? `Timer on ${ticketHumanId}`
      : "View running timer";

  return (
    <Link
      href={taskHref}
      title={tooltip}
      className={cn(
        "flex h-7 max-w-[220px] items-center gap-1.5 rounded-md border px-2",
        "transition-colors sm:max-w-[260px]",
        "border-pen-green/35 bg-pen-green/10 hover:border-pen-green/50 hover:bg-pen-green/15",
      )}
    >
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-pen-green opacity-50" />
        <span className="relative inline-flex size-2 rounded-full bg-pen-green" />
      </span>
      {ticketHumanId && (
        <span className="truncate font-mono text-[11px] font-semibold text-pen-green">
          {ticketHumanId}
        </span>
      )}
      <span className="font-mono text-[11.5px] font-medium tabular-nums text-pen-green">
        {formatElapsed(elapsedSecs)}
      </span>
    </Link>
  );
}
