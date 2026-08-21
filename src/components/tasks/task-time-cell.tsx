"use client";

import { useState } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTaskTimeDisplay, normalizeStatus } from "@/components/board/board-types";
import { useLiveTimer } from "@/hooks/use-live-timer";
import { useTimerActions } from "@/hooks/use-timer-actions";
import { useAuthStore, useTimerStore } from "@/store";
import { toast } from "sonner";

type Props = {
  ticketDbId: string;
  humanId: string;
  title: string;
  status: string;
  assigneeId: string | null;
  coAssigneeIds: string[];
  userLoggedSecs: number;
  estimatedTime: number | null;
};

export function TaskTimeCell({
  ticketDbId,
  humanId,
  title,
  status,
  assigneeId,
  coAssigneeIds,
  userLoggedSecs,
  estimatedTime,
}: Props) {
  const [startingTimer, setStartingTimer] = useState(false);
  const [stoppingTimer, setStoppingTimer] = useState(false);
  const timerEntryId = useTimerStore((s) => s.entryId);
  const timerTicketDbId = useTimerStore((s) => s.ticketDbId);
  const timerStartedAtMs = useTimerStore((s) => s.startedAtMs);
  const { startTimer, stopTimer } = useTimerActions();
  const userId = useAuthStore((s) => s.user?.id);

  const isRunning = timerTicketDbId === ticketDbId;
  const elapsedSecs = useLiveTimer(isRunning ? timerStartedAtMs : null);
  const displaySecs = userLoggedSecs + (isRunning ? elapsedSecs : 0);
  const timeLabel = formatTaskTimeDisplay(displaySecs, estimatedTime);

  const canTrack =
    normalizeStatus(status) === "In Progress" &&
    !!userId &&
    (assigneeId === userId || coAssigneeIds.includes(userId));

  async function handleStartTimer(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (startingTimer || isRunning) return;
    setStartingTimer(true);
    try {
      await startTimer({ ticketDbId, humanId, title });
      toast.success(`Timer started on ${humanId}`);
    } catch {
      toast.error("Failed to start timer");
    } finally {
      setStartingTimer(false);
    }
  }

  async function handleStopTimer(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (stoppingTimer) return;
    setStoppingTimer(true);
    try {
      await stopTimer(timerEntryId);
      toast.success(`Timer paused on ${humanId}`);
    } catch {
      toast.error("Failed to pause timer");
    } finally {
      setStoppingTimer(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {isRunning && (
        <span className="block size-[7px] shrink-0 animate-pulse rounded-full bg-pen-green" />
      )}
      <span
        className={cn(
          "font-mono text-[11.5px] whitespace-nowrap",
          isRunning ? "font-semibold text-pen-green" : "text-pen-muted",
        )}
      >
        {timeLabel}
      </span>
      {canTrack &&
        (isRunning ? (
          <button
            type="button"
            title="Pause timer"
            onClick={handleStopTimer}
            disabled={stoppingTimer}
            className="flex size-[18px] shrink-0 items-center justify-center rounded text-pen-red transition-colors hover:bg-pen-red/10 disabled:cursor-wait"
          >
            <Pause className="size-[9px] fill-current" />
          </button>
        ) : (
          <button
            type="button"
            title="Start timer"
            onClick={handleStartTimer}
            disabled={startingTimer}
            className="flex size-[18px] shrink-0 items-center justify-center rounded text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-blue disabled:cursor-wait"
          >
            <Play className="size-[10px]" />
          </button>
        ))}
    </div>
  );
}
