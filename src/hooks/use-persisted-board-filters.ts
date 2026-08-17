"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [filters, setFilters] = useState<BoardFiltersState>(DEFAULT_FILTERS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setFilters(sanitize(JSON.parse(raw)));
    } catch {
      // ignore storage errors
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // ignore storage errors
    }
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
