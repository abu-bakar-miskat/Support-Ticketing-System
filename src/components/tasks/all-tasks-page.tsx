"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { X, Search, ChevronDown, Loader2, Users, ListTodo, CalendarClock } from "lucide-react";
import { FilterDropdown, FilterVisibilityMenu, SortDropdown, type SortKey } from "@/components/tasks/task-filter-dropdown";
import { usePersistedHiddenFilters } from "@/hooks/use-persisted-hidden-filters";
import { DateRangeDropdown, formatRangeLabel, type DateRange } from "@/components/ui/date-range-dropdown";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import type { SubDepartmentStatusConfig } from "@/components/board/board-types";
import { TaskListRow, TaskListHead } from "@/components/tasks/task-list-table";
import { ALL_TASKS_COLGROUP, TASK_TABLE_CLASS } from "@/components/tasks/task-list-cells";
import { TasksTableSkeleton } from "@/components/skeletons/page-skeletons";
import { useInfiniteAllTasks } from "@/hooks/queries/use-tasks";
import { smartAssignTickets } from "@/lib/api/admin";
import { invalidateTaskCaches } from "@/hooks/queries/invalidate-task-caches";
import { BulkAssignModal } from "@/components/tickets/bulk-assign-modal";
import { toast } from "sonner";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

const PRIORITY_OPTIONS = [
  { id: "urgent", label: "Urgent", color: "#ff4500" },
  { id: "critical", label: "Critical", color: "#dc2626" },
  { id: "high", label: "High", color: "#f97316" },
  { id: "medium", label: "Medium", color: "#ec4899" },
  { id: "low", label: "Low", color: "#94a3b8" },
];

const SOURCE_OPTIONS = [
  { id: "intake", label: "Support Ticket" },
  { id: "manual", label: "Manual Ticket" },
  { id: "mailbox", label: "Mailbox Ticket" },
];

const ALL_SUB_DEPARTMENTS_VALUE = "__all_sub_departments__";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// Intake/Manual are mutually exclusive — selecting one replaces the other.
function toggleExclusive(set: Set<string>, id: string): Set<string> {
  return set.has(id) ? new Set() : new Set([id]);
}

function moduleFilterLabel(
  module: { name: string; projectName: string },
  modules: { name: string }[],
) {
  const duplicateName = modules.filter((m) => m.name === module.name).length > 1;
  return duplicateName ? `${module.name} · ${module.projectName}` : module.name;
}

// ── Page Size Selector ────────────────────────────────────────────────────────

function PageSizeSelector({
  value,
  onChange,
}: {
  value: PageSizeOption;
  onChange: (v: PageSizeOption) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-sans text-[11.5px] text-sts-subtle">Per page</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex h-8 items-center gap-1.5 rounded-full border border-sts-card-border bg-transparent px-3 font-sans text-[12px] text-sts-muted transition-colors hover:border-sts-id hover:text-sts-foreground">
          {value}
          <ChevronDown className="size-3 shrink-0" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-auto min-w-[80px] rounded-xl border border-sts-card-border bg-sts-bg p-1.5 shadow-xl"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => {
                onChange(size);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center rounded-full px-3 py-1.5 font-sans text-[12px] transition-colors",
                size === value
                  ? "bg-sts-blue-tint font-semibold text-sts-id"
                  : "text-sts-foreground hover:bg-sts-surface",
              )}
            >
              {size}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Props = {
  subDepartmentStatuses: SubDepartmentStatusConfig[];
  availableProjects: { id: string; name: string; subDepartmentId: string | null; kind: string }[];
  availableModules: {
    id: string;
    name: string;
    projectId: string;
    projectName: string;
  }[];
  availableMembers: {
    id: string;
    name: string;
    avatarUrl: string | null;
    departmentName: string | null;
    subDepartmentName: string | null;
    role: string;
  }[];
  /** Sub-departments the caller can access — shown as a filter when more than one. */
  availableSubDepartments?: { id: string; name: string }[];
  /** Managers and admins can narrow the department-wide task list by sub-department. */
  canFilterBySubDepartment?: boolean;
  hideTitleBar?: boolean;
  unassignedOnly?: boolean;
  /** Show draft tickets (own drafts for staff; dept-scoped drafts for admins). */
  draftsOnly?: boolean;
};

