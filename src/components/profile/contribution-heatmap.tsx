"use client";

import { useMemo, useState } from "react";
import {
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ContributionCalendar,
  ContributionItem,
} from "@/lib/profile/contribution-buckets";

const WEEKS = 53;
const MS_DAY = 86400_000;
const COLS_TEMPLATE = `repeat(${WEEKS}, minmax(0, 1fr))`;
const ROWS_TEMPLATE = "repeat(7, minmax(0, 1fr))";

/** Local YYYY-MM-DD for a date (matches the keys produced server-side). */
function localKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function level(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

const LEVEL_CLASS: Record<number, string> = {
  0: "bg-pen-surface",
  1: "bg-emerald-500/30",
  2: "bg-emerald-500/55",
  3: "bg-emerald-500/80",
  4: "bg-emerald-500",
};

function longDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Day = { date: Date; key: string; count: number };

export function ContributionHeatmap({
  data,
  username,
}: {
  data: ContributionCalendar;
  username: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const { weeks, total, monthLabels } = useMemo(() => {
    // Grid ends on today's column; walk back to the Sunday that starts the
    // earliest visible week so every column is a full Sun–Sat week.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    // Move `end` to the Saturday of the current week so the last column is full.
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end.getTime() - (WEEKS * 7 - 1) * MS_DAY);

    const cols: Day[][] = [];
    let total = 0;
    const monthLabels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    let lastLabelCol = -Infinity;

    for (let w = 0; w < WEEKS; w++) {
      const col: Day[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getTime() + (w * 7 + d) * MS_DAY);
        const key = localKey(date);
        const count = date <= today ? (data[key]?.count ?? 0) : -1; // -1 = future
        if (count > 0) total += count;
        col.push({ date, key, count });
      }
      // Month label appears above the first week whose first day is a new month,
      // but only when there's room (GitHub drops labels < 3 columns apart so
      // narrow month boundaries don't overlap).
      const firstOfCol = col[0].date;
      if (firstOfCol.getMonth() !== lastMonth) {
        lastMonth = firstOfCol.getMonth();
        if (w - lastLabelCol >= 3) {
          monthLabels.push({ col: w, label: MONTH_NAMES[lastMonth] });
          lastLabelCol = w;
        }
      }
      cols.push(col);
    }

    return { weeks: cols, total, monthLabels };
  }, [data]);

  const selectedDay = selected ? data[selected] : undefined;
  const selectedDate = selected ? new Date(`${selected}T00:00:00`) : null;

  if (!username) return null;

  return (
    <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <GitBranch className="size-4 text-pen-subtle" />
        <p className="font-sans text-[13px] font-semibold text-pen-foreground">
          {total.toLocaleString()} contribution{total === 1 ? "" : "s"} in the last year
        </p>
      </div>

      <div className="flex flex-col gap-[3px]">
        {/* Month labels — share the week grid's tracks (spacer matches the
            weekday column) so each label sits above its week column. */}
        <div className="flex gap-[3px]">
          <div className="w-10 shrink-0" />
          <div
            className="grid flex-1 gap-[3px] text-[11px] leading-none text-pen-subtle"
            style={{ gridTemplateColumns: COLS_TEMPLATE }}
          >
            {weeks.map((_, w) => {
              const m = monthLabels.find((x) => x.col === w);
              return (
                <div key={w} className="whitespace-nowrap">
                  {m ? <span className="font-sans">{m.label}</span> : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-[3px]">
          {/* Weekday labels — 7 equal rows matching the cell rows so they line up */}
          <div
            className="grid w-10 shrink-0 gap-[3px] text-[11px] text-pen-subtle"
            style={{ gridTemplateRows: ROWS_TEMPLATE }}
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((lbl, i) => (
              <div key={i} className="flex items-center font-sans leading-none">
                {lbl}
              </div>
            ))}
          </div>

          {/* Week columns fill the remaining width; cells stay square */}
          <div
            className="grid flex-1 gap-[3px]"
            style={{ gridTemplateColumns: COLS_TEMPLATE }}
          >
            {weeks.map((col, w) => (
              <div
                key={w}
                className="grid gap-[3px]"
                style={{ gridTemplateRows: ROWS_TEMPLATE }}
              >
                {col.map((day) => {
                  const future = day.count < 0;
                  const clickable = day.count > 0;
                  return (
                    <button
                      key={day.key}
                      type="button"
                      disabled={!clickable}
                      onClick={() => setSelected(day.key)}
                      title={
                        future
                          ? undefined
                          : day.count === 0
                            ? `No contributions on ${longDate(day.date)}`
                            : `${day.count} contribution${day.count === 1 ? "" : "s"} on ${longDate(day.date)}`
                      }
                      className={cn(
                        "aspect-square w-full rounded-[2px] transition-shadow",
                        future
                          ? "bg-transparent"
                          : cn(
                              LEVEL_CLASS[level(day.count)],
                              day.count === 0 &&
                                "ring-1 ring-inset ring-pen-card-border/60",
                            ),
                        clickable && "cursor-pointer hover:ring-2 hover:ring-pen-id",
                        selected === day.key && "ring-2 ring-pen-id",
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-pen-subtle">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span
            key={l}
            className={cn(
              "size-[10px] rounded-[2px]",
              LEVEL_CLASS[l],
              l === 0 && "ring-1 ring-inset ring-pen-card-border/60",
            )}
          />
        ))}
        <span>More</span>
      </div>

      {/* Selected-day details */}
      {selectedDate && (
        <div className="mt-3 rounded-lg border border-pen-card-border bg-pen-surface/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-sans text-[12px] font-semibold text-pen-foreground">
              {longDate(selectedDate)}
              {selectedDay?.count
                ? ` · ${selectedDay.count} contribution${selectedDay.count === 1 ? "" : "s"}`
                : ""}
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="font-sans text-[11px] text-pen-subtle hover:text-pen-foreground"
            >
              Close
            </button>
          </div>
          {selectedDay?.items?.length ? (
            <ul className="flex flex-col gap-1.5">
              {selectedDay.items.map((item) => (
                <li key={itemKey(item)}>
                  <ContributionRow item={item} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-[12px] text-pen-subtle">
              No contributions on this day.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function itemKey(item: ContributionItem): string {
  return item.kind === "commit"
    ? `commit-${item.sha}`
    : `${item.kind}-${item.number}`;
}

function ContributionRow({ item }: { item: ContributionItem }) {
  const isCommit = item.kind === "commit";
  const Icon =
    item.kind === "commit"
      ? GitCommitHorizontal
      : item.kind === "pr_merged"
        ? GitMerge
        : GitPullRequest;
  const iconColor =
    item.kind === "pr_merged"
      ? "text-purple-400"
      : item.kind === "pr_opened"
        ? "text-emerald-400"
        : "text-pen-subtle";

  const label = isCommit
    ? item.message.split("\n")[0]
    : item.title;
  const prefix = isCommit
    ? item.sha.slice(0, 7)
    : `#${item.number}`;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-pen-card"
    >
      <Icon className={cn("mt-[1px] size-3.5 shrink-0", iconColor)} />
      <span className="min-w-0 font-sans text-[12px] text-pen-foreground">
        <span className="mr-1.5 font-mono text-[11px] text-pen-subtle">
          {prefix}
        </span>
        <span className="group-hover:underline">{label || "(no title)"}</span>
        {item.kind === "pr_merged" && (
          <span className="ml-1.5 text-[10px] text-purple-400">merged</span>
        )}
      </span>
    </a>
  );
}
