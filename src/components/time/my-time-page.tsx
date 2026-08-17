"use client";

import { useEffect, useState } from "react";
import { useTimerStore } from "@/store";
import { Play, Pause, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DrawerLink } from "@/components/tickets/drawer-link";
import { cn } from "@/lib/utils";
import { useTimeEntries } from "@/hooks/queries/use-time";
import { useTimerActions } from "@/hooks/use-timer-actions";
import type {
  ActiveTaskData,
  TimeEntryItem,
  TimeKindBucket,
  TodaySegment,
  TodayTaskSummary,
  WeekBar,
} from "@/lib/api/time";
import { MyTimeSectionsSkeleton } from "@/components/skeletons/page-skeletons";
import { PageHeader } from "@/components/ui/page-header";

export type { ActiveTaskData, TimeEntryItem, TodaySegment, WeekBar };

// ── Constants ──────────────────────────────────────────────────────────────────

const SEGMENT_CLASSES = ["bg-pen-blue", "bg-pen-green", "bg-pen-subtle"] as const;
const QA_SEGMENT_CLASSES = ["bg-teal-600", "bg-teal-500/70", "bg-teal-400/50"] as const;

function formatClock(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatHmsShort(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  liveSecs,
  accent = "dev",
}: {
  entry: TimeEntryItem;
  liveSecs?: number;
  accent?: "dev" | "qa";
}) {
  const duration =
    entry.running && liveSecs != null ? formatHmsShort(liveSecs) : entry.duration;
  const runningColor = accent === "qa" ? "text-teal-600" : "text-pen-id";
  const runningBg =
    accent === "qa"
      ? "bg-teal-600/5 dark:bg-teal-600/10"
      : "bg-pen-blue-tint/50 dark:bg-pen-blue-tint/50";
  const dotColor = accent === "qa" ? "bg-teal-600" : "bg-pen-green";

  const row = (
    <div
      className={cn(
        "flex min-w-[640px] items-center border-b border-[#f0f4f8] px-[18px] last:border-0 dark:border-[#3a3a37]",
        entry.running && runningBg,
        entry.ticketDbId && "cursor-pointer transition-colors hover:bg-pen-surface/60",
      )}
    >
      <div className="flex h-[50px] w-7 shrink-0 items-center">
        {entry.running ? (
          <span className={cn("block size-2.5 rounded-full", dotColor)} />
        ) : (
          <Play className="size-3 fill-pen-subtle text-pen-subtle" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-px py-2 pr-4">
        <p className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
          {entry.title}
        </p>
        <div className="flex items-center gap-1.5">
          {entry.ticketId && (
            <span className="font-mono text-[11.5px] font-semibold text-pen-id">
              {entry.ticketId}
            </span>
          )}
          <span
            className="block size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: entry.projectColor }}
          />
          <span className="truncate font-sans text-[11.5px] text-pen-muted">
            {entry.project}
          </span>
        </div>
      </div>

      <div className="hidden w-[150px] shrink-0 sm:flex sm:items-center">
        <span className="font-mono text-[11.5px] text-pen-muted">
          {entry.running ? "running…" : entry.timeRange}
        </span>
      </div>

      <div className="flex w-[72px] shrink-0 items-center justify-end sm:w-[90px]">
        <span
          className={cn(
            "font-mono text-[13px] font-medium",
            entry.running ? runningColor : "text-pen-foreground",
          )}
        >
          {duration}
        </span>
      </div>
    </div>
  );

  if (entry.ticketDbId) {
    return (
      <DrawerLink
        ticketId={entry.ticketDbId}
        href={`/tickets/${entry.ticketDbId}`}
        className="block"
      >
        {row}
      </DrawerLink>
    );
  }

  return row;
}

function TodayTaskCard({
  task,
  liveSecs,
  stopping,
  onStop,
  accent = "dev",
}: {
  task: TodayTaskSummary;
  liveSecs?: number;
  stopping: boolean;
  onStop: () => void;
  accent?: "dev" | "qa";
}) {
  const displaySecs = task.running && liveSecs != null ? liveSecs : task.totalSecs;
  const isQa = accent === "qa";

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border px-5 py-4 sm:flex-row sm:items-center sm:gap-[18px]",
        task.running
          ? isQa
            ? "border-[1.5px] border-teal-600/40 bg-teal-600/5"
            : "border-[1.5px] border-pen-blue bg-pen-blue-tint"
          : "border-pen-card-border bg-pen-card",
      )}
    >
      <span
        className={cn(
          "block size-2.5 shrink-0 rounded-full",
          task.running ? (isQa ? "bg-teal-600" : "bg-pen-green") : "bg-pen-subtle",
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "pen-text-stat-label",
              task.running
                ? isQa
                  ? "text-teal-700 dark:text-teal-400"
                  : "text-pen-blue"
                : "text-pen-subtle",
            )}
          >
            {task.running
              ? isQa
                ? "QA · CURRENTLY TRACKING"
                : "CURRENTLY TRACKING"
              : isQa
                ? "QA · TRACKED TODAY"
                : "TRACKED TODAY"}
          </span>
          {task.ticketId && (
            <span className="font-mono text-[11.5px] font-semibold text-pen-id">
              {task.ticketId}
            </span>
          )}
        </div>
        <p className="mt-1 font-sans text-sm font-semibold text-pen-foreground">
          {task.title}
        </p>
      </div>

      <div className="flex items-center gap-4 sm:gap-[18px]">
        <span
          className={cn(
            "font-mono font-semibold tabular-nums text-pen-foreground",
            task.running ? "text-[28px] sm:text-[32px]" : "text-[22px] sm:text-[24px]",
          )}
        >
          {task.running ? formatClock(displaySecs) : formatHmsShort(displaySecs)}
        </span>
        {task.running && (
          <Button
            size="lg"
            disabled={stopping}
            onClick={onStop}
            className="h-11 gap-1.5 rounded-lg bg-pen-red px-4 font-sans text-[13px] font-medium text-white hover:bg-pen-red/90"
          >
            <Pause className="size-3.5 fill-current" />
            {stopping ? "Pausing…" : "Pause"}
          </Button>
        )}
      </div>
    </div>
  );
}

