"use client";

import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SearchableSelectOption = {
  value: string;
  label: string;
  color?: string;
  disabled?: boolean;
};

const SIZE_CLASS = {
  sm: "h-8 text-[12px]",
  md: "h-9 text-[12.5px]",
  lg: "h-10 text-[13px]",
} as const;

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel = "No matches",
  searchable,
  disabled = false,
  icon: Icon,
  leadingDot = false,
  size = "md",
  name,
  "aria-label": ariaLabel,
  className = "w-full",
  contentClassName,
  highlightWhenSet = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Force search on/off. Default: on when there are more than 8 options. */
  searchable?: boolean;
  disabled?: boolean;
  icon?: React.ElementType;
  leadingDot?: boolean;
  size?: keyof typeof SIZE_CLASS;
  name?: string;
  "aria-label"?: string;
  className?: string;
  contentClassName?: string;
  /** Blue border/tint when a non-empty value is selected (filter-bar style). */
  highlightWhenSet?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value) ?? null;
  const showSearch = searchable ?? options.length > 8;
  const q = query.trim().toLowerCase();
  const filtered =
    showSearch && q
      ? options.filter((o) => o.label.toLowerCase().includes(q))
      : options;
  const active = highlightWhenSet && value !== "";

  return (
    <>
      {name != null && <input type="hidden" name={name} value={value} />}
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (disabled) return;
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "relative flex items-center gap-1.5 rounded-lg border px-2.5 font-sans transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50",
            SIZE_CLASS[size],
            active
              ? "border-pen-blue/40 bg-pen-blue-tint text-pen-foreground"
              : "border-pen-card-border bg-pen-card text-pen-foreground hover:border-pen-muted",
            leadingDot && "pl-[26px]",
            className,
          )}
        >
          {Icon && (
            <Icon
              className={cn(
                "size-3.5 shrink-0",
                active ? "text-pen-blue" : "text-pen-subtle",
              )}
            />
          )}
          {leadingDot && (
            <span
              className="pointer-events-none absolute left-2.5 top-1/2 size-[7px] shrink-0 -translate-y-1/2 rounded-full"
              style={{ background: selected?.color ?? "#94a3b8" }}
            />
          )}
          <span className={cn("min-w-0 flex-1 truncate text-left", !selected && "text-pen-subtle")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="size-3 shrink-0 text-pen-muted" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className={cn(
            "w-(--anchor-width) min-w-(--anchor-width) max-w-[min(100vw-2rem,320px)] overflow-hidden rounded-xl border border-pen-card-border bg-pen-bg p-0 shadow-xl",
            contentClassName,
          )}
        >
          {showSearch && (
            <div className="relative border-b border-pen-card-border px-2.5 py-2">
              <Search className="pointer-events-none absolute left-[18px] top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-pen-card-border bg-transparent py-1.5 pl-8 pr-2 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="px-2.5 py-2 font-sans text-[11.5px] text-pen-subtle">{emptyLabel}</p>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value || "__empty__"}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return;
                      onChange(opt.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-sans text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      isSelected
                        ? "bg-pen-blue-tint text-pen-foreground"
                        : "text-pen-foreground hover:bg-pen-surface",
                    )}
                  >
                    {leadingDot && (
                      <span
                        className="size-[7px] shrink-0 rounded-full"
                        style={{ background: opt.color ?? "#94a3b8" }}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {isSelected && (
                      <Check className="size-3.5 shrink-0 text-pen-blue" strokeWidth={2.5} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
