"use client";

import { useState } from "react";
import { ChevronDown, Check, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
  compact = false,
}: {
  label: string;
  options: { id: string; label: string; color?: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  const count = selected.size;
  const [query, setQuery] = useState("");
  const filteredOptions = query.trim()
    ? options.filter((opt) => opt.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <Popover onOpenChange={(open) => { if (!open) setQuery(""); }}>
      <PopoverTrigger
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-lg border font-sans transition-colors",
          compact ? "h-7 px-2.5 text-[11.5px]" : "h-8 px-3 text-[12px]",
          count > 0
            ? "border-sts-blue bg-sts-blue-tint font-semibold text-sts-id"
            : "border-sts-card-border bg-transparent text-sts-muted hover:border-sts-id hover:text-sts-foreground",
        )}
      >
        {label}
        {count > 0 && (
          <span className="flex size-4 items-center justify-center rounded-full bg-sts-blue font-sans text-[11.5px] font-bold text-white dark:text-gray-900">
            {count}
          </span>
        )}
        <ChevronDown className="size-3 shrink-0" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-auto min-w-[180px] rounded-xl border border-sts-card-border bg-sts-bg p-0 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-sts-card-border px-3 py-2">
          <span className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-sts-subtle">{label}</span>
          {count > 0 && (
            <button type="button" onClick={onClear} className="font-sans text-[11.5px] text-sts-muted hover:text-sts-red">
              Clear
            </button>
          )}
        </div>
        <div className="relative border-b border-sts-card-border px-2.5 py-2">
          <Search className="pointer-events-none absolute left-[18px] top-1/2 size-3.5 -translate-y-1/2 text-sts-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-md border border-sts-card-border bg-transparent py-1 pl-8 pr-2 font-sans text-[12px] text-sts-foreground outline-none placeholder:text-sts-subtle focus:border-sts-id"
          />
        </div>
        <div className="max-h-52 overflow-y-auto p-1.5">
          {filteredOptions.length === 0 ? (
            <p className="px-2.5 py-2 font-sans text-[11.5px] text-sts-subtle">No matches</p>
          ) : (
            filteredOptions.map((opt) => {
              const checked = selected.has(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onToggle(opt.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    checked ? "bg-sts-blue-tint" : "hover:bg-sts-surface dark:hover:bg-white/5",
                  )}
                >
                  <span className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                    checked ? "border-sts-blue bg-sts-blue" : "border-sts-card-border bg-transparent",
                  )}>
                    {checked && <Check className="size-2.5 text-white" strokeWidth={3} />}
                  </span>
                  {opt.color && (
                    <span className="block size-2 shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />
                  )}
                  <span className={cn(
                    "font-sans text-[12.5px]",
                    checked ? "font-semibold text-sts-foreground" : "text-sts-muted",
                  )}>
                    {opt.label}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type SortKey = "created" | "title" | "priority" | "due" | "status" | "project" | "updated";

export function SortDropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);

  const defaultOptions: { id: SortKey; label: string }[] = [
    { id: "created",  label: "Newest first" },
    { id: "title",    label: "Alphabetically" },
    { id: "priority", label: "Priority" },
    { id: "due",      label: "Due date" },
    { id: "status",   label: "Status" },
    { id: "project",  label: "Project" },
    { id: "updated",  label: "Recently updated" },
  ];

  const opts = options ?? defaultOptions;
  const label = opts.find((o) => o.id === value)?.label ?? "Sort";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-sts-card-border bg-transparent px-3 font-sans text-[12px] text-sts-muted transition-colors hover:border-sts-id hover:text-sts-foreground">
        <ArrowUpDown className="size-3 shrink-0" />
        {label}
        <ChevronDown className="size-3 shrink-0" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-auto min-w-[170px] rounded-xl border border-sts-card-border bg-sts-bg p-0 shadow-xl"
      >
        <div className="p-1.5">
          {opts.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => { onChange(opt.id); setOpen(false); }}
              className={cn(
                "flex w-full items-center rounded-md px-3 py-1.5 text-left font-sans text-[12px] transition-colors",
                value === opt.id ? "bg-sts-blue-tint font-semibold text-sts-id" : "text-sts-foreground hover:bg-sts-surface",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
