"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, Check } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  PEOPLE_RANGE_PRESETS,
  isoDate,
  type PeopleRangePreset,
} from "./people-range";

export function PeopleRangePicker({
  preset,
  label,
}: {
  preset: PeopleRangePreset;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<DateRange | undefined>();
  const [pending, startTransition] = useTransition();

  const go = (params: Record<string, string>) => {
    const p = new URLSearchParams(params);
    setOpen(false);
    startTransition(() => router.replace(`/manager/people?${p.toString()}`));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-[30px] w-[190px] shrink-0 items-center justify-between gap-2 rounded-md border border-pen-card-border bg-pen-card px-3 font-sans text-[11.5px] font-semibold text-pen-foreground outline-none hover:bg-pen-bg",
          pending && "opacity-60",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0 text-pen-subtle" />
          <span className="truncate first-letter:uppercase">{label}</span>
        </span>
        <ChevronDown className="size-3 shrink-0 text-pen-subtle" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 rounded-xl border border-pen-card-border bg-pen-bg p-0 shadow-xl"
      >
        <div className="p-1.5">
          {PEOPLE_RANGE_PRESETS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => go({ range: o.id })}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-sans text-[12.5px] text-pen-foreground transition-colors hover:bg-pen-surface"
            >
              <span className="flex-1">{o.label}</span>
              {preset === o.id && <Check className="size-3.5 text-pen-blue" />}
            </button>
          ))}
        </div>
        <div className="border-t border-pen-card-border p-3">
          <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
            Custom range
          </p>
          <Calendar
            mode="range"
            selected={custom}
            onSelect={setCustom}
            numberOfMonths={1}
          />
          <button
            type="button"
            disabled={!custom?.from || !custom?.to || pending}
            onClick={() => {
              if (!custom?.from || !custom?.to) return;
              go({ range: "custom", from: isoDate(custom.from), to: isoDate(custom.to) });
            }}
            className="mt-2 h-8 w-full rounded-md bg-pen-blue px-3 font-sans text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-gray-900"
          >
            Apply custom range
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
