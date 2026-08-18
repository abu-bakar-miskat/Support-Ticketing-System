"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Search, ChevronDown, Loader2, Users, ListTodo, Bookmark, Trash2, Plus, Check, Download, CalendarClock } from "lucide-react";
import { FilterDropdown, SortDropdown, type SortKey } from "@/components/tasks/task-filter-dropdown";
import { DateRangeDropdown, formatRangeLabel, type DateRange } from "@/components/ui/date-range-dropdown";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import type { SubDepartmentStatusConfig } from "@/components/board/board-types";
import { TaskListRow, TaskListHead } from "@/components/tasks/task-list-table";
import { ALL_TASKS_COLGROUP, TASK_TABLE_CLASS } from "@/components/tasks/task-list-cells";
import { TasksTableSkeleton } from "@/components/skeletons/page-skeletons";
import { useInfiniteAllTasks, type InfiniteAllTasksFilters } from "@/hooks/queries/use-tasks";
import { buildTicketExportUrl, type ExportFormat } from "@/lib/api/tasks";
import { smartAssignTickets } from "@/lib/api/admin";
import { invalidateTaskCaches } from "@/hooks/queries/invalidate-task-caches";
import { BulkAssignModal } from "@/components/tickets/bulk-assign-modal";
import {
  fetchSavedViews,
  createSavedView,
  deleteSavedView,
  type SavedView,
  type SavedViewFilters,
} from "@/lib/api/saved-views";
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
];

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

