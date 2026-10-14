"use client";

import { useEffect, useState } from "react";
import { Globe2, LocateFixed } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  TIMEZONES,
  formatTimeInTimezone,
  formatTimezoneLabel,
  getTimezoneOffsetLabel,
  getTimezoneOptions,
} from "@/lib/timezones";
import { cn } from "@/lib/utils";

export function TimezoneSelect({
  value,
  onChange,
  className,
  triggerClassName,
}: {
  value: string;
  onChange: (timezone: string) => void;
  className?: string;
  triggerClassName?: string;
}) {
  const [options, setOptions] = useState(() =>
    TIMEZONES.some((timezone) => timezone.value === value)
      ? TIMEZONES
      : [{ value, label: formatTimezoneLabel(value) }, ...TIMEZONES],
  );
  const [detectedTimezone, setDetectedTimezone] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const refresh = () => {
      const current = new Date();
      const dynamicOptions = getTimezoneOptions(current);
      setOptions(
        dynamicOptions.some((timezone) => timezone.value === value)
          ? dynamicOptions
          : [{ value, label: formatTimezoneLabel(value) }, ...dynamicOptions],
      );
      setNow(current);
    };

    const initialTimer = window.setTimeout(() => {
      setDetectedTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? null);
      refresh();
    }, 0);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [value]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect
          value={value}
          onChange={onChange}
          options={options}
          searchable
          searchPlaceholder="Search city, region, or GMT offset…"
          emptyLabel="No timezone found"
          aria-label="Timezone"
          icon={Globe2}
          className={cn("w-72 bg-sts-surface", triggerClassName)}
          contentClassName="min-w-[min(22rem,calc(100vw-2rem))]"
        />
        {detectedTimezone && detectedTimezone !== value && (
          <button
            type="button"
            onClick={() => onChange(detectedTimezone)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-sts-card-border px-2.5 font-sans text-[11.5px] font-medium text-sts-muted transition-colors hover:border-sts-blue/40 hover:bg-sts-blue-tint hover:text-sts-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sts-blue"
          >
            <LocateFixed className="size-3.5" />
            Use my timezone
          </button>
        )}
      </div>
      <p className="flex items-center gap-1.5 font-sans text-[11px] text-sts-muted" aria-live="polite">
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        {now ? `${formatTimeInTimezone(value, now)} local time · ${getTimezoneOffsetLabel(value, now)}` : "Loading local time…"}
      </p>
    </div>
  );
}
