"use client";

import { useState } from "react";
import { ArrowRight, CalendarDays, ChevronDown } from "lucide-react";
import type { DateRange as DayPickerDateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatCalendarDate, parseCalendarDate } from "@/lib/ticket-datetime";
import { cn } from "@/lib/utils";

export const RANGE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last week" },
  { id: "30d", label: "Last month" },
  { id: "6m", label: "Last 6 months" },
  { id: "9m", label: "Last 9 months" },
  { id: "1y", label: "Last year" },
] as const;

export type PresetId = (typeof RANGE_PRESETS)[number]["id"];
export type ReportRange = { from: string; to: string };

export function presetRange(id: PresetId): ReportRange {
  const to = new Date();
  const from = new Date();
  if (id === "today") {
    /* from/to stay on today */
  } else if (id === "7d") from.setDate(to.getDate() - 6);
  else if (id === "30d") from.setDate(to.getDate() - 29);
  else if (id === "6m") from.setMonth(to.getMonth() - 6);
  else if (id === "9m") from.setMonth(to.getMonth() - 9);
  else if (id === "1y") from.setFullYear(to.getFullYear() - 1);
  return { from: formatCalendarDate(from), to: formatCalendarDate(to) };
}

export function formatRangeLabel(from: string, to: string): string {
  const fmt = (iso: string) =>
    parseCalendarDate(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(from)} – ${fmt(to)}`;
}

/** Compact span for the preset rail: "13 Oct", "7 – 13 Oct", "14 Sep – 13 Oct", "13 Oct 25 – 13 Oct 26". */
function shortSpan({ from, to }: ReportRange): string {
  const a = parseCalendarDate(from);
  const b = parseCalendarDate(to);
  const dm = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (from === to) return dm(b);
  if (a.getFullYear() !== b.getFullYear()) {
    const dmy = (d: Date) => `${dm(d)} ${String(d.getFullYear()).slice(2)}`;
    return `${dmy(a)} – ${dmy(b)}`;
  }
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${dm(b)}`;
  return `${dm(a)} – ${dm(b)}`;
}

function dayCount(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function toPickerRange(range: ReportRange): DayPickerDateRange {
  return { from: parseCalendarDate(range.from), to: parseCalendarDate(range.to) };
}

function DateSlot({ label, date }: { label: string; date?: Date }) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 transition-colors",
        date ? "border-sts-card-border bg-[var(--sts-card-solid)]" : "border-dashed border-sts-card-border",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-sts-subtle">{label}</p>
      <p className={cn("truncate text-[12.5px] font-semibold tabular-nums", date ? "text-sts-foreground" : "text-sts-subtle")}>
        {date
          ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
          : "Pick a day"}
      </p>
    </div>
  );
}

export function ReportDateRangePicker({
  presetId,
  range,
  onChange,
}: {
  presetId: PresetId | "custom";
  range: ReportRange;
  onChange: (presetId: PresetId | "custom", range: ReportRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayPickerDateRange | undefined>();
  // Hovering a preset previews its span on the calendar without committing it.
  const [preview, setPreview] = useState<PresetId | null>(null);

  const shown = preview ? toPickerRange(presetRange(preview)) : draft;
  const complete = !!draft?.from && !!draft?.to;
  const triggerLabel =
    presetId === "custom"
      ? shortSpan(range)
      : RANGE_PRESETS.find((p) => p.id === presetId)?.label ?? "Last month";

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(toPickerRange(range));
    setPreview(null);
    setOpen(next);
  };

  const commitPreset = (id: PresetId) => {
    onChange(id, presetRange(id));
    setOpen(false);
  };

  const commitCustom = () => {
    if (!draft?.from || !draft?.to) return;
    onChange("custom", { from: formatCalendarDate(draft.from), to: formatCalendarDate(draft.to) });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={`Report period: ${formatRangeLabel(range.from, range.to)}`}
        className="flex h-9 w-[180px] shrink-0 items-center gap-2 rounded-lg border border-sts-card-border bg-[var(--sts-card-solid)] px-3 font-sans text-[11.5px] font-semibold text-sts-foreground outline-none hover:bg-sts-bg focus-visible:ring-2 focus-visible:ring-sts-blue focus-visible:ring-offset-2 data-popup-open:bg-sts-bg"
      >
        <CalendarDays className="size-3.5 shrink-0 text-sts-subtle" />
        <span className="flex-1 truncate text-left">{triggerLabel}</span>
        <ChevronDown className="size-3 shrink-0 text-sts-subtle" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(calc(100vw-2rem),35rem)] gap-0 overflow-hidden rounded-xl border border-sts-card-border bg-[var(--sts-card-solid)] p-0 font-sans shadow-xl ring-0"
      >
        <div className="flex flex-col sm:flex-row">
          {/* Quick ranges */}
          <div
            className="flex shrink-0 flex-col border-b border-sts-card-border bg-sts-bg/60 p-2 sm:w-52 sm:border-r sm:border-b-0"
            onMouseLeave={() => setPreview(null)}
          >
            <p className="px-2 pt-1 pb-2 text-[10px] font-medium uppercase tracking-wider text-sts-subtle">
              Quick ranges
            </p>
            <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-1">
              {RANGE_PRESETS.map((p) => {
                const active = presetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => commitPreset(p.id)}
                    onMouseEnter={() => setPreview(p.id)}
                    onFocus={() => setPreview(p.id)}
                    onBlur={() => setPreview(null)}
                    className={cn(
                      "group relative flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sts-blue",
                      active ? "bg-sts-blue-tint" : "hover:bg-sts-surface",
                    )}
                  >
                    {active && (
                      <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sts-blue" />
                    )}
                    <span className={cn("text-[12.5px]", active ? "font-semibold text-sts-blue" : "text-sts-foreground")}>
                      {p.label}
                    </span>
                    <span className="truncate text-[10.5px] tabular-nums text-sts-subtle">
                      {shortSpan(presetRange(p.id))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom range */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5 px-3 pt-3">
              <DateSlot label="From" date={shown?.from} />
              <ArrowRight className="size-3.5 shrink-0 text-sts-subtle" />
              <DateSlot label="To" date={shown?.to} />
            </div>
            <Calendar
              mode="range"
              selected={shown}
              onSelect={(next) => {
                setPreview(null);
                setDraft(next);
              }}
              defaultMonth={parseCalendarDate(range.to)}
              numberOfMonths={1}
              className="mx-auto w-full px-3 py-2 [--cell-size:--spacing(8)]"
              classNames={{
                root: "w-full",
                today: "font-semibold text-sts-blue",
              }}
            />
            <div className="flex items-center gap-2 border-t border-sts-card-border px-3 py-2.5">
              <p className="flex-1 text-[11.5px] tabular-nums text-sts-muted">
                {shown?.from && shown?.to
                  ? `${dayCount(shown.from, shown.to)} ${dayCount(shown.from, shown.to) === 1 ? "day" : "days"}`
                  : "Pick an end day"}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 rounded-lg px-3 text-[12px] font-medium text-sts-muted outline-none transition-colors hover:bg-sts-surface hover:text-sts-foreground focus-visible:ring-2 focus-visible:ring-sts-blue"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!complete}
                onClick={commitCustom}
                className="h-8 rounded-lg bg-sts-blue px-3.5 text-[12px] font-semibold text-sts-blue-fg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sts-blue focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-sts-surface disabled:text-sts-subtle"
              >
                Apply range
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
