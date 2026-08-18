"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  DateFilter,
  IntakeFilter,
  LabelFilter,
  ModuleFilter,
  PriorityFilter,
  ProjectFilter,
} from "@/components/board/board-filters";
import type { SortKey } from "@/components/tasks/task-filter-dropdown";
import type { DateRange } from "@/components/ui/date-range-dropdown";

const STORAGE_KEY = "pen.board.filters";
// FLT-05: the client-side board filters, URL-encoded for bookmarking/sharing.
// Written via `history.replaceState` directly (not next/navigation's router)
// so every filter tweak doesn't trigger a server round-trip — these filters
// are applied entirely in the browser against already-fetched cards, so the
// server never needs to observe this param (see board/page.tsx, which only
// reads `q`/`subStatus` for its own server-side query).
const URL_PARAM = "boardFilters";

export type BoardFiltersState = {
  assigneeFilter: string;
  projectFilter: ProjectFilter;
  moduleFilter: ModuleFilter;
  priorityFilter: PriorityFilter;
  dateFilter: DateFilter;
  intakeFilter: IntakeFilter;
  labelFilter: LabelFilter;
  /** Inclusive due-date calendar range; mutually exclusive with dateFilter presets in the UI. */
  dueRange: DateRange;
  /** Personal target-date preset; matches any assignee's target date. */
  targetDateFilter: DateFilter;
  /** Inclusive target-date calendar range; mutually exclusive with targetDateFilter presets. */
  targetRange: DateRange;
  sortKey: SortKey;
};

const DEFAULT_FILTERS: BoardFiltersState = {
  assigneeFilter: "all",
  projectFilter: "all",
  moduleFilter: "all",
  priorityFilter: "all",
  dateFilter: "all",
  intakeFilter: "all",
  labelFilter: [],
  dueRange: null,
  targetDateFilter: "all",
  targetRange: null,
  sortKey: "created",
};

const PRIORITIES: PriorityFilter[] = [
  "all",
  "urgent",
  "critical",
  "high_plus",
  "high",
  "medium",
  "low",
];
const DATES: DateFilter[] = ["all", "overdue", "today", "week", "none"];
const INTAKES: IntakeFilter[] = ["all", "intake", "non_intake"];
const SORTS: SortKey[] = [
  "created",
  "updated",
  "priority",
  "due",
  "title",
  "status",
  "project",
];

function isDateRange(value: unknown): value is NonNullable<DateRange> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DateRange)?.from === "string" &&
    typeof (value as DateRange)?.to === "string"
  );
}

function sanitize(raw: unknown): BoardFiltersState {
  if (!raw || typeof raw !== "object") return DEFAULT_FILTERS;
  const stored = raw as Partial<BoardFiltersState>;

  let dateFilter = DATES.includes(stored.dateFilter as DateFilter)
    ? (stored.dateFilter as DateFilter)
    : DEFAULT_FILTERS.dateFilter;

  let dueRange: DateRange = DEFAULT_FILTERS.dueRange;
  if (isDateRange(stored.dueRange)) dueRange = stored.dueRange;
  else if (stored.dueRange === null) dueRange = null;

  // Preset and custom range are mutually exclusive — prefer the custom range.
  if (dueRange) dateFilter = "all";

  let targetDateFilter = DATES.includes(stored.targetDateFilter as DateFilter)
    ? (stored.targetDateFilter as DateFilter)
    : DEFAULT_FILTERS.targetDateFilter;

  let targetRange: DateRange = DEFAULT_FILTERS.targetRange;
  if (isDateRange(stored.targetRange)) targetRange = stored.targetRange;
  else if (stored.targetRange === null) targetRange = null;

  if (targetRange) targetDateFilter = "all";

  return {
    assigneeFilter:
      typeof stored.assigneeFilter === "string"
        ? stored.assigneeFilter
        : DEFAULT_FILTERS.assigneeFilter,
    projectFilter:
      typeof stored.projectFilter === "string"
        ? stored.projectFilter
        : DEFAULT_FILTERS.projectFilter,
    moduleFilter:
      typeof stored.moduleFilter === "string"
        ? stored.moduleFilter
        : DEFAULT_FILTERS.moduleFilter,
    priorityFilter: PRIORITIES.includes(stored.priorityFilter as PriorityFilter)
      ? (stored.priorityFilter as PriorityFilter)
      : DEFAULT_FILTERS.priorityFilter,
    dateFilter,
    intakeFilter: INTAKES.includes(stored.intakeFilter as IntakeFilter)
      ? (stored.intakeFilter as IntakeFilter)
      : DEFAULT_FILTERS.intakeFilter,
    labelFilter: Array.isArray(stored.labelFilter)
      ? stored.labelFilter.filter((v): v is string => typeof v === "string")
      : DEFAULT_FILTERS.labelFilter,
    dueRange,
    targetDateFilter,
    targetRange,
    sortKey: SORTS.includes(stored.sortKey as SortKey)
      ? (stored.sortKey as SortKey)
      : DEFAULT_FILTERS.sortKey,
  };
}