// Order- and empty-insensitive serialization so we can tell whether the live
// filters still match a saved view (to keep its highlight in sync).
function canonFilters(f: SavedViewFilters): string {
  const norm: Record<string, unknown> = {};
  for (const key of Object.keys(f).sort()) {
    const val = (f as Record<string, unknown>)[key];
    if (val === undefined || val === "") continue;
    if (Array.isArray(val)) {
      if (val.length) norm[key] = [...val].sort();
    } else {
      norm[key] = val;
    }
  }
  return JSON.stringify(norm);
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
      <span className="font-sans text-[11.5px] text-pen-subtle">Per page</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex h-8 items-center gap-1.5 rounded-lg border border-pen-card-border bg-transparent px-3 font-sans text-[12px] text-pen-muted transition-colors hover:border-pen-id hover:text-pen-foreground">
          {value}
          <ChevronDown className="size-3 shrink-0" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-auto min-w-[80px] rounded-xl border border-pen-card-border bg-pen-bg p-1.5 shadow-xl"
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
                "flex w-full items-center rounded-md px-3 py-1.5 font-sans text-[12px] transition-colors",
                size === value
                  ? "bg-pen-blue-tint font-semibold text-pen-id"
                  : "text-pen-foreground hover:bg-pen-surface",
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

// ── Saved Views Menu ──────────────────────────────────────────────────────────

function SavedViewsMenu({
  views,
  activeViewId,
  hasFilters,
  onApply,
  onSaveNew,
  onDelete,
}: {
  views: SavedView[];
  activeViewId: string | null;
  hasFilters: boolean;
  onApply: (view: SavedView) => void;
  onSaveNew: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  function submitNew() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSaveNew(trimmed);
    setName("");
    setNaming(false);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setNaming(false);
          setName("");
        }
      }}
    >
      <PopoverTrigger className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-pen-card-border bg-transparent px-3 font-sans text-[12px] whitespace-nowrap text-pen-muted transition-colors hover:border-pen-id hover:text-pen-foreground">
        <Bookmark className="size-3.5" />
        <span className="hidden sm:inline">Views</span>
        {views.length > 0 && (
          <span className="rounded-full bg-pen-surface px-1.5 text-[10.5px] font-semibold text-pen-subtle">
            {views.length}
          </span>
        )}
        <ChevronDown className="size-3 shrink-0" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-64 rounded-xl border border-pen-card-border bg-pen-bg p-1.5 shadow-xl"
      >
        {views.length === 0 ? (
          <p className="px-3 py-2 font-sans text-[11.5px] text-pen-subtle">
            No saved views yet. Set some filters, then save this view.
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {views.map((view) => (
              <div
                key={view.id}
                className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-pen-surface"
              >
                <button
                  type="button"
                  onClick={() => {
                    onApply(view);
                    setOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left font-sans text-[12px] text-pen-foreground"
                >
                  {view.id === activeViewId ? (
                    <Check className="size-3.5 shrink-0 text-pen-id" />
                  ) : (
                    <Bookmark className="size-3.5 shrink-0 text-pen-subtle" />
                  )}
                  <span className="truncate">{view.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(view.id)}
                  aria-label={`Delete view ${view.name}`}
                  className="shrink-0 rounded p-1 text-pen-subtle opacity-0 transition-opacity hover:text-pen-red group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="my-1 h-px bg-pen-card-border" />

        {naming ? (
          <div className="flex items-center gap-1 p-1">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNew();
                if (e.key === "Escape") setNaming(false);
              }}
              placeholder="View name…"
              className="h-8 min-w-0 flex-1 rounded-md border border-pen-card-border bg-transparent px-2.5 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
            />
            <button
              type="button"
              onClick={submitNew}
              disabled={!name.trim()}
              className="flex h-8 shrink-0 items-center rounded-md bg-pen-blue px-2.5 font-sans text-[12px] font-semibold text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            disabled={!hasFilters}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 font-sans text-[12px] text-pen-id transition-colors hover:bg-pen-blue-tint disabled:cursor-not-allowed disabled:text-pen-subtle disabled:hover:bg-transparent"
          >
            <Plus className="size-3.5" />
            {hasFilters ? "Save current filters as view" : "Set filters to save a view"}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Export Menu ────────────────────────────────────────────────────────────────

const EXPORT_OPTIONS: { format: ExportFormat; label: string }[] = [
  { format: "excel", label: "Excel (.xlsx)" },
  { format: "pdf", label: "PDF (.pdf)" },
  { format: "csv", label: "CSV (.csv)" },
];

function ExportMenu({ filters }: { filters: InfiniteAllTasksFilters }) {
  const [open, setOpen] = useState(false);

  function handleExport(format: ExportFormat) {
    const url = buildTicketExportUrl(filters, format);
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-pen-card-border bg-transparent px-3 font-sans text-[12px] whitespace-nowrap text-pen-muted transition-colors hover:border-pen-id hover:text-pen-foreground">
        <Download className="size-3.5" />
        <span className="hidden sm:inline">Export</span>
        <ChevronDown className="size-3 shrink-0" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-48 rounded-xl border border-pen-card-border bg-pen-bg p-1.5 shadow-xl"
      >
        <p className="px-3 pb-1.5 pt-1 font-sans text-[11px] text-pen-subtle">
          Export current filters
        </p>
        {EXPORT_OPTIONS.map((opt) => (
          <button
            key={opt.format}
            type="button"
            onClick={() => handleExport(opt.format)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left font-sans text-[12px] text-pen-foreground transition-colors hover:bg-pen-surface"
          >
            <Download className="size-3.5 shrink-0 text-pen-subtle" />
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
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
  const [selPeople, setSelPeople] = useState<Set<string>>(new Set()); // profile IDs
  const [selModule, setSelModule] = useState<Set<string>>(new Set()); // module IDs
  const [selLabels, setSelLabels] = useState<Set<string>>(new Set()); // label names
  const [selSource, setSelSource] = useState<Set<string>>(new Set()); // "intake" | "manual"
  const [dateRange, setDateRange] = useState<DateRange>(null);
  const [targetRange, setTargetRange] = useState<DateRange>(null);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  // ── Bulk selection ──────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: labelsData } = useQuery({
    queryKey: ["labels"],
    queryFn: () => fetch("/api/labels").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // ── Saved views ──────────────────────────────────────────────────────────────
  const { data: savedViews = [] } = useQuery({
    queryKey: ["saved-views"],
    queryFn: fetchSavedViews,
    staleTime: 5 * 60 * 1000,
  });
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);

  // Debounce search — only the debounced value goes to the API
  const search = useDebounce(rawSearch, 500);

  // The subset of filter state that a saved view persists.
  const currentFilters: SavedViewFilters = useMemo(
    () => ({
      status: selStatus.size ? [...selStatus] : undefined,
      priority: selPriority.size ? [...selPriority] : undefined,
      projectId: selProject.size ? [...selProject] : undefined,
      assigneeId: selPeople.size ? [...selPeople] : undefined,
      moduleId: selModule.size ? [...selModule] : undefined,
      labels: selLabels.size ? [...selLabels] : undefined,
      source: selSource.size === 1 ? ([...selSource][0] as "intake" | "manual") : undefined,
      sort: sortKey,
      search: search || undefined,
      dateFrom: dateRange?.from ?? undefined,
      dateTo: dateRange?.to ?? undefined,
      targetDateFrom: targetRange?.from ?? undefined,
      targetDateTo: targetRange?.to ?? undefined,
    }),
    [selStatus, selPriority, selProject, selPeople, selModule, selLabels, selSource, sortKey, search, dateRange, targetRange],
  );

  function applySavedView(view: SavedView) {
    const f = view.filters;
    setSelStatus(new Set(f.status ?? []));
    setSelPriority(new Set(f.priority ?? []));
    setSelProject(new Set(f.projectId ?? []));
    setSelPeople(new Set(f.assigneeId ?? []));
    setSelModule(new Set(f.moduleId ?? []));
    setSelLabels(new Set(f.labels ?? []));
    setSelSource(new Set(f.source ? [f.source] : []));
    setSortKey((f.sort as SortKey) ?? "created");
    setRawSearch(f.search ?? "");
    setDateRange(f.dateFrom && f.dateTo ? { from: f.dateFrom, to: f.dateTo } : null);
    setTargetRange(f.targetDateFrom && f.targetDateTo ? { from: f.targetDateFrom, to: f.targetDateTo } : null);
    setSelectedViewId(view.id);
  }

  async function handleSaveView(name: string) {
    try {
      const views = await createSavedView(name, currentFilters);
      queryClient.setQueryData(["saved-views"], views);
      const created = views.find((v) => v.name.toLowerCase() === name.toLowerCase());
      if (created) setSelectedViewId(created.id);
      toast.success(`View "${name}" saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save view");
    }
  }

  async function handleDeleteView(id: string) {
    try {
      const views = await deleteSavedView(id);
      queryClient.setQueryData(["saved-views"], views);
      if (selectedViewId === id) setSelectedViewId(null);
    } catch {
      toast.error("Failed to delete view");
    }
  }

  // Highlight the active view only while the live filters still match it —
  // derived so editing a filter silently clears the highlight (no effect).
  const activeViewId = useMemo(() => {
    if (!selectedViewId) return null;
    const active = savedViews.find((v) => v.id === selectedViewId);
    if (!active) return null;
    return canonFilters(active.filters) === canonFilters(currentFilters) ? selectedViewId : null;
  }, [selectedViewId, savedViews, currentFilters]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Build filter params for the query key + API ─────────────────────────────
  const filters = useMemo(
    () => ({
      limit: pageSize,
      search: search || undefined,
      status: selStatus.size ? [...selStatus] : undefined,
      priority: selPriority.size ? [...selPriority] : undefined,
      projectId: selProject.size ? [...selProject] : undefined,
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
      source: selSource.size === 1 ? ([...selSource][0] as "intake" | "manual") : undefined,
    }),
    [
      pageSize,
      search,
      selStatus,
      selPriority,
      selProject,
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
  } = useInfiniteAllTasks(filters);

  const allTasks = useMemo(
    () => data?.pages.flatMap((p) => p.tasks) ?? [],
    [data],
  );
  const isPrivileged = data?.pages[0]?.isPrivileged ?? false;
  const canExport = data?.pages[0]?.canExport ?? false;
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
    setSelPeople(new Set());
    setSelModule(new Set());
    setSelLabels(new Set());
    setSelSource(new Set());
    setDateRange(null);
    setTargetRange(null);
    setSelectedViewId(null);
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
          <PageHeader title="All Tasks" icon={ListTodo} iconClassName="text-pen-blue" className="mb-3" />
        )}

        <div
          className={cn(
            "flex flex-col gap-2 xl:flex-row xl:items-center xl:gap-3",
            hideTitleBar ? "mb-0" : "mb-3 sm:mb-4",
          )}
        >
          {/* Stats */}
          <p className="shrink-0 font-sans text-[12px] text-pen-muted sm:text-[12.5px]">
            {isLoading ? (
              <span className="text-pen-subtle">Loading…</span>
            ) : (
              <>
                <span className="font-semibold text-pen-foreground">
                  {allTasks.length}
                </span>
                {" of "}
                <span className="font-semibold text-pen-foreground">
                  {serverTotal}
                </span>
                {" ticket"}
                {serverTotal === 1 ? "" : "s"}
                {!isPrivileged && (
                  <span className="ml-1.5 rounded-full bg-pen-surface px-2 py-0.5 font-sans text-[11.5px] text-pen-subtle">
                    your projects only
                  </span>
                )}
                {isFetching && !isFetchingNextPage && (
                  <Loader2 className="ml-2 inline size-3.5 animate-spin text-pen-subtle" />
                )}
              </>
            )}
          </p>

          {/* Toolbar */}
          <div className="min-w-0 flex-1 overflow-x-auto pb-1 [scrollbar-width:none] max-xl:-mx-4 max-xl:px-4 sm:max-xl:-mx-6 sm:max-xl:px-6 xl:px-0 [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max min-w-full flex-wrap items-center gap-2 xl:w-full">
              {/* Search */}
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
                <input
                  value={rawSearch}
                  onChange={(e) => setRawSearch(e.target.value)}
                  placeholder="Search tickets…"
                  className="h-8 w-36 rounded-lg border border-pen-card-border bg-transparent pl-8 pr-3 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id sm:w-48"
                />
                {rawSearch && (
                  <button
                    type="button"
                    onClick={() => setRawSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-pen-subtle hover:text-pen-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              <div className="hidden h-5 w-px shrink-0 bg-pen-card-border sm:block" />

              <FilterDropdown
                label="Status"
                options={statusOptions}
                selected={selStatus}
                onToggle={(id) => setSelStatus(toggle(selStatus, id))}
                onClear={() => setSelStatus(new Set())}
              />
              <FilterDropdown
                label="Priority"
                options={PRIORITY_OPTIONS}
                selected={selPriority}
                onToggle={(id) => setSelPriority(toggle(selPriority, id))}
                onClear={() => setSelPriority(new Set())}
              />
              <FilterDropdown
                label="Project"
                options={projectOptions}
                selected={selProject}
                onToggle={(id) => setSelProject(toggle(selProject, id))}
                onClear={() => setSelProject(new Set())}
              />
              {!unassignedOnly && (
                <FilterDropdown
                  label="People"
                  options={peopleOptions}
                  selected={selPeople}
                  onToggle={(id) => setSelPeople(toggle(selPeople, id))}
                  onClear={() => setSelPeople(new Set())}
                />
              )}
              {moduleOptions.length > 0 && (
                <FilterDropdown
                  label="Module"
                  options={moduleOptions}
                  selected={selModule}
                  onToggle={(id) => setSelModule(toggle(selModule, id))}
                  onClear={() => setSelModule(new Set())}
                />
              )}
              {labelOptions.length > 0 && (
                <FilterDropdown
                  label="Labels"
                  options={labelOptions}
                  selected={selLabels}
                  onToggle={(name) => setSelLabels(toggle(selLabels, name))}
                  onClear={() => setSelLabels(new Set())}
                />
              )}
              <FilterDropdown
                label="Source"
                options={SOURCE_OPTIONS}
                selected={selSource}
                onToggle={(id) => setSelSource(toggleExclusive(selSource, id))}
                onClear={() => setSelSource(new Set())}
              />
              <DateRangeDropdown
                value={dateRange}
                onChange={setDateRange}
                onClear={() => setDateRange(null)}
              />
              <DateRangeDropdown
                value={targetRange}
                onChange={setTargetRange}
                onClear={() => setTargetRange(null)}
                placeholder="Target date"
                icon={CalendarClock}
                future
              />

              <div className="hidden flex-1 lg:block" />

              <PageSizeSelector value={pageSize} onChange={setPageSize} />

              <SortDropdown
                value={sortKey}
                onChange={(v) => setSortKey(v as SortKey)}
              />

              <SavedViewsMenu
                views={savedViews}
                activeViewId={activeViewId}
                hasFilters={!!hasFilters}
                onApply={applySavedView}
                onSaveNew={handleSaveView}
                onDelete={handleDeleteView}
              />

              {canExport && <ExportMenu filters={filters} />}

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-pen-card-border bg-transparent px-3 font-sans text-[12px] whitespace-nowrap text-pen-muted transition-colors hover:border-pen-red hover:text-pen-red"
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
                  className="flex items-center gap-1 rounded-full bg-pen-blue-tint px-2.5 py-0.5 font-sans text-[11.5px] font-semibold text-pen-id"
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
      {isLoading ? (
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
                    className="py-20 text-center font-sans text-[13px] text-pen-subtle"
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
                              next.has(id) ? next.delete(id) : next.add(id);
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
              <span className="flex items-center gap-2 font-sans text-[12px] text-pen-muted">
                <Loader2 className="size-3.5 animate-spin" />
                Loading more…
              </span>
            ) : hasNextPage ? (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                className="font-sans text-[12px] text-pen-id hover:underline"
              >
                Load {pageSize} more
              </button>
            ) : allTasks.length > 0 ? (
              <span className="font-sans text-[12px] text-pen-subtle">
                All {serverTotal} ticket{serverTotal === 1 ? "" : "s"} loaded
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>

    {/* Floating assign button — appears bottom-right when tickets are selected (Unassigned tab only) */}
    {showBulkSelect && selectedIds.size > 0 && (
      <div className="fixed bottom-6 right-6 z-50 flex animate-in items-center gap-1 rounded-full border border-pen-card-border bg-pen-card py-1.5 pr-1.5 pl-4 shadow-2xl fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-150">
        <span className="flex items-center gap-1.5 font-sans text-[12.5px] font-medium text-pen-foreground">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-pen-blue-tint font-sans text-[11px] font-bold text-pen-blue">
            {selectedIds.size}
          </span>
          selected
        </span>

        <div className="mx-2 h-5 w-px shrink-0 bg-pen-card-border" />

        <button
          type="button"
          onClick={() => setAssignModalOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-pen-blue px-4 font-sans text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-pen-blue/90"
        >
          <Users className="size-3.5 shrink-0" />
          Assign {selectedIds.size} Ticket{selectedIds.size === 1 ? "" : "s"}
        </button>
        <button
          type="button"
          onClick={() => setSelectedIds(new Set())}
          aria-label="Clear selection"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground"
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