export function AllTasksPage({
  subDepartmentStatuses,
  availableProjects,
  availableModules,
  availableMembers,
  availableSubDepartments = [],
  canFilterBySubDepartment = false,
  hideTitleBar = false,
  unassignedOnly = false,
  draftsOnly = false,
}: Props) {
  // ── Filter state ────────────────────────────────────────────────────────────
  const [rawSearch, setRawSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [selStatus, setSelStatus] = useState<Set<string>>(new Set());
  const [selPriority, setSelPriority] = useState<Set<string>>(new Set());
  const [selProject, setSelProject] = useState<Set<string>>(new Set()); // project IDs
  const [selSubDepartment, setSelSubDepartment] = useState<Set<string>>(new Set());
  const [selPeople, setSelPeople] = useState<Set<string>>(new Set()); // profile IDs
  const [selModule, setSelModule] = useState<Set<string>>(new Set()); // module IDs
  const [selLabels, setSelLabels] = useState<Set<string>>(new Set()); // label names
  const [selSource, setSelSource] = useState<Set<string>>(new Set()); // "intake" | "manual" | "mailbox"
  const [dateRange, setDateRange] = useState<DateRange>(null);
  const [targetRange, setTargetRange] = useState<DateRange>(null);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  // ── Filter visibility (persisted per user) ──────────────────────────────────
  const filterVisibility = usePersistedHiddenFilters(unassignedOnly ? "all-tasks-unassigned" : "all-tasks");
  // ── Bulk selection ──────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: labelsData } = useQuery({
    queryKey: ["labels"],
    queryFn: () => fetch("/api/labels").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // Debounce search — only the debounced value goes to the API
  const search = useDebounce(rawSearch, 500);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Build filter params for the query key + API ─────────────────────────────
  const filters = useMemo(
    () => ({
      limit: pageSize,
      search: search || undefined,
      status: selStatus.size ? [...selStatus] : undefined,
      priority: selPriority.size ? [...selPriority] : undefined,
      projectId: selProject.size ? [...selProject] : undefined,
      subDepartmentId: selSubDepartment.size ? [...selSubDepartment] : undefined,
      assigneeId: selPeople.size ? [...selPeople] : undefined,
      moduleId: selModule.size ? [...selModule] : undefined,
      labels: selLabels.size ? [...selLabels] : undefined,
      dateFrom: dateRange?.from ?? undefined,
      dateTo: dateRange?.to ?? undefined,
      targetDateFrom: targetRange?.from ?? undefined,
      targetDateTo: targetRange?.to ?? undefined,
      sort: sortKey,
      unassigned: unassignedOnly || undefined,
      drafts: draftsOnly || undefined,
      source: selSource.size === 1 ? ([...selSource][0] as "intake" | "manual" | "mailbox") : undefined,
    }),
    [
      pageSize,
      search,
      selStatus,
      selPriority,
      selProject,
      selSubDepartment,
      selPeople,
      selModule,
      selLabels,
      selSource,
      dateRange,
      targetRange,
      sortKey,
      unassignedOnly,
      draftsOnly,
    ],
  );

  // ── Infinite query (resets to page 1 whenever `filters` changes) ────────────
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useInfiniteAllTasks(filters);

  const allTasks = useMemo(
    () => data?.pages.flatMap((p) => p.tasks) ?? [],
    [data],
  );
  const isPrivileged = data?.pages[0]?.isPrivileged ?? false;
  const serverTotal = data?.pages[data.pages.length - 1]?.total ?? 0;
  // Bulk-select checkboxes are only useful for the Unassigned tab (bulk-assign workflow)
  const showBulkSelect = isPrivileged && unassignedOnly;

  // ── Intersection observer: auto-fetch next page on scroll ───────────────────
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Filter option lists for the dropdowns ──────────────────────────────────
  const statusOptions = subDepartmentStatuses.map((s) => ({
    id: s.label,
    label: s.label,
    color: s.color,
  }));
  const projectOptions = availableProjects.map((p) => ({
    id: p.id,
    label: p.name,
  }));
  const selectedSubDepartment = availableSubDepartments.find(
    (subDepartment) => subDepartment.id === [...selSubDepartment][0],
  );
  const peopleOptions = availableMembers.map((m) => ({
    id: m.id,
    label: m.name,
  }));
  const moduleOptions = availableModules.map((m) => ({
    id: m.id,
    label: moduleFilterLabel(m, availableModules),
  }));
  const labelOptions = (labelsData?.labels ?? []).map(
    (l: { id: string; name: string; color: string }) => ({
      id: l.name,
      label: l.name,
      color: l.color,
    }),
  );

  // ── Toggleable filters (drives the "Filters" show/hide menu) ────────────────
  const showSubDeptFilter = canFilterBySubDepartment && availableSubDepartments.length > 1;
  const toggleableFilters = useMemo(
    () =>
      [
        { id: "status", label: "Status" },
        { id: "priority", label: "Priority" },
        { id: "project", label: "Project" },
        showSubDeptFilter ? { id: "subDepartment", label: "Sub-department" } : null,
        !unassignedOnly ? { id: "people", label: "People" } : null,
        moduleOptions.length > 0 ? { id: "module", label: "Module" } : null,
        labelOptions.length > 0 ? { id: "labels", label: "Labels" } : null,
        { id: "source", label: "Source" },
        { id: "dateRange", label: "Created date" },
        { id: "targetRange", label: "Target date" },
      ].filter((f): f is { id: string; label: string } => f !== null),
    [showSubDeptFilter, unassignedOnly, moduleOptions.length, labelOptions.length],
  );
  const showFilter = filterVisibility.isVisible;

  // ── Color map for rendering rows ───────────────────────────────────────────
  const colorMap = useMemo(
    () => Object.fromEntries(subDepartmentStatuses.map((s) => [s.label, s.color])),
    [subDepartmentStatuses],
  );

  // ── Select-all handler ──────────────────────────────────────────────────────
  const allSelected = allTasks.length > 0 && allTasks.every((t) => selectedIds.has(t.dbId));
  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(allTasks.map((t) => t.dbId)));
  }

  // ── Bulk assign handler ─────────────────────────────────────────────────────
  async function handleBulkAssign(mode: "single" | "round-robin", assigneeIds: string[]) {
    const { updated } = await smartAssignTickets([...selectedIds], mode, assigneeIds);
    toast.success(`${updated} ticket${updated === 1 ? "" : "s"} assigned`);
    setSelectedIds(new Set());
    setAssignModalOpen(false);
    invalidateTaskCaches(queryClient);
  }

  // ── Active filter chips ────────────────────────────────────────────────────
  type Chip = { label: string; onRemove: () => void };
  const chips: Chip[] = [
    ...[...selStatus].map((v) => ({
      label: `Status: ${v}`,
      onRemove: () => setSelStatus(toggle(selStatus, v)),
    })),
    ...[...selPriority].map((v) => ({
      label: `Priority: ${v}`,
      onRemove: () => setSelPriority(toggle(selPriority, v)),
    })),
    ...[...selProject].map((id) => {
      const name = availableProjects.find((p) => p.id === id)?.name ?? id;
      return {
        label: `Project: ${name}`,
        onRemove: () => setSelProject(toggle(selProject, id)),
      };
    }),
    ...[...selSubDepartment].map((id) => {
      const name = availableSubDepartments.find((s) => s.id === id)?.name ?? id;
      return {
        label: `Sub-department: ${name}`,
        onRemove: () => setSelSubDepartment(toggle(selSubDepartment, id)),
      };
    }),
    ...[...selPeople].map((id) => {
      const name = availableMembers.find((m) => m.id === id)?.name ?? id;
      return {
        label: `Person: ${name}`,
        onRemove: () => setSelPeople(toggle(selPeople, id)),
      };
    }),
    ...[...selModule].map((id) => {
      const mod = availableModules.find((m) => m.id === id);
      const name = mod ? moduleFilterLabel(mod, availableModules) : id;
      return {
        label: `Module: ${name}`,
        onRemove: () => setSelModule(toggle(selModule, id)),
      };
    }),
    ...[...selLabels].map((name) => ({
      label: `Label: ${name}`,
      onRemove: () => setSelLabels(toggle(selLabels, name)),
    })),
    ...[...selSource].map((id) => ({
      label: `Source: ${SOURCE_OPTIONS.find((s) => s.id === id)?.label ?? id}`,
      onRemove: () => setSelSource(new Set()),
    })),
    ...(dateRange
      ? [
          {
            label: formatRangeLabel(dateRange),
            onRemove: () => setDateRange(null),
          },
        ]
      : []),
    ...(targetRange
      ? [
          {
            label: `Target: ${formatRangeLabel(targetRange)}`,
            onRemove: () => setTargetRange(null),
          },
        ]
      : []),
  ];

  const hasFilters =
    rawSearch ||
    selStatus.size ||
    selPriority.size ||
    selProject.size ||
    selSubDepartment.size ||
    selPeople.size ||
    selModule.size ||
    selLabels.size ||
    selSource.size ||
    dateRange ||
    targetRange;

  function clearAll() {
    setRawSearch("");
    setSelStatus(new Set());
    setSelPriority(new Set());
    setSelProject(new Set());
    setSelSubDepartment(new Set());
    setSelPeople(new Set());
    setSelModule(new Set());
    setSelLabels(new Set());
    setSelSource(new Set());
    setDateRange(null);
    setTargetRange(null);
  }

  // ── Stats line ─────────────────────────────────────────────────────────────
  return (
    <>
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          "shrink-0 px-4 sm:px-6 xl:px-8",
          hideTitleBar ? "py-2" : "pt-3 sm:pt-4 xl:pt-5",
        )}
      >
        {!hideTitleBar && (
          <PageHeader title="All Tasks" icon={ListTodo} iconClassName="text-sts-blue" className="mb-3" />
        )}

        <div
          className={cn(
            "flex flex-col gap-2 xl:flex-row xl:items-center xl:gap-3",
            hideTitleBar ? "mb-0" : "mb-3 sm:mb-4",
          )}
        >
          {/* Stats */}
          <p className="shrink-0 font-sans text-[12px] text-sts-muted sm:text-[12.5px]">
            {isLoading ? (
              <span className="text-sts-subtle">Loading…</span>
            ) : (
              <>
                <span className="font-semibold text-sts-foreground">
                  {allTasks.length}
                </span>
                {" of "}
                <span className="font-semibold text-sts-foreground">
                  {serverTotal}
                </span>
                {" ticket"}
                {serverTotal === 1 ? "" : "s"}
                {!isPrivileged && (
                  <span className="ml-1.5 rounded-full bg-sts-surface px-2 py-0.5 font-sans text-[11.5px] text-sts-subtle">
                    your projects only
                  </span>
                )}
                {isFetching && !isFetchingNextPage && (
                  <Loader2 className="ml-2 inline size-3.5 animate-spin text-sts-subtle" />
                )}
              </>
            )}
          </p>

          {/* Toolbar */}
          <div className="min-w-0 flex-1 overflow-x-auto pb-1 [scrollbar-width:none] max-xl:-mx-4 max-xl:px-4 sm:max-xl:-mx-6 sm:max-xl:px-6 xl:px-0 [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max min-w-full flex-wrap items-center gap-2 xl:w-full">
              {/* Search */}
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sts-subtle" />
                <input
                  value={rawSearch}
                  onChange={(e) => setRawSearch(e.target.value)}
                  placeholder="Search tickets…"
                  className="h-8 w-36 rounded-lg border border-sts-card-border bg-transparent pl-8 pr-3 font-sans text-[12px] text-sts-foreground outline-none placeholder:text-sts-subtle focus:border-sts-id sm:w-48"
                />
                {rawSearch && (
                  <button
                    type="button"
                    onClick={() => setRawSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-sts-subtle hover:text-sts-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              <div className="hidden h-5 w-px shrink-0 bg-sts-card-border sm:block" />

              {showFilter("status") && (
                <FilterDropdown
                  label="Status"
                  options={statusOptions}
                  selected={selStatus}
                  onToggle={(id) => setSelStatus(toggle(selStatus, id))}
                  onClear={() => setSelStatus(new Set())}
                />
              )}
              {showFilter("priority") && (
                <FilterDropdown
                  label="Priority"
                  options={PRIORITY_OPTIONS}
                  selected={selPriority}
                  onToggle={(id) => setSelPriority(toggle(selPriority, id))}
                  onClear={() => setSelPriority(new Set())}
                />
              )}
              {showFilter("project") && (
                <FilterDropdown
                  label="Project"
                  options={projectOptions}
                  selected={selProject}
                  onToggle={(id) => setSelProject(toggle(selProject, id))}
                  onClear={() => setSelProject(new Set())}
                />
              )}
              {showFilter("subDepartment") && canFilterBySubDepartment && availableSubDepartments.length > 1 && (
                <Select
                  value={selectedSubDepartment?.id ?? ALL_SUB_DEPARTMENTS_VALUE}
                  onValueChange={(value) =>
                    setSelSubDepartment(
                      value && value !== ALL_SUB_DEPARTMENTS_VALUE ? new Set([value]) : new Set(),
                    )
                  }
                >
                  <SelectTrigger
                    aria-label="Filter by sub-department"
                    className={cn(
                      "h-8 max-w-52 rounded-full border-sts-card-border bg-transparent px-3 font-sans text-[12px] text-sts-muted hover:border-sts-id hover:bg-transparent hover:text-sts-foreground",
                      selectedSubDepartment && "border-sts-blue bg-sts-blue-tint font-semibold text-sts-id hover:bg-sts-blue-tint",
                    )}
                  >
                    <span className="truncate">
                      {selectedSubDepartment?.name ?? "All sub-departments"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="min-w-52 rounded-xl border border-sts-card-border bg-sts-bg p-1.5 shadow-xl">
                    <SelectItem value={ALL_SUB_DEPARTMENTS_VALUE} className="font-sans text-[12px]">
                      All sub-departments
                    </SelectItem>
                    {availableSubDepartments.map((subDepartment) => (
                      <SelectItem key={subDepartment.id} value={subDepartment.id} className="font-sans text-[12px]">
                        {subDepartment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {showFilter("people") && !unassignedOnly && (
                <FilterDropdown
                  label="People"
                  options={peopleOptions}
                  selected={selPeople}
                  onToggle={(id) => setSelPeople(toggle(selPeople, id))}
                  onClear={() => setSelPeople(new Set())}
                />
              )}
              {showFilter("module") && moduleOptions.length > 0 && (
                <FilterDropdown
                  label="Module"
                  options={moduleOptions}
                  selected={selModule}
                  onToggle={(id) => setSelModule(toggle(selModule, id))}
                  onClear={() => setSelModule(new Set())}
                />
              )}
              {showFilter("labels") && labelOptions.length > 0 && (
                <FilterDropdown
                  label="Labels"
                  options={labelOptions}
                  selected={selLabels}
                  onToggle={(name) => setSelLabels(toggle(selLabels, name))}
                  onClear={() => setSelLabels(new Set())}
                />
              )}
              {showFilter("source") && (
                <FilterDropdown
                  label="Source"
                  options={SOURCE_OPTIONS}
                  selected={selSource}
                  onToggle={(id) => setSelSource(toggleExclusive(selSource, id))}
                  onClear={() => setSelSource(new Set())}
                />
              )}
              {showFilter("dateRange") && (
                <DateRangeDropdown
                  value={dateRange}
                  onChange={setDateRange}
                  onClear={() => setDateRange(null)}
                />
              )}
              {showFilter("targetRange") && (
                <DateRangeDropdown
                  value={targetRange}
                  onChange={setTargetRange}
                  onClear={() => setTargetRange(null)}
                  placeholder="Target date"
                  icon={CalendarClock}
                  future
                />
              )}

              <div className="hidden flex-1 lg:block" />

              <PageSizeSelector value={pageSize} onChange={setPageSize} />

              <SortDropdown
                value={sortKey}
                onChange={(v) => setSortKey(v as SortKey)}
              />

              <FilterVisibilityMenu filters={toggleableFilters} visibility={filterVisibility} />

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-sts-card-border bg-transparent px-3 font-sans text-[12px] whitespace-nowrap text-sts-muted transition-colors hover:border-sts-red hover:text-sts-red"
                >
                  <X className="size-3" />
                  <span className="hidden sm:inline">Clear all</span>
                  <span className="sm:hidden">Clear</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Active filter chips */}
        {chips.length > 0 && (
          <div
            className={cn(
              "overflow-x-auto [scrollbar-width:none] max-lg:-mx-4 max-lg:px-4 sm:max-lg:-mx-6 sm:max-lg:px-6 [&::-webkit-scrollbar]:hidden",
              hideTitleBar ? "mb-0" : "mb-3 sm:mb-4",
            )}
          >
            <div className="flex w-max gap-1.5 lg:w-full lg:flex-wrap">
              {chips.map((chip) => (
                <span
                  key={chip.label}
                  className="flex items-center gap-1 rounded-full bg-sts-blue-tint px-2.5 py-0.5 font-sans text-[11.5px] font-semibold text-sts-id"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    className="hover:opacity-70"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Table — skeleton on first load, real table once data arrives */}
      {isError && allTasks.length === 0 ? (
        <div role="alert" className="p-6 text-sm">
          Could not load tasks. <button className="underline" onClick={() => refetch()}>Try again</button>
        </div>
      ) : isLoading ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <TasksTableSkeleton />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
          <table className={TASK_TABLE_CLASS}>
            {!showBulkSelect && ALL_TASKS_COLGROUP}
            <TaskListHead
              showCheckbox={showBulkSelect}
              allSelected={allSelected}
              onToggleAll={toggleSelectAll}
            />
            <tbody>
              {allTasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={showBulkSelect ? 10 : 9}
                    className="py-20 text-center font-sans text-[13px] text-sts-subtle"
                  >
                    {unassignedOnly
                      ? "No unassigned tickets."
                      : draftsOnly
                        ? "No draft tickets."
                        : "No tickets match the current filters."}
                  </td>
                </tr>
              ) : (
                allTasks.map((task) => (
                  <TaskListRow
                    key={task.dbId}
                    task={task}
                    colorMap={colorMap}
                    isSelected={selectedIds.has(task.dbId)}
                    onToggleSelect={
                      showBulkSelect
                        ? (id) =>
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            })
                        : undefined
                    }
                  />
                ))
              )}
            </tbody>
          </table>

          {/* Scroll sentinel (triggers auto-load) */}
          <div ref={sentinelRef} className="h-1" />

          {/* Footer: spinner for scroll pagination only */}
          <div className="flex items-center justify-center gap-3 px-6 py-3">
            {isFetchingNextPage ? (
              <span className="flex items-center gap-2 font-sans text-[12px] text-sts-muted">
                <Loader2 className="size-3.5 animate-spin" />
                Loading more…
              </span>
            ) : hasNextPage ? (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                className="font-sans text-[12px] text-sts-id hover:underline"
              >
                Load {pageSize} more
              </button>
            ) : allTasks.length > 0 ? (
              <span className="font-sans text-[12px] text-sts-subtle">
                All {serverTotal} ticket{serverTotal === 1 ? "" : "s"} loaded
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>

    {/* Floating assign button — appears bottom-right when tickets are selected (Unassigned tab only) */}
    {showBulkSelect && selectedIds.size > 0 && (
      <div className="fixed bottom-6 right-6 z-50 flex animate-in items-center gap-1 rounded-full border border-sts-card-border bg-sts-card py-1.5 pr-1.5 pl-4 shadow-2xl fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-150">
        <span className="flex items-center gap-1.5 font-sans text-[12.5px] font-medium text-sts-foreground">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sts-blue-tint font-sans text-[11px] font-bold text-sts-blue">
            {selectedIds.size}
          </span>
          selected
        </span>

        <div className="mx-2 h-5 w-px shrink-0 bg-sts-card-border" />

        <button
          type="button"
          onClick={() => setAssignModalOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-sts-blue px-4 font-sans text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-sts-blue/90"
        >
          <Users className="size-3.5 shrink-0" />
          Assign {selectedIds.size} Ticket{selectedIds.size === 1 ? "" : "s"}
        </button>
        <button
          type="button"
          onClick={() => setSelectedIds(new Set())}
          aria-label="Clear selection"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sts-subtle transition-colors hover:bg-sts-surface hover:text-sts-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )}

    {assignModalOpen && (
      <BulkAssignModal
        count={selectedIds.size}
        subDepartmentMembers={availableMembers}
        onClose={() => setAssignModalOpen(false)}
        onAssign={handleBulkAssign}
      />
    )}

    </>
  );
}
