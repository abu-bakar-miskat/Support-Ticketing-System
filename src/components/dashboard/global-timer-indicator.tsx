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

/** Shown in the top bar while the current user has a running time entry (dev or QA). */
export function GlobalTimerIndicator() {
  const entryId = useTimerStore((s) => s.entryId);
  const ticketDbId = useTimerStore((s) => s.ticketDbId);
  const ticketHumanId = useTimerStore((s) => s.ticketHumanId);
  const ticketTitle = useTimerStore((s) => s.ticketTitle);
  const startedAtMs = useTimerStore((s) => s.startedAtMs);
  const kind = useTimerStore((s) => s.kind);
  const elapsedSecs = useLiveTimer(startedAtMs);

  if (!entryId || !startedAtMs) return null;

  const isQa = kind === "QA";
  const taskHref = ticketDbId ? `/tickets/${ticketDbId}` : "/time";
  const tooltip = ticketTitle
    ? `${isQa ? "QA · " : ""}${ticketHumanId ? `${ticketHumanId} · ` : ""}${ticketTitle}`
    : ticketHumanId
      ? `${isQa ? "QA timer" : "Timer"} on ${ticketHumanId}`
      : isQa
        ? "View running QA timer"
        : "View running timer";

  return (
    <Link
      href={taskHref}
      title={tooltip}
      className={cn(
        "flex h-7 max-w-[220px] items-center gap-1.5 rounded-md border px-2",
        "transition-colors sm:max-w-[260px]",
        isQa
          ? "border-teal-600/35 bg-teal-600/10 hover:border-teal-600/50 hover:bg-teal-600/15"
          : "border-pen-green/35 bg-pen-green/10 hover:border-pen-green/50 hover:bg-pen-green/15",
      )}
    >
      <span className="relative flex size-2 shrink-0">
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-50",
            isQa ? "bg-teal-600" : "bg-pen-green",
          )}
        />
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            isQa ? "bg-teal-600" : "bg-pen-green",
          )}
        />
      </span>
      {isQa && (
        <span className="shrink-0 font-sans text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-400">
          QA
        </span>
      )}
      {ticketHumanId && (
        <span
          className={cn(
            "truncate font-mono text-[11px] font-semibold",
            isQa ? "text-teal-700 dark:text-teal-400" : "text-pen-green",
          )}
        >
          {ticketHumanId}
        </span>
      )}
      <span
        className={cn(
          "font-mono text-[11.5px] font-medium tabular-nums",
          isQa ? "text-teal-700 dark:text-teal-400" : "text-pen-green",
        )}
      >
        {formatElapsed(elapsedSecs)}
      </span>
    </Link>
  );
}