export function usePersistedBoardFilters() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<BoardFiltersState>(DEFAULT_FILTERS);
  const [ready, setReady] = useState(false);

  // FLT-05: the URL wins on load (so a shared link reproduces the sender's
  // view exactly); falls back to this browser's last-used filters otherwise.
  useEffect(() => {
    const fromUrl = searchParams.get(URL_PARAM);
    if (fromUrl) {
      try {
        setFilters(sanitize(JSON.parse(decodeURIComponent(fromUrl))));
        setReady(true);
        return;
      } catch {
        // fall through to localStorage
      }
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setFilters(sanitize(JSON.parse(raw)));
    } catch {
      // ignore storage errors
    }
    setReady(true);
    // Only ever read the URL/localStorage once, on mount — this hook owns
    // `filters` from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // ignore storage errors
    }

    // Direct history API — not next/navigation's router — so this never
    // triggers a server round-trip. The board's data fetch doesn't depend on
    // these filters (they're applied client-side to already-fetched cards);
    // this is purely so the address bar reflects the current view.
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS)) {
      url.searchParams.delete(URL_PARAM);
    } else {
      url.searchParams.set(URL_PARAM, encodeURIComponent(JSON.stringify(filters)));
    }
    window.history.replaceState(null, "", url.toString());
  }, [filters, ready]);

  const setAssigneeFilter = useCallback((assigneeFilter: string) => {
    setFilters((prev) => ({ ...prev, assigneeFilter }));
  }, []);

  const setProjectFilter = useCallback((projectFilter: ProjectFilter) => {
    setFilters((prev) => ({ ...prev, projectFilter }));
  }, []);

  const setModuleFilter = useCallback((moduleFilter: ModuleFilter) => {
    setFilters((prev) => ({ ...prev, moduleFilter }));
  }, []);

  const setPriorityFilter = useCallback((priorityFilter: PriorityFilter) => {
    setFilters((prev) => ({ ...prev, priorityFilter }));
  }, []);

  const setDateFilter = useCallback((dateFilter: DateFilter) => {
    setFilters((prev) => ({ ...prev, dateFilter, dueRange: null }));
  }, []);

  const setIntakeFilter = useCallback((intakeFilter: IntakeFilter) => {
    setFilters((prev) => ({ ...prev, intakeFilter }));
  }, []);

  const setLabelFilter = useCallback((labelFilter: LabelFilter) => {
    setFilters((prev) => ({ ...prev, labelFilter }));
  }, []);

  const setDueRange = useCallback((dueRange: DateRange) => {
    setFilters((prev) => ({
      ...prev,
      dueRange,
      dateFilter: dueRange ? "all" : prev.dateFilter,
    }));
  }, []);

  const setTargetDateFilter = useCallback((targetDateFilter: DateFilter) => {
    setFilters((prev) => ({ ...prev, targetDateFilter, targetRange: null }));
  }, []);

  const setTargetRange = useCallback((targetRange: DateRange) => {
    setFilters((prev) => ({
      ...prev,
      targetRange,
      targetDateFilter: targetRange ? "all" : prev.targetDateFilter,
    }));
  }, []);

  const setSortKey = useCallback((sortKey: SortKey) => {
    setFilters((prev) => ({ ...prev, sortKey }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters((prev) => ({
      ...DEFAULT_FILTERS,
      sortKey: prev.sortKey,
    }));
  }, []);

  return {
    ...filters,
    ready,
    setAssigneeFilter,
    setProjectFilter,
    setModuleFilter,
    setPriorityFilter,
    setDateFilter,
    setIntakeFilter,
    setLabelFilter,
    setDueRange,
    setTargetDateFilter,
    setTargetRange,
    setSortKey,
    clearFilters,
  };
}
