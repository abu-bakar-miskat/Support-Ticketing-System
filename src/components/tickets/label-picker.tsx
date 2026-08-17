"use client";

import { useEffect, useState } from "react";
import { Tag, Check } from "lucide-react";
import { TagPill } from "@/components/board/tag-pill";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type LabelOption = { id: string; name: string; color: string };

type Props = {
  current: string[];
  onChange: (labels: string[]) => void;
  /** When set (non-empty), only these label names are selectable — labels linked to the current status. */
  allowedLabels?: string[];
};

export function LabelPicker({ current, onChange, allowedLabels }: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LabelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Fetch once on mount so options are ready before the user clicks
  useEffect(() => {
    fetch("/api/labels")
      .then((r) => r.json())
      .then((data) => setOptions(data.labels ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Reset search when closed
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const scoped = allowedLabels?.length
    ? options.filter((o) => allowedLabels.includes(o.name))
    : options;
  const filtered = scoped.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()),
  );

  function toggle(name: string) {
    const next = current.includes(name)
      ? current.filter((l) => l !== name)
      : [...current, name];
    onChange(next);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex h-[26px] items-center gap-1 rounded-md border border-dashed border-pen-card-border px-2 font-sans text-[11.5px] text-pen-subtle transition-colors hover:border-pen-blue/40 hover:text-pen-blue"
      >
        <Tag className="size-3 shrink-0" />
        Add label
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[220px] gap-0 rounded-[9px] border border-pen-card-border bg-pen-card p-0 shadow-lg"
      >
        <div className="border-b border-pen-card-border px-2.5 py-2">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search labels…"
            className="w-full bg-transparent font-sans text-[12.5px] text-pen-foreground placeholder:text-pen-subtle outline-none"
          />
        </div>
        <div className="max-h-[200px] overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 font-sans text-[11.5px] text-pen-subtle">
              <LoadingSpinner className="size-3.5 shrink-0" />
              Loading labels…
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-2 font-sans text-[11.5px] text-pen-subtle">
              No labels found
            </p>
          ) : (
            filtered.map((opt) => {
              const active = current.includes(opt.name);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggle(opt.name)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 hover:bg-pen-surface"
                >
                  <span
                    className="size-[10px] shrink-0 rounded-full"
                    style={{ backgroundColor: opt.color }}
                  />
                  <span className="flex-1 text-left font-sans text-[12.5px] text-pen-foreground">
                    {opt.name}
                  </span>
                  {active && <Check className="size-3 shrink-0 text-pen-blue" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Re-export TagPill for convenience
export { TagPill };
