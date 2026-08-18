import type { CSSProperties } from "react";
import {
  Activity,
  Bell,
  Boxes,
  CalendarDays,
  ChartColumn,
  ChartPie,
  FolderKanban,
  ListTodo,
  SquareKanban,
  Timer,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";

const ROW_BORDER = "border-b border-[#f0f4f8] last:border-0 dark:border-[#3a3a37]";

function fade(index: number, step = 0.06) {
  return { opacity: Math.max(0.35, 1 - index * step) };
}

// ── Home ──────────────────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-pen-card-border bg-pen-card px-[18px] py-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="size-[26px] rounded-lg" />
      </div>
      <Skeleton className="h-7 w-12" />
      <Skeleton className="h-2.5 w-28" />
    </div>
  );
}

function BoardCardSkeleton({ opacity }: { opacity: number }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-pen-card-border bg-pen-card p-3"
      style={{ opacity }}
    >
      <Skeleton className="h-3 w-[85%]" />
      <Skeleton className="h-3 w-[60%]" />
      <div className="flex items-center gap-2 pt-1">
        <Skeleton className="h-4 w-12 rounded-full" />
        <Skeleton className="ml-auto h-5 w-5 rounded-full" />
      </div>
    </div>
  );
}

const BOARD_COLUMNS = [
  { cards: 4 },
  { cards: 3 },
  { cards: 2 },
  { cards: 5 },
];

function OverviewTabSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-2 sm:p-3">
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-pen-card-border bg-pen-card-border sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-2 bg-pen-card px-3 py-2.5 sm:flex-col sm:items-start sm:gap-0.5 sm:py-2"
          >
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-5 w-8" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 min-[760px]:grid-cols-2 min-[760px]:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
            <Skeleton className="mb-2.5 h-3 w-28" />
            <Skeleton className="mb-3 h-9 w-full rounded-lg" />
            <Skeleton className="mb-2 h-3 w-24" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>

          <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
            <Skeleton className="mb-3 h-3 w-28" />
            {[0, 1].map((i) => (
              <div
                key={i}
                className={cn(
                  "rounded-xl border border-pen-card-border/60 bg-pen-surface/30 p-3",
                  i > 0 && "mt-3",
                )}
              >
                <div className="mb-2.5 flex items-center gap-2">
                  <Skeleton className="size-2.5 shrink-0 rounded-full" />
                  <Skeleton className="h-3.5 flex-1" />
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3.5 w-8" />
                </div>
                <Skeleton className="mb-2.5 h-2 w-full rounded-full" />
                <div className="flex flex-wrap gap-1.5">
                  {[48, 56, 44].map((w) => (
                    <Skeleton key={w} className="h-5 rounded-md" style={{ width: w }} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-pen-card-border px-3 py-3">
              <Skeleton className="size-4 shrink-0 rounded" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {["Time logged", "Ticket contributions"].map((label) => (
            <div
              key={label}
              className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-3"
            >
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-12" />
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-pen-card-border px-3 py-3">
                <Skeleton className="size-4 shrink-0 rounded" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}

          <div className="flex max-h-[420px] flex-col overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
            <div className="shrink-0 px-4 pt-3 pb-2">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Skeleton className="mr-auto h-3 w-28" />
                {[36, 44, 52, 40, 48].map((w) => (
                  <Skeleton key={w} className="h-6 rounded-md" style={{ width: w }} />
                ))}
              </div>
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 border-t border-pen-card-border/60 px-3 py-2"
                style={fade(i, 0.08)}
              >
                <Skeleton className="size-[22px] shrink-0 rounded-full" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-10 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section skeletons (inside page shells while data loads) ───────────────────

export function StatCardsRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="mb-5 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function HomeDashboardSectionsSkeleton() {
  return (
    <>
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3.5"
          >
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-10" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        ))}
      </div>

      {/* Main + rail */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-7">
        {/* Needs attention */}
        <div className="overflow-hidden rounded-2xl border border-pen-card-border bg-pen-card">
          <div className="flex items-center gap-2.5 border-b border-pen-card-border px-4 py-3">
            <Skeleton className="size-6 rounded-md" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-4 w-6 rounded-full" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={cn("flex h-[50px] items-center gap-3 px-4", ROW_BORDER)}>
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>

        {/* Rail */}
        <div className="flex flex-col gap-5">
          {/* My projects */}
          <div className="overflow-hidden rounded-2xl border border-pen-card-border bg-pen-card">
            <div className="flex items-center gap-2.5 border-b border-pen-card-border px-4 py-3">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="ml-auto h-3 w-5" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn("flex h-[42px] items-center gap-2.5 px-4", ROW_BORDER)}>
                <Skeleton className="size-2 rounded-full" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
          {/* My activity */}
          <div className="overflow-hidden rounded-2xl border border-pen-card-border bg-pen-card">
            <div className="flex items-center gap-2.5 border-b border-pen-card-border px-4 py-3">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex flex-col gap-2.5 px-4 py-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <Skeleton className="size-[22px] shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2.5 w-14" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function MentionCardSkeleton({ style }: { style?: CSSProperties }) {
  return (
    <article
      className="flex flex-col gap-2 rounded-[10px] border border-pen-card-border bg-pen-card px-[18px] py-3.5"
      style={style}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="size-1 shrink-0 rounded-[2px]" />
        <Skeleton className="h-3 w-4" />
        <Skeleton className="h-3 w-14" />
        <span className="hidden min-w-[8px] flex-1 sm:block" />
        <Skeleton className="h-3 w-12 sm:ml-auto" />
      </div>
      <Skeleton className="h-3 w-48" />
      <div className="rounded-lg bg-pen-bg px-3 py-2.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="mt-1.5 h-3" style={{ width: "80%" }} />
      </div>
      <div className="flex items-center gap-3.5">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-20" />
      </div>
    </article>
  );
}

export function MentionCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      <Skeleton className="h-3 w-12" />
      {Array.from({ length: count }).map((_, i) => (
        <MentionCardSkeleton key={i} style={fade(i, 0.08)} />
      ))}
    </>
  );
}

export function MyTimeSectionsSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex w-full shrink-0 flex-col gap-1.5 rounded-xl border border-pen-card-border bg-pen-card px-[18px] py-4 lg:w-[300px]">
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-2 w-full rounded bg-pen-surface" />
          <div className="flex flex-wrap gap-2.5">
            {[36, 40, 32].map((w) => (
              <Skeleton key={w} className="h-2.5" style={{ width: w }} />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-pen-card-border bg-pen-card px-[18px] pt-4 pb-3.5">
          <div className="flex items-center">
            <Skeleton className="h-2.5 w-16" />
            <span className="flex-1" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="flex h-[66px] items-end justify-between gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-[5px]">
                <Skeleton className="w-[22px] rounded-[3px]" style={{ height: 18 + (i % 4) * 10 }} />
                <Skeleton className="h-2.5 w-3" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
        <div className="flex h-9 items-center border-b border-pen-card-border px-[18px]">
          <Skeleton className="h-3 w-28" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex min-w-[640px] items-center border-b border-[#f0f4f8] px-[18px] last:border-0 dark:border-[#3a3a37]"
            style={fade(i)}
          >
            <Skeleton className="mr-3 size-3 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1 py-2.5 pr-4">
              <Skeleton className="h-3.5 w-3/5 max-w-[240px]" />
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="size-2 shrink-0 rounded-[2px]" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="hidden h-3 w-24 sm:block" />
            <Skeleton className="ml-4 h-3.5 w-10" />
          </div>
        ))}
      </div>
    </>
  );
}

export function SprintsOverviewSectionsSkeleton() {
  return (
    <div className="flex flex-col gap-6 pt-5">
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-lg bg-pen-surface px-3 py-2"
          >
            <Skeleton className="h-5 w-6" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-xl border border-pen-card-border bg-pen-card px-4 py-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="size-2 shrink-0 rounded-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-[7px] shrink-0 rounded-full" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-28" />
        <div className="flex flex-col divide-y divide-[#f0f4f8] overflow-hidden rounded-xl border border-pen-card-border bg-pen-card dark:divide-[#3a3a37]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-2 shrink-0 rounded-full" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SprintsListRowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-pen-card-border/60 px-4 py-3 last:border-b-0"
          style={fade(i)}
        >
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="ml-auto h-3 w-12" />
        </div>
      ))}
    </>
  );
}

export function TeamTimeStatsRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="contents">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export function TeamTimeTableRowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      <div className="flex min-w-[900px] items-center gap-4 border-b border-pen-card-border px-[18px] py-2.5">
        {[72, 64, 48, 80, 48, 48].map((w, i) => (
          <Skeleton
            key={i}
            className={cn("h-3 shrink-0", i >= 4 && "ml-auto")}
            style={{ width: w }}
          />
        ))}
      </div>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex min-w-[900px] items-center gap-4 border-b border-pen-card-border/60 px-[18px] py-3 last:border-b-0"
          style={fade(i)}
        >
          <div className="flex w-[140px] shrink-0 items-center gap-2">
            <Skeleton className="size-[30px] rounded-full" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-3.5 w-16" />
          <div className="hidden items-center gap-1 md:flex">
            {Array.from({ length: 7 }).map((_, j) => (
              <Skeleton key={j} className="w-2 rounded-[2px]" style={{ height: 8 + (j % 3) * 6 }} />
            ))}
          </div>
          <Skeleton className="hidden h-3 w-32 lg:block" />
          <Skeleton className="ml-auto h-3.5 w-8" />
          <Skeleton className="h-3.5 w-8" />
        </div>
      ))}
    </>
  );
}

