"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export { SortDropdown } from "@/components/tasks/task-filter-dropdown";

/** Pill search box with a clear button — the standard search control for list pages. */
export function ListSearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full max-w-[16rem] min-w-[10rem]", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sts-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder.replace(/…$/, "")}
        className="h-8 w-full rounded-full border border-sts-card-border bg-sts-card py-1 pr-7 pl-8 font-sans text-[12px] text-sts-foreground outline-none transition-colors placeholder:text-sts-subtle focus:border-sts-id [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-sts-subtle transition-colors hover:text-sts-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export type ListSortOption<T> = { id: string; label: string; compare: (a: T, b: T) => number };

/**
 * Local search + sort over an already-loaded array.
 * `searchText` returns the text a row is matched against (case-insensitive, all terms must match).
 * The first sort option is the default.
 */
export function useListControls<T>(
  items: readonly T[],
  {
    searchText,
    sortOptions,
    defaultSort,
  }: {
    searchText: (item: T) => string;
    sortOptions: ListSortOption<T>[];
    defaultSort?: string;
  },
) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(defaultSort ?? sortOptions[0]?.id ?? "");

  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = terms.length
      ? items.filter((item) => {
          const hay = searchText(item).toLowerCase();
          return terms.every((t) => hay.includes(t));
        })
      : [...items];
    const compare = sortOptions.find((o) => o.id === sortKey)?.compare;
    return compare ? filtered.sort(compare) : filtered;
    // searchText / sortOptions are expected to be inline lambdas; only re-run on data/control changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, sortKey]);

  return {
    query,
    setQuery,
    sortKey,
    setSortKey,
    visible,
    /** Options shaped for <SortDropdown options=…>. */
    sortDropdownOptions: sortOptions.map(({ id, label }) => ({ id, label })),
    isFiltering: query.trim().length > 0,
  };
}

/** Common comparators. */
export const byText =
  <T,>(get: (item: T) => string | null | undefined) =>
  (a: T, b: T) =>
    (get(a) ?? "").localeCompare(get(b) ?? "", undefined, { sensitivity: "base", numeric: true });

export const byDateDesc =
  <T,>(get: (item: T) => string | Date | null | undefined) =>
  (a: T, b: T) =>
    toTime(get(b)) - toTime(get(a));

export const byDateAsc =
  <T,>(get: (item: T) => string | Date | null | undefined) =>
  (a: T, b: T) =>
    toTime(get(a)) - toTime(get(b));

export const byNumberDesc =
  <T,>(get: (item: T) => number | null | undefined) =>
  (a: T, b: T) =>
    (get(b) ?? 0) - (get(a) ?? 0);

function toTime(v: string | Date | null | undefined) {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}
