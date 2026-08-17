"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, X, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { formatCalendarDate } from "@/lib/ticket-datetime";

export type DateRange = { from: string; to: string } | null;

const PRESETS = [
  { id: "today", label: "Today",         days: 0   },
  { id: "7d",    label: "Last 7 days",   days: 7   },
  { id: "30d",   label: "Last 30 days",  days: 30  },
  { id: "3m",    label: "Last 3 months", days: 90  },
  { id: "6m",    label: "Last 6 months", days: 180 },
] as const;

const FUTURE_PRESETS = [
  { id: "today", label: "Today",         days: 0   },
  { id: "7d",    label: "Next 7 days",   days: 7   },
  { id: "30d",   label: "Next 30 days",  days: 30  },
  { id: "3m",    label: "Next 3 months", days: 90  },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

function isoDate(d: Date) {
  return formatCalendarDate(d);
}

export function presetRange(days: number): DateRange {
  const to   = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);
  return { from: isoDate(from), to: isoDate(to) };
}

function futurePresetRange(days: number): DateRange {
  const from = new Date();
  const to   = new Date();
  to.setDate(from.getDate() + days);
  return { from: isoDate(from), to: isoDate(to) };
}

export function formatRangeLabel(range: DateRange): string {
  if (!range) return "Time range";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(range.from)} – ${fmt(range.to)}`;
}

export function DateRangeDropdown({
  value,
  onChange,
  onClear,
  triggerClassName,
  placeholder = "Time range",
  icon: Icon = CalendarDays,
  future = false,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  onClear: () => void;
  triggerClassName?: string;
  /** Trigger label shown when no range is set. */
  placeholder?: string;
  /** Trigger icon. */
  icon?: LucideIcon;
  /** Use forward-looking presets (Next 7 days…) instead of past ones. */
  future?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetId | null>(null);
  const presets = future ? FUTURE_PRESETS : PRESETS;
  const defaultFrom = future
    ? isoDate(new Date())
    : isoDate(new Date(Date.now() - 30 * 86_400_000));
  const defaultTo = future
    ? isoDate(new Date(Date.now() + 30 * 86_400_000))
    : isoDate(new Date());
  const [customFrom, setCustomFrom] = useState(defaultFrom);
  const [customTo,   setCustomTo]   = useState(defaultTo);
  const hasValue = value !== null;

  function applyPreset(preset: { id: PresetId; days: number }) {
    setActivePreset(preset.id);
    onChange(future ? futurePresetRange(preset.days) : presetRange(preset.days));
    setOpen(false);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    setActivePreset(null);
    onChange({ from: customFrom, to: customTo });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-sans text-[12px] transition-colors",
          hasValue
            ? "border-pen-blue bg-pen-blue-tint font-semibold text-pen-id"
            : "border-pen-card-border bg-transparent text-pen-muted hover:border-pen-id hover:text-pen-foreground",
          triggerClassName,
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        <span>{hasValue ? formatRangeLabel(value) : placeholder}</span>
        {hasValue ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onClear(); setActivePreset(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onClear(); setActivePreset(null); }
            }}
            className="ml-0.5 cursor-pointer hover:opacity-70"
            aria-label="Clear date range"
          >
            <X className="size-3" />
          </span>
        ) : (
          <ChevronDown className="size-3 shrink-0" />
        )}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 overflow-hidden rounded-xl border border-pen-card-border bg-pen-bg p-0 shadow-xl"
      >
        <div className="border-b border-pen-card-border bg-pen-surface/60 px-3 py-3 dark:bg-white/[0.03]">
          <p className="mb-2.5 font-sans text-[11.5px] font-semibold uppercase tracking-[1.1px] text-pen-subtle">
            Quick select
          </p>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  "rounded-md border px-2.5 py-1 font-sans text-[11.5px] font-medium transition-colors",
                  activePreset === p.id
                    ? "border-pen-blue bg-pen-blue text-white dark:text-gray-900"
                    : "border-pen-card-border bg-pen-bg text-pen-muted hover:border-pen-id hover:text-pen-foreground dark:bg-white/5",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3 py-3">
          <p className="mb-2.5 font-sans text-[11.5px] font-semibold uppercase tracking-[1.1px] text-pen-subtle">
            Custom range
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["From", "To"] as const).map((label) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="font-sans text-[11.5px] text-pen-subtle">{label}</span>
                <input
                  type="date"
                  value={label === "From" ? customFrom : customTo}
                  onChange={(e) =>
                    label === "From" ? setCustomFrom(e.target.value) : setCustomTo(e.target.value)
                  }
                  className="h-8 w-full rounded-lg border border-pen-card-border bg-pen-surface px-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-id dark:bg-white/5"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={applyCustom}
            className="mt-3 w-full rounded-lg bg-pen-blue py-2 font-sans text-[12px] font-semibold text-white transition-opacity hover:opacity-90 dark:text-gray-900"
          >
            Apply range
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