export function ProjectDetailHeaderSkeleton() {
  return (
    <div className="pen-page-header shrink-0 border-b border-pen-card-border bg-pen-card">
      <div className="mb-2 flex items-start gap-2.5 sm:mb-3 sm:gap-3">
        <Skeleton className="mt-0.5 size-6 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="size-7 rounded-full" style={fade(i, 0.15)} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="pen-header-scroll">
        <div className="flex w-max min-w-full items-end gap-0.5">
          {[
            { w: 72, active: true },
            { w: 88, active: false },
            { w: 96, active: false },
            { w: 72, active: false },
            { w: 56, active: false },
            { w: 72, active: false },
          ].map(({ w, active }, i) => (
            <div
              key={i}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-3 sm:px-3",
                active ? "border-pen-id" : "border-transparent",
              )}
            >
              <Skeleton className="size-3.5 shrink-0 rounded" />
              <Skeleton className="h-3.5" style={{ width: w }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProjectDetailSectionsSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <OverviewTabSkeleton />
    </div>
  );
}

export function HomeDashboardSkeleton() {
  return (
    <div className="pen-page-pad h-full overflow-y-auto">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="font-sans text-[18px] font-medium text-pen-muted sm:text-[20px]">
            Good day,
          </p>
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-12 w-28 shrink-0 rounded-xl" />
      </div>
      <div className="flex flex-col gap-6">
        <HomeDashboardSectionsSkeleton />
      </div>
    </div>
  );
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function TasksTableSkeleton() {
  return (
    <>
      <div className="shrink-0 px-4 py-2 sm:px-6 xl:px-8">
        <Skeleton className="mb-2 h-3.5 w-40" />
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Skeleton className="h-8 w-36 shrink-0 rounded-lg" />
          <Skeleton className="hidden h-5 w-px shrink-0 bg-pen-card-border sm:block" />
          {[52, 64, 56, 48, 72].map((w, i) => (
            <Skeleton key={i} className="h-8 shrink-0 rounded-lg" style={{ width: w }} />
          ))}
          <span className="hidden flex-1 lg:block" />
          <Skeleton className="h-8 w-24 shrink-0 rounded-lg" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="sticky top-0 z-10 bg-pen-card">
            <tr className="border-b border-pen-card-border">
              <th className="w-[100px] py-2.5 pl-4 text-left">
                <Skeleton className="h-3 w-14" />
              </th>
              <th className="w-[80px] py-2.5 text-left">
                <Skeleton className="h-3 w-6" />
              </th>
              <th className="py-2.5 text-left">
                <Skeleton className="h-3 w-10" />
              </th>
              <th className="hidden w-[170px] py-2.5 md:table-cell">
                <Skeleton className="h-3 w-12" />
              </th>
              <th className="hidden w-[140px] py-2.5 lg:table-cell">
                <Skeleton className="h-3 w-16" />
              </th>
              <th className="hidden w-[140px] py-2.5 xl:table-cell">
                <Skeleton className="h-3 w-14" />
              </th>
              <th className="hidden w-[100px] py-2.5 sm:table-cell">
                <Skeleton className="h-3 w-10" />
              </th>
              <th className="w-[80px] py-2.5 pr-4 text-right">
                <Skeleton className="ml-auto h-3 w-8" />
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <tr
                key={i}
                className="border-b border-pen-card-border/60"
                style={fade(i, 0.05)}
              >
                <td className="w-[100px] py-2.5 pl-4">
                  <Skeleton className="h-5 w-14 rounded-full" />
                </td>
                <td className="py-2.5">
                  <Skeleton className="h-3.5 w-14" />
                </td>
                <td className="max-w-0 py-2.5 pr-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Skeleton className="size-[7px] shrink-0 rounded-full" />
                    <Skeleton className="h-4 min-w-0 flex-1" />
                  </div>
                </td>
                <td className="hidden py-2.5 md:table-cell">
                  <Skeleton className="h-6 w-24 rounded-full" />
                </td>
                <td className="hidden py-2.5 lg:table-cell">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="size-6 rounded-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </td>
                <td className="hidden py-2.5 xl:table-cell">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="size-2 rounded-[2px]" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </td>
                <td className="hidden py-2.5 sm:table-cell">
                  <Skeleton className="h-3.5 w-12" />
                </td>
                <td className="py-2.5 pr-4 text-right">
                  <Skeleton className="ml-auto h-3.5 w-10" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function TasksPageSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 border-b border-pen-card-border bg-pen-card px-4 py-1.5 sm:px-6 xl:px-8">
        <span className="flex h-8 items-center gap-1.5 rounded-md bg-pen-blue px-3 font-sans text-[12.5px] font-medium text-white dark:text-gray-900">
          My Tasks
        </span>
        <span className="flex h-8 items-center gap-1.5 rounded-md px-3 font-sans text-[12.5px] font-medium text-pen-muted">
          All Tasks
        </span>
        <span className="flex-1" />
        <span className="flex h-8 items-center gap-1.5 rounded-md bg-pen-blue px-3 font-sans text-[12.5px] font-medium text-white opacity-50 dark:text-gray-900">
          New Task
        </span>
      </div>
      <TasksTableSkeleton />
    </div>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────────

export function BoardPageSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-2 pb-2 sm:px-6 xl:px-8">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <SquareKanban
              className="size-[18px] shrink-0 text-pen-blue sm:size-5"
              strokeWidth={1.8}
            />
            <h1 className="pen-text-page-title leading-none">Board</h1>
          </div>
          <Skeleton className="h-5 w-8 rounded-full" />
          <span className="hidden h-4 w-px shrink-0 bg-pen-card-border md:block" />
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {[52, 64, 56, 48, 72, 60].map((w, i) => (
              <Skeleton key={i} className="h-7 shrink-0 rounded-lg" style={{ width: w }} />
            ))}
          </div>
          <Skeleton className="h-7 w-20 shrink-0 rounded-md" />
          <Skeleton className="h-7 w-24 shrink-0 rounded-md" />
          <Skeleton className="h-7 w-14 shrink-0 rounded-md" />
        </div>
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto px-4 pb-4 sm:px-6 xl:px-8">
        {BOARD_COLUMNS.map((col, ci) => (
          <div key={ci} className="flex w-[260px] shrink-0 flex-col gap-2">
            <div className="flex items-center gap-2 px-1 pb-1">
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>
            {Array.from({ length: col.cards }).map((_, i) => (
              <BoardCardSkeleton key={i} opacity={1 - i * 0.12} />
            ))}
            <Skeleton className="h-8 w-full rounded-lg opacity-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function ProjectsPageSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-pen-card-border bg-pen-card px-4 py-1.5 sm:px-6 xl:px-8">
        <span className="flex h-8 items-center gap-1.5 rounded-md bg-pen-blue px-3 font-sans text-[12.5px] font-medium text-white dark:text-gray-900">
          My Projects
        </span>
        <span className="flex h-8 items-center gap-1.5 rounded-md px-3 font-sans text-[12.5px] font-medium text-pen-muted">
          All Projects
        </span>
      </div>

      <div className="flex items-center gap-2 border-b border-pen-card-border px-5 py-3">
        <Skeleton className="h-8 w-56 rounded-md" />
        <div className="flex items-center gap-1">
          {[40, 32, 64, 52].map((w, i) => (
            <Skeleton key={i} className="h-7 rounded-full" style={{ width: w }} />
          ))}
        </div>
      </div>

      <ProjectsGridSkeleton />
    </div>
  );
}

export function ProjectsGridSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-pen-card-border p-4"
            style={fade(i, 0.07)}
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-4 w-[55%]" />
              <Skeleton className="ml-auto h-5 w-16 rounded-full" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[75%]" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-14" />
              <div className="ml-auto flex items-center gap-1">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-6 w-6 rounded-full" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectDetailSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ProjectDetailHeaderSkeleton />
      <ProjectDetailSectionsSkeleton />
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export function TimelinePageSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-pen-card-border bg-pen-card px-4 py-2.5 sm:px-6 xl:px-8">
        <PageHeader
          title="Timeline"
          icon={CalendarDays}
          iconClassName="text-pen-blue"
          badge={<Skeleton className="h-6 w-28 rounded-full" />}
          actions={
            <>
              {[72, 88, 64].map((w, i) => (
                <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />
              ))}
            </>
          }
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-4 flex items-center gap-2">
          {[72, 88, 64].map((w, i) => (
            <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />
          ))}
        </div>
        <Skeleton className="mb-4 h-10 w-full rounded-lg" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-pen-card-border py-3" style={fade(i, 0.05)}>
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-28 shrink-0" />
            <Skeleton
              className="h-7 rounded-md"
              style={{ marginLeft: `${(i % 4) * 32}px`, width: `${160 - (i % 3) * 24}px` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Ticket detail ─────────────────────────────────────────────────────────────

export function TicketDetailSkeleton({
  showDrawerChrome = false,
}: {
  showDrawerChrome?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-pen-bg">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-4 pt-[22px]">
        <div className="w-full space-y-3.5 px-8">
          {/* ID row + actions */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3 w-40" />
            <span className="flex-1" />
            {showDrawerChrome && <Skeleton className="size-6 rounded-md" />}
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="size-6 rounded-md" />
          </div>

          {/* Title */}
          <Skeleton className="h-7 w-[85%] max-w-xl" />

          {/* Status + priority pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-14 rounded-full" />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2 rounded-lg border border-pen-card-border p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-3" style={{ width: `${100 - i * 10}%` }} />
            ))}
          </div>

          {/* Activity / comments header */}
          <div className="flex items-center gap-3 pt-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-px flex-1" />
          </div>

          {/* Comment input */}
          <Skeleton className="h-20 w-full rounded-lg" />

          {/* Comment rows */}
          {[0.9, 0.7, 0.5].map((opacity, i) => (
            <div key={i} className="flex gap-3" style={{ opacity }}>
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-3 w-[75%]" />
                <Skeleton className="h-3 w-[55%]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right sidebar — matches 300px ticket detail aside */}
      <aside className="hidden w-[300px] shrink-0 flex-col overflow-hidden border-l border-pen-card-border bg-pen-card lg:flex">
        {showDrawerChrome && (
          <div className="flex h-[40px] shrink-0 items-center justify-end px-3">
            <Skeleton className="size-7 rounded-full" />
          </div>
        )}
        <div className="flex flex-col gap-[14px] px-5 pb-[18px] pt-[14px]">
          {["Created by", "Status", "Assignee", "Due date", "Time logged"].map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-8 w-full rounded-md" />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

export function DescriptionHydrating() {
  return (
    <div className="flex flex-col gap-2 py-0.5">
      {[100, 92, 84, 68].map((width, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: `${width}%`, opacity: Math.max(0.35, 1 - i * 0.15) }}
        />
      ))}
    </div>
  );
}

export function TicketTabContentHydrating({
  activeTab,
}: {
  activeTab: "conversation" | "activity";
}) {
  if (activeTab === "activity") {
    return (
      <div className="space-y-2 py-1">
        {[0.9, 0.7, 0.5].map((opacity, i) => (
          <div key={i} className="flex h-7 items-center gap-2" style={{ opacity }}>
            <Skeleton className="size-3 shrink-0 rounded-full" />
            <Skeleton className="h-3 flex-1 max-w-md" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full rounded-lg" />
      {[0.9, 0.7, 0.5].map((opacity, i) => (
        <div key={i} className="flex gap-3" style={{ opacity }}>
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[85%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

export function InboxPageSkeleton() {
  return (
    <div className="h-full overflow-y-auto px-5 py-5 sm:px-8 lg:px-12">
      <PageHeader
        className="mb-4"
        title="Notifications"
        icon={Bell}
        iconClassName="text-pen-blue"
        description="Mentions, assignments, comments, and team updates"
      />
      <div className="mb-4 flex w-fit gap-0.5 rounded-lg border border-pen-card-border bg-pen-card p-0.5">
        {["All", "Unread", "Mentions", "Assigned"].map((label) => (
          <span
            key={label}
            className="flex h-7 items-center rounded-md px-2.5 font-sans text-[12px] text-pen-muted"
          >
            {label}
          </span>
        ))}
      </div>
      <InboxFeedSkeleton />
    </div>
  );
}

export function InboxFeedSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      <Skeleton className="mb-2 h-3 w-12" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="mb-1 flex items-start gap-3 rounded-lg border border-pen-card-border px-4 py-[9px]"
          style={fade(i, 0.08)}
        >
          <Skeleton className="mt-0.5 size-[26px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-5 w-24 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────────

export function ProfileStatsSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="pen-page-header shrink-0 border-b border-pen-card-border bg-pen-card">
        <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-56" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="h-8 w-[140px] rounded-md" />
            <Skeleton className="h-8 w-[130px] rounded-md" />
            <Skeleton className="h-8 w-[130px] rounded-md" />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="pen-page-pad flex flex-col gap-4 lg:flex-1 lg:overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {[72, 56, 80, 64, 68].map((w, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" style={{ width: w + 20 }} />
            ))}
          </div>
          <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-4">
            <Skeleton className="mb-3 h-4 w-36" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="mb-3 flex flex-col gap-1.5 last:mb-0">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-4">
            <Skeleton className="mb-3 h-4 w-28" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn("flex h-12 items-center gap-2.5", ROW_BORDER)}>
                <Skeleton className="size-7 rounded-full" />
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-44" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Manager ───────────────────────────────────────────────────────────────────

function PersonReportCardSkeleton({ style }: { style?: CSSProperties }) {
  return (
    <div
      className="flex flex-col gap-4 rounded-2xl border border-pen-card-border bg-pen-card p-5 shadow-pen-card"
      style={style}
    >
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-[72px] shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-44" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {["Open", "Late", "Review", "Done"].map((label) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1 rounded-xl bg-pen-surface/60 py-2.5"
          >
            <Skeleton className="h-5 w-6" />
            <span className="font-sans text-[9.5px] font-medium uppercase tracking-wide text-pen-subtle">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PeopleReportsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 min-[560px]:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
      {Array.from({ length: 6 }).map((_, i) => (
        <PersonReportCardSkeleton key={i} style={fade(i, 0.08)} />
      ))}
    </div>
  );
}

export function ManagerDashboardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="pen-page-header shrink-0">
        <div className="flex items-start justify-between gap-4 pb-4">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="mt-2 h-9 w-36" />
            </div>
            <div className="flex overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
              {[56, 48, 60].map((w, i) => (
                <div key={i} className="flex items-center gap-2 border-r border-pen-card-border px-4 py-2 last:border-r-0">
                  <Skeleton className="h-5 w-6" />
                  <Skeleton className="h-3" style={{ width: w - 16 }} />
                </div>
              ))}
            </div>
          </div>
          <div className="hidden flex-col items-end gap-1 sm:flex">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden px-4 pb-4 sm:px-6 sm:pb-6 xl:px-8">
        <div className="flex flex-[3] flex-col overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
          <div className="flex items-center gap-2 border-b border-pen-card-border px-4 py-2.5">
            <Skeleton className="size-[7px] rounded-full" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="ml-auto h-3 w-4" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-pen-card-border/50 px-4 py-3 last:border-b-0" style={fade(i)}>
              <Skeleton className="size-7 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4 max-w-[240px]" />
                <Skeleton className="h-3 w-1/2 max-w-[160px]" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>

        <div className="flex flex-[2] min-h-0 flex-col gap-4">
          {[0, 1].map((panel) => (
            <div key={panel} className="flex flex-1 flex-col overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
              <div className="flex items-center gap-2 border-b border-pen-card-border px-4 py-2.5">
                <Skeleton className="size-[7px] rounded-full" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="ml-auto h-3 w-4" />
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-pen-card-border/50 px-4 py-3 last:border-b-0">
                  <Skeleton className="size-7 rounded-full" />
                  <Skeleton className="h-3.5 flex-1" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Departments ───────────────────────────────────────────────────────────────

export function DepartmentsPageSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-pen-card-border bg-pen-card/50 px-6 py-6 sm:px-10">
        <div className="mb-5 flex items-start gap-3">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-72" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-2xl border border-pen-card-border p-5">
              <Skeleton className="size-8 rounded-xl" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </div>
      </div>
      <div className="px-6 py-6 sm:px-10">
        <Skeleton className="mb-4 h-5 w-40" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" style={fade(i, 0.08)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Time ──────────────────────────────────────────────────────────────────────

export function MyTimePageSkeleton() {
  return (
    <div className="pen-page-pad flex h-full flex-col gap-[18px] overflow-y-auto">
      <PageHeader
        title="My Time"
        icon={Timer}
        iconClassName="text-pen-blue"
        description="Track time against tasks. Logged automatically to the ticket and your timesheet."
        clampDescription
      />
      <MyTimeSectionsSkeleton />
    </div>
  );
}

export function TeamTimePageSkeleton() {
  return (
    <div className="pen-page-pad flex h-full flex-col gap-4 overflow-y-auto">
      <PageHeader
        title="Reports"
        icon={ChartColumn}
        iconClassName="text-pen-blue"
        description="Time and delivery across your team and projects — an overview of where the hours go."
        clampDescription
        actions={
          <>
            <span className="flex h-[30px] w-[160px] shrink-0 items-center justify-between gap-2 rounded-md border border-pen-card-border bg-pen-card px-3 font-sans text-[11.5px] font-semibold text-pen-foreground">
              All projects
            </span>
            <span className="flex h-[30px] w-[180px] shrink-0 items-center justify-between gap-2 rounded-md border border-pen-card-border bg-pen-card px-3 font-sans text-[11.5px] font-semibold text-pen-foreground">
              Last 30 days
            </span>
          </>
        }
      />
      <ReportsSectionsSkeleton />
    </div>
  );
}

export function ReportsSectionsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TeamTimeStatsRowSkeleton count={4} />
      </div>

      <div className="grid auto-rows-fr grid-cols-1 gap-3.5 md:grid-cols-3">
        {["STATUS", "PRIORITY", "OPEN VS CLOSED"].map((title) => (
          <div key={title} className="rounded-xl border border-pen-card-border bg-pen-card p-4">
            <p className="mb-4 font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
              {title}
            </p>
            <div className="flex items-center gap-4">
              <Skeleton className="size-24 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-[80%]" />
                <Skeleton className="h-3 w-[60%]" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid auto-rows-fr grid-cols-1 gap-3.5 md:grid-cols-3">
        {["CREATED", "RESOLVED", "TOP CONTRIBUTORS"].map((title) => (
          <div key={title} className="rounded-xl border border-pen-card-border bg-pen-card p-4">
            <p className="mb-3 font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
              {title}
            </p>
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="flex items-center gap-2.5" style={fade(j, 0.08)}>
                  <Skeleton className="size-[30px] rounded-full" />
                  <Skeleton className="h-2 flex-1 rounded-full" />
                  <Skeleton className="h-3 w-8" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid auto-rows-fr grid-cols-1 gap-3.5 md:grid-cols-2">
        {["TICKETS BY PROJECT", "TICKETS BY MODULE"].map((title) => (
          <div key={title} className="rounded-xl border border-pen-card-border bg-pen-card p-4">
            <p className="mb-3 font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
              {title}
            </p>
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-2" style={fade(j, 0.08)}>
                  <Skeleton className="h-2.5 flex-1 rounded-full" />
                  <Skeleton className="h-3 w-10" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid auto-rows-fr grid-cols-1 gap-3.5 md:grid-cols-2">
        {["OPEN WORKLOAD", "BUG RESOLUTION SPEED"].map((title) => (
          <div key={title} className="rounded-xl border border-pen-card-border bg-pen-card p-4">
            <p className="mb-3 font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
              {title}
            </p>
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="flex items-center gap-2.5" style={fade(j, 0.08)}>
                  <Skeleton className="size-[30px] rounded-full" />
                  <Skeleton className="h-2 flex-1 rounded-full" />
                  <Skeleton className="h-3 w-8" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-pen-card-border bg-pen-card">
        <div className="border-b border-pen-card-border px-4 py-2.5 sm:px-[18px]">
          <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
            TIME BY PROJECT
          </p>
        </div>
        <div className="px-4 py-3 sm:px-[18px]">
          <Skeleton className="mb-3 h-3 w-full max-w-md rounded-full" />
          <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-3 w-20" />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 border-y border-pen-card-border/60 px-4 py-1.5 sm:px-[18px]">
          <Skeleton className="size-2.5 shrink-0 rounded-full" />
          <Skeleton className="h-2.5 min-w-0 flex-1" />
          <Skeleton className="hidden h-2.5 w-16 sm:block" />
          <Skeleton className="hidden h-2.5 w-32 md:block" />
          <Skeleton className="h-2.5 w-[72px]" />
          <Skeleton className="h-2.5 w-9" />
        </div>
        <div className="divide-y divide-pen-card-border/60">
          {Array.from({ length: 4 }).map((_, j) => (
            <div
              key={j}
              className="flex items-center gap-4 px-4 py-2.5 sm:px-[18px]"
              style={fade(j, 0.08)}
            >
              <Skeleton className="size-2.5 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 min-w-0 flex-1" />
              <Skeleton className="hidden h-3 w-16 sm:block" />
              <Skeleton className="hidden h-2 w-32 md:block" />
              <Skeleton className="h-3.5 w-[72px]" />
              <Skeleton className="h-3.5 w-9" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function ModulesPageSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex w-full flex-col gap-5 px-4 py-5 sm:px-5">
        <PageHeader
          title="Modules"
          icon={Boxes}
          iconClassName="text-pen-blue"
          description="Ticket overview per module — counts reflect current state; the date range changes the created/resolved figures."
          actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 overflow-hidden rounded-lg border border-pen-card-border bg-pen-surface">
              {["All time", "Today", "7 days", "30 days", "90 days"].map((label, i) => (
                <span
                  key={label}
                  className={
                    i === 0
                      ? "bg-pen-card px-3 font-sans text-[12px] font-semibold text-pen-foreground shadow-sm"
                      : "px-3 font-sans text-[12px] text-pen-muted"
                  }
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="flex h-8 items-center gap-1 rounded-lg border border-pen-card-border bg-pen-surface px-1.5">
              {["Urgent", "Critical", "High", "Medium", "Low"].map((p) => (
                <span key={p} className="px-2 py-1 font-sans text-[12px] text-pen-muted">
                  {p}
                </span>
              ))}
            </div>
            <span className="flex h-8 items-center gap-1.5 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[12px] font-medium text-pen-muted">
              Urgent only
            </span>
          </div>
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          {[96, 110, 88].map((w, i) => (
            <Skeleton key={i} className="h-9 rounded-lg" style={{ width: w }} />
          ))}
        </div>
        <ModulesSectionsSkeleton />
      </div>
    </div>
  );
}

export function ModulesSectionsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {["Total tickets", "Urgent", "Critical", "Blocked", "Resolved in range"].map((label, i) => (
          <div
            key={label}
            className="flex min-w-[130px] flex-col gap-1.5 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3"
            style={fade(i, 0.08)}
          >
            <Skeleton className="h-6 w-10" />
            <p className="font-sans text-[11.5px] text-pen-muted">{label}</p>
          </div>
        ))}
      </div>

      <h2 className="border-t border-pen-card-border pt-4 font-sans text-[15px] font-semibold text-pen-foreground">
        By module
      </h2>

      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-pen-card-border bg-pen-card p-4"
          style={fade(i, 0.08)}
        >
          <div className="mb-3 flex items-center gap-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="ml-auto h-7 w-7 rounded-md" />
          </div>
          <Skeleton className="mb-3 h-2 w-full rounded-full" />
          <div className="flex flex-wrap gap-2">
            {[48, 56, 40, 64].map((w) => (
              <Skeleton key={w} className="h-6 rounded-md" style={{ width: w }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Sprints ───────────────────────────────────────────────────────────────────

export function SprintsPageSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="pen-page-pad flex h-full flex-col gap-0 overflow-hidden">
        <PageHeader
          title="Sprints"
          icon={Zap}
          iconClassName="text-pen-blue"
          description="Manage and track sprint cycles across projects."
          actions={
            <>
              <Skeleton className="h-[30px] w-24 rounded-md" />
              <Skeleton className="h-[30px] w-28 rounded-md" />
            </>
          }
        />
        <div className="mt-4 flex gap-4 border-b border-pen-card-border sm:mt-5">
          <Skeleton className="mb-2 h-4 w-20" />
          <Skeleton className="mb-2 h-4 w-24" />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-pen-card-border bg-pen-card p-4">
              <Skeleton className="mb-2 h-4 w-32" />
              <Skeleton className="mb-3 h-3 w-48" />
              <Skeleton className="mb-2 h-1.5 w-full rounded-full" />
              <div className="mt-3 flex gap-3">
                <Skeleton className="h-8 w-16 rounded-md" />
                <Skeleton className="h-8 w-16 rounded-md" />
                <Skeleton className="h-8 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex-1 overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-pen-card-border/60 px-4 py-3 last:border-b-0" style={fade(i)}>
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="ml-auto h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Mentions ──────────────────────────────────────────────────────────────────

export function MentionsPageSkeleton() {
  return (
    <div className="pen-page-pad flex h-full flex-col gap-4 overflow-y-auto">
      <div className="space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      <div className="flex gap-2">
        {[48, 56].map((w, i) => (
          <Skeleton key={i} className="h-7 rounded-full" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-[10px] border border-pen-card-border bg-pen-card px-[18px] py-3.5"
          style={fade(i, 0.08)}
        >
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-3 w-48" />
          <div className="rounded-lg bg-pen-bg px-3 py-2.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="mt-1.5 h-3" style={{ width: "80%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function SettingsPageSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-6 py-8 sm:px-10">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-pen-card-border p-4" style={fade(i, 0.06)}>
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Intake forms ──────────────────────────────────────────────────────────────

export function IntakeFormsPageSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
        <div className="flex items-center gap-4 border-b border-pen-card-border px-4 py-3">
          {[120, 80, 72, 64, 56, 48].map((w, i) => (
            <Skeleton key={i} className="h-3 shrink-0" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-pen-card-border/60 px-4 py-3.5 last:border-b-0"
            style={fade(i, 0.07)}
          >
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-8" />
            <Skeleton className="ml-auto h-7 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function IntakeFieldBuilderSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      </div>
      <div className="rounded-xl border border-pen-card-border bg-pen-card p-4">
        <Skeleton className="mb-4 h-4 w-24" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="mb-2 flex items-center gap-3 rounded-lg border border-pen-card-border px-3 py-3 last:mb-0"
            style={fade(i, 0.08)}
          >
            <Skeleton className="size-4 shrink-0" />
            <Skeleton className="size-6 rounded-md" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        ))}
        <Skeleton className="mt-3 h-9 w-full rounded-md" />
      </div>
    </div>
  );
}

export function IntakeSubmissionsSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-28" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>
      <div className="overflow-hidden rounded-[10px] border border-pen-card-border bg-pen-card px-[22px] pt-4 pb-2">
        <div className="flex flex-col gap-3 py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4"
              style={{ opacity: 1 - i * 0.12 }}
            >
              <Skeleton className="size-3.5 rounded" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-52" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function IntakeSubmissionDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-56" />
        </div>
      </div>
      <div className="rounded-xl border border-pen-card-border bg-pen-card p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mb-4 flex flex-col gap-1.5 last:mb-0">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4" style={{ width: `${60 + (i % 3) * 15}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Activity ──────────────────────────────────────────────────────────────────

export function ActivityPageSkeleton() {
  return (
    <div className="h-full overflow-y-auto px-5 py-6 sm:px-8 lg:px-12">
      <PageHeader
        className="mb-5"
        title="Activity"
        icon={Activity}
        iconClassName="text-pen-blue"
        description="Every recorded movement across tickets, members, and projects in this department"
      />

      <div className="mb-4 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-sans text-[11.5px] font-medium text-pen-muted">Range</span>
          <div className="flex gap-0.5 rounded-lg border border-pen-card-border bg-pen-surface p-0.5">
            {["Today", "Yesterday", "Last 7 days", "Last 30 days", "Custom"].map((label) => (
              <span
                key={label}
                className="rounded-md px-3 py-1 font-sans text-[11.5px] font-medium text-pen-muted"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ActivityFeedSkeleton />
    </div>
  );
}

export function ActivityFeedSkeleton() {
  return (
    <>
      <div className="mb-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-pen-card-border bg-pen-card-border sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 bg-pen-card px-4 py-3">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-6 w-10" />
          </div>
        ))}
      </div>

      <div className="mb-5 flex items-center gap-2">
        {[88, 96, 80, 72].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-lg" style={{ width: w }} />
        ))}
      </div>

      <div className="flex flex-col gap-5">
        {(["Today", "Yesterday"] as const).map((label, gi) => (
          <div key={label} className="flex flex-col">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="font-sans text-[11px] font-medium uppercase tracking-wide text-pen-subtle">
                {label}
              </span>
              <div className="h-px flex-1 bg-pen-card-border/50" />
            </div>
            <div className="divide-y divide-pen-card-border/60 overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
              {Array.from({ length: gi === 0 ? 5 : 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3.5 px-4 py-3" style={fade(i, 0.08)}>
                  <Skeleton className="size-[30px] shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="ml-auto h-3 w-12" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-16 rounded-md" />
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="h-4 w-14 rounded-md" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Settings table / form shells ──────────────────────────────────────────────

export function SettingsTablePageSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-6 py-8 sm:px-10">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
        <div className="flex items-center gap-4 border-b border-pen-card-border px-4 py-3">
          {[100, 72, 88, 64, 56].map((w, i) => (
            <Skeleton key={i} className="h-3 shrink-0" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-pen-card-border/60 px-4 py-3.5 last:border-b-0"
            style={fade(i, 0.07)}
          >
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="ml-auto h-7 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsFormPageSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-6 py-8 sm:px-10">
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <div className="max-w-2xl space-y-4 rounded-xl border border-pen-card-border bg-pen-card p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5" style={fade(i, 0.08)}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="mt-2 h-9 w-28 rounded-md" />
      </div>
    </div>
  );
}

export function DocsPageSkeleton() {
  return (
    <div className="pen-page-pad h-full overflow-y-auto">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-pen-card-border bg-pen-card p-4"
            style={fade(i, 0.08)}
          >
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-4 w-[70%]" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[85%]" />
          </div>
        ))}
      </div>
    </div>
  );
}