function TimeKindSection({
  title,
  bucket,
  accent,
  timerTicketDbId,
  timerKind,
  liveSecs,
  stopping,
  onStop,
  emptyHint,
}: {
  title: string;
  bucket: TimeKindBucket;
  accent: "dev" | "qa";
  timerTicketDbId: string | null;
  timerKind: string | null;
  liveSecs: number;
  stopping: boolean;
  onStop: () => void;
  emptyHint: string;
}) {
  const isQa = accent === "qa";
  const matchesKind = isQa ? timerKind === "QA" : timerKind !== "QA";
  const barActive = isQa ? "bg-teal-600" : "bg-pen-blue";
  const barIdle = isQa ? "bg-teal-600/40" : "bg-pen-blue/45";
  const barEmpty = "bg-[#e3eaf0] dark:bg-pen-card-border";
  const segments = isQa ? QA_SEGMENT_CLASSES : SEGMENT_CLASSES;
  const hasAny =
    bucket.todayTasks.length > 0 ||
    bucket.entries.length > 0 ||
    bucket.todayTotalSecs > 0 ||
    bucket.weekTotalSecs > 0;

  if (!hasAny && isQa) return null;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center gap-2">
        <p
          className={cn(
            "font-sans text-[11.5px] font-semibold tracking-[1px]",
            isQa ? "text-teal-700 dark:text-teal-400" : "text-pen-subtle",
          )}
        >
          {title}
        </p>
        {isQa && (
          <span className="rounded-full bg-teal-600/10 px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-400">
            QA
          </span>
        )}
      </div>

      {bucket.todayTasks.length > 0 && (
        <div className="flex flex-col gap-3">
          {bucket.todayTasks.map((task) => {
            const runningHere =
              matchesKind && timerTicketDbId === task.ticketDbId;
            const taskForCard = runningHere
              ? { ...task, running: true }
              : { ...task, running: false };
            return (
              <TodayTaskCard
                key={`${accent}-${task.ticketDbId ?? task.title}`}
                task={taskForCard}
                liveSecs={runningHere ? liveSecs : undefined}
                stopping={stopping}
                onStop={onStop}
                accent={accent}
              />
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex w-full shrink-0 flex-col gap-1.5 rounded-xl border border-pen-card-border bg-pen-card px-[18px] py-4 lg:w-[300px]">
          <p className="pen-text-label">TODAY</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[30px] font-semibold text-pen-foreground">
              {bucket.todayTotal}
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded bg-pen-surface">
            {bucket.todaySegments.map((segment, i) => (
              <div
                key={segment.name}
                className={cn("h-full", segments[i % segments.length])}
                style={{ width: `${segment.pct}%` }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2.5 font-sans text-[9.5px] text-pen-muted">
            {bucket.todaySegments.map((segment) => (
              <span key={segment.name}>{segment.name}</span>
            ))}
            {bucket.todaySegments.length === 0 && <span>No time logged today</span>}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-pen-card-border bg-pen-card px-[18px] pt-4 pb-3.5">
          <div className="flex items-center">
            <p className="pen-text-label">THIS WEEK</p>
            <span className="flex-1" />
            <span className="font-mono text-[11.5px] font-medium text-pen-muted">
              {bucket.weekTotalLabel}
            </span>
          </div>
          <div className="flex h-[66px] items-end justify-between gap-1">
            {bucket.weekBars.map((bar, i) => (
              <div
                key={`${bar.day}-${i}`}
                className="flex flex-1 flex-col items-center justify-end gap-[5px]"
              >
                <div
                  className={cn(
                    "w-[22px] rounded-[3px]",
                    bar.empty ? barEmpty : bar.today ? barActive : barIdle,
                  )}
                  style={{ height: bar.height }}
                />
                <span
                  className={cn(
                    "font-sans text-[9.5px]",
                    bar.today
                      ? "font-semibold text-pen-foreground dark:text-pen-id"
                      : "text-pen-subtle",
                  )}
                >
                  {bar.day}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
        <div className="flex h-9 items-center border-b border-pen-card-border px-[18px]">
          <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
            TODAY&apos;S ENTRIES
          </p>
        </div>
        <div className="overflow-x-auto">
          {bucket.entries.length === 0 && (
            <div className="flex h-[50px] items-center px-[18px]">
              <p className="font-sans text-[12.5px] text-pen-muted">{emptyHint}</p>
            </div>
          )}
          {bucket.entries.map((entry) => {
            const runningHere =
              matchesKind && timerTicketDbId === entry.ticketDbId;
            return (
              <EntryRow
                key={`${accent}-${entry.id}`}
                entry={
                  runningHere
                    ? { ...entry, running: true }
                    : { ...entry, running: false }
                }
                liveSecs={runningHere ? liveSecs : undefined}
                accent={accent}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function MyTimePage() {
  const { data, isError } = useTimeEntries();
  const { stopTimer } = useTimerActions();

  const timerEntryId = useTimerStore((s) => s.entryId);
  const timerTicketDbId = useTimerStore((s) => s.ticketDbId);
  const timerStartedAtMs = useTimerStore((s) => s.startedAtMs);
  const timerKind = useTimerStore((s) => s.kind);

  const [liveSecs, setLiveSecs] = useState(0);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!timerEntryId || !timerStartedAtMs) return;
    const tick = () => setLiveSecs(Math.floor((Date.now() - timerStartedAtMs) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerEntryId, timerStartedAtMs]);

  async function handleStop() {
    setStopping(true);
    try {
      await stopTimer(timerEntryId);
    } finally {
      setStopping(false);
    }
  }

  if (isError) {
    return (
      <div className="pen-page-pad flex h-full items-center justify-center">
        <p className="font-sans text-[13px] text-pen-muted">
          Failed to load time data. Please refresh the page.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pen-page-pad flex h-full flex-col gap-[18px] overflow-y-auto">
        <PageHeader
          title="My Time"
          icon={Timer}
          iconClassName="text-pen-blue"
          description="Track development and QA time against tasks. Logged automatically to the ticket and your timesheet."
          clampDescription
        />
        <MyTimeSectionsSkeleton />
      </div>
    );
  }

  const development = data.development ?? {
    weekBars: data.weekBars,
    weekTotalLabel: data.weekTotalLabel,
    todayTotal: data.todayTotal,
    todayTotalSecs: 0,
    weekTotalSecs: 0,
    todaySegments: data.todaySegments,
    todayTasks: data.todayTasks,
    entries: data.entries,
  };
  const qa = data.qa ?? {
    weekBars: [],
    weekTotalLabel: "0h / 40h",
    todayTotal: "0h",
    todayTotalSecs: 0,
    weekTotalSecs: 0,
    todaySegments: [],
    todayTasks: [],
    entries: [],
  };

  return (
    <div className="pen-page-pad flex h-full flex-col gap-[22px] overflow-y-auto">
      <PageHeader
        title="My Time"
        icon={Timer}
        iconClassName="text-pen-blue"
        description="Track development and QA time against tasks. Logged automatically to the ticket and your timesheet."
        clampDescription
      />

      <TimeKindSection
        title="DEVELOPMENT TIME"
        bucket={development}
        accent="dev"
        timerTicketDbId={timerTicketDbId}
        timerKind={timerKind}
        liveSecs={liveSecs}
        stopping={stopping}
        onStop={handleStop}
        emptyHint="No entries yet today. Start a timer from a ticket to begin tracking."
      />

      {(qa.weekTotalSecs > 0 ||
        qa.todayTotalSecs > 0 ||
        qa.entries.length > 0 ||
        (timerKind === "QA" && !!timerTicketDbId)) && (
        <TimeKindSection
          title="QA TIME"
          bucket={qa}
          accent="qa"
          timerTicketDbId={timerTicketDbId}
          timerKind={timerKind}
          liveSecs={liveSecs}
          stopping={stopping}
          onStop={handleStop}
          emptyHint="No QA time logged today. Start a QA timer from a ticket you’re testing."
        />
      )}
    </div>
  );
}
