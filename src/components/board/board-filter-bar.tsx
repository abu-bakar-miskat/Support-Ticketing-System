"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Building2,
  FolderKanban,
  Flag,
  CalendarDays,
  CalendarClock,
  Inbox,
  Tag,
  Boxes,
  ChevronDown,
  Check,
  X,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { TeamBoardGroup } from "@/components/board/board-types";
import { labelStyle } from "@/components/board/board-types";
import type { DateFilter, IntakeFilter, LabelFilter, PriorityFilter, ProjectFilter, ModuleFilter } from "@/components/board/board-filters";
import { formatRangeLabel, type DateRange } from "@/components/ui/date-range-dropdown";
import { formatCalendarDate } from "@/lib/ticket-datetime";

function optionWithCount(opt: { value: string; label: string; count?: number }) {
  return {
    value: opt.value,
    label: opt.count !== undefined ? `${opt.label} (${opt.count})` : opt.label,
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function useLabelsColorMap(): Map<string, string> {
  const { data } = useQuery({
    queryKey: ["labels"],
    queryFn: () => fetch("/api/labels").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
  const map = new Map<string, string>();
  for (const lbl of (data?.labels ?? [])) map.set(lbl.name, lbl.color);
  return map;
}

function LabelMultiSelect({
  value,
  onChange,
  options,
  active = false,
}: {
  value: LabelFilter;
  onChange: (v: LabelFilter) => void;
  options: string[];
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const colorsMap = useLabelsColorMap();

  function toggle(lbl: string) {
    const next = value.includes(lbl) ? value.filter((l) => l !== lbl) : [...value, lbl];
    onChange(next);
  }

  const label = value.length === 0 ? "Labels" : value.length === 1 ? value[0] : `Labels (${value.length})`;
  const filteredOptions = query.trim()
    ? options.filter((lbl) => lbl.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger
        aria-label="Filter by label"
        className={cn(
          "flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 font-sans text-[11.5px] transition-colors",
          active
            ? "border-pen-blue/40 bg-pen-blue-tint text-pen-foreground"
            : "border-pen-card-border bg-pen-card text-pen-foreground hover:border-pen-muted",
        )}
      >
        <Tag className={cn("size-3.5 shrink-0", active ? "text-pen-blue" : "text-pen-subtle")} />
        <span className="max-w-[120px] truncate">{label}</span>
        <ChevronDown className="size-3 shrink-0 text-pen-subtle" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-52 rounded-xl border border-pen-card-border bg-pen-bg p-0 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-pen-card-border px-3 py-2">
          <span className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-pen-subtle">Labels</span>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="font-sans text-[11.5px] text-pen-muted hover:text-pen-red">
              Clear
            </button>
          )}
        </div>
        <div className="relative border-b border-pen-card-border px-2.5 py-2">
          <Search className="pointer-events-none absolute left-[18px] top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-md border border-pen-card-border bg-transparent py-1 pl-8 pr-2 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
          />
        </div>
        <div className="max-h-56 overflow-y-auto p-1.5">
          {options.length === 0 ? (
            <p className="px-2.5 py-2 font-sans text-[11.5px] text-pen-subtle">No labels in current view</p>
          ) : filteredOptions.length === 0 ? (
            <p className="px-2.5 py-2 font-sans text-[11.5px] text-pen-subtle">No matches</p>
          ) : (
            filteredOptions.map((lbl) => {
              const savedColor = colorsMap.get(lbl);
              const dotColor = savedColor ?? labelStyle(lbl).dot;
              const checked = value.includes(lbl);
              return (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => toggle(lbl)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    checked ? "bg-pen-blue-tint" : "hover:bg-pen-surface",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                      checked ? "border-pen-blue bg-pen-blue" : "border-pen-card-border bg-transparent",
                    )}
                  >
                    {checked && <Check className="size-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <span
                    className="inline-flex items-center whitespace-nowrap font-sans text-[10.5px] font-medium text-pen-foreground"
                    style={{
                      clipPath: "polygon(0 0, calc(100% - 6px) 0%, 100% 50%, calc(100% - 6px) 100%, 0 100%, 4px 50%)",
                      paddingLeft: "8px",
                      paddingRight: "10px",
                      paddingTop: "2px",
                      paddingBottom: "2px",
                      backgroundColor: hexToRgba(dotColor, 0.2),
                      filter: `drop-shadow(0 0 0 1px ${hexToRgba(dotColor, 0.5)})`,
                    }}
                  >
                    {lbl}
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

const PRIORITY_OPTIONS: { value: PriorityFilter; label: string }[] = [
  { value: "all", label: "All priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "critical", label: "Critical" },
  { value: "high_plus", label: "High & above" },
  { value: "high", label: "High only" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

type DateFilterVariant = "due" | "target";

const DATE_FILTER_COPY: Record<
  DateFilterVariant,
  {
    icon: typeof CalendarDays;
    aria: string;
    allLabel: string;
    rangeFallback: string;
    statusHeading: string;
    withinHeading: string;
    customHeading: string;
    applyLabel: string;
    options: { value: DateFilter; label: string }[];
  }
> = {
  due: {
    icon: CalendarDays,
    aria: "Filter by due date",
    allLabel: "Any due date",
    rangeFallback: "Due range",
    statusHeading: "Due status",
    withinHeading: "Due within",
    customHeading: "Custom due range",
    applyLabel: "Apply due range",
    options: [
      { value: "all", label: "Any due date" },
      { value: "overdue", label: "Overdue" },
      { value: "today", label: "Due today" },
      { value: "week", label: "Due this week" },
      { value: "none", label: "No due date" },
    ],
  },
  target: {
    icon: CalendarClock,
    aria: "Filter by target date",
    allLabel: "Any target date",
    rangeFallback: "Target range",
    statusHeading: "Target status",
    withinHeading: "Target within",
    customHeading: "Custom target range",
    applyLabel: "Apply target range",
    options: [
      { value: "all", label: "Any target date" },
      { value: "overdue", label: "Past target" },
      { value: "today", label: "Target today" },
      { value: "week", label: "Target this week" },
      { value: "none", label: "No target date" },
    ],
  },
};

const DUE_RANGE_PRESETS = [
  { id: "7d", label: "Next 7 days", days: 7 },
  { id: "30d", label: "Next 30 days", days: 30 },
  { id: "90d", label: "Next 3 months", days: 90 },
] as const;

function duePresetRange(days: number): NonNullable<DateRange> {
  const from = new Date();
  const to = new Date();
  to.setDate(from.getDate() + days);
  return { from: formatCalendarDate(from), to: formatCalendarDate(to) };
}

function dateFilterTriggerLabel(
  variant: DateFilterVariant,
  dateFilter: DateFilter,
  dueRange: DateRange,
): string {
  const copy = DATE_FILTER_COPY[variant];
  if (dueRange) {
    const label = formatRangeLabel(dueRange);
    return label === "Time range" ? copy.rangeFallback : label;
  }
  return copy.options.find((o) => o.value === dateFilter)?.label ?? copy.allLabel;
}

function HybridDueDateFilter({
  variant = "due",
  dateFilter,
  onDateFilterChange,
  dueRange,
  onDueRangeChange,
}: {
  variant?: DateFilterVariant;
  dateFilter: DateFilter;
  onDateFilterChange: (value: DateFilter) => void;
  dueRange: DateRange;
  onDueRangeChange: (value: DateRange) => void;
}) {
  const copy = DATE_FILTER_COPY[variant];
  const TriggerIcon = copy.icon;
  const [open, setOpen] = useState(false);
  const defaultFrom = formatCalendarDate(new Date());
  const defaultTo = formatCalendarDate(new Date(Date.now() + 30 * 86_400_000));
  const [customFrom, setCustomFrom] = useState(dueRange?.from ?? defaultFrom);
  const [customTo, setCustomTo] = useState(dueRange?.to ?? defaultTo);

  const active = dateFilter !== "all" || dueRange !== null;
  const label = dateFilterTriggerLabel(variant, dateFilter, dueRange);

  function selectPreset(value: DateFilter) {
    onDateFilterChange(value);
    if (value !== "all") setOpen(false);
  }

  function applyDuePreset(days: number) {
    const range = duePresetRange(days);
    setCustomFrom(range.from);
    setCustomTo(range.to);
    onDueRangeChange(range);
    setOpen(false);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    const from = customFrom <= customTo ? customFrom : customTo;
    const to = customFrom <= customTo ? customTo : customFrom;
    onDueRangeChange({ from, to });
    setOpen(false);
  }

  function clearAll() {
    // setDateFilter("all") also clears dueRange in persisted filters
    onDateFilterChange("all");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={copy.aria}
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-sans text-[12px] transition-colors",
          active
            ? "border-pen-blue/40 bg-pen-blue-tint text-pen-foreground"
            : "border-pen-card-border bg-pen-card text-pen-foreground hover:border-pen-muted",
        )}
      >
        <TriggerIcon className={cn("size-3.5 shrink-0", active ? "text-pen-blue" : "text-pen-subtle")} />
        <span className="max-w-[10rem] truncate">{label}</span>
        {active ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                clearAll();
              }
            }}
            className="ml-0.5 cursor-pointer hover:opacity-70"
            aria-label={`Clear ${variant === "target" ? "target" : "due"} date filter`}
          >
            <X className="size-3" />
          </span>
        ) : (
          <ChevronDown className="size-3 shrink-0 text-pen-muted" />
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 overflow-hidden rounded-xl border border-pen-card-border bg-pen-bg p-0 shadow-xl"
      >
        <div className="border-b border-pen-card-border px-1.5 py-1.5">
          <p className="px-2 pb-1 pt-1.5 font-sans text-[11.5px] font-semibold uppercase tracking-[1.1px] text-pen-subtle">
            {copy.statusHeading}
          </p>
          {copy.options.map((opt) => {
            const checked = !dueRange && dateFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectPreset(opt.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-sans text-[12.5px] transition-colors",
                  checked ? "bg-pen-blue-tint text-pen-foreground" : "text-pen-foreground hover:bg-pen-surface",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                    checked ? "border-pen-blue bg-pen-blue" : "border-pen-card-border",
                  )}
                >
                  {checked && <Check className="size-2.5 text-white" strokeWidth={3} />}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="border-b border-pen-card-border bg-pen-surface/60 px-3 py-3 dark:bg-white/[0.03]">
          <p className="mb-2.5 font-sans text-[11.5px] font-semibold uppercase tracking-[1.1px] text-pen-subtle">
            {copy.withinHeading}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DUE_RANGE_PRESETS.map((p) => {
              const range = duePresetRange(p.days);
              const selected =
                !!dueRange && dueRange.from === range.from && dueRange.to === range.to;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyDuePreset(p.days)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 font-sans text-[11.5px] font-medium transition-colors",
                    selected
                      ? "border-pen-blue bg-pen-blue text-white dark:text-gray-900"
                      : "border-pen-card-border bg-pen-bg text-pen-muted hover:border-pen-id hover:text-pen-foreground dark:bg-white/5",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-3 py-3">
          <p className="mb-2.5 font-sans text-[11.5px] font-semibold uppercase tracking-[1.1px] text-pen-subtle">
            {copy.customHeading}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["From", "To"] as const).map((field) => (
              <div key={field} className="flex flex-col gap-1">
                <span className="font-sans text-[11.5px] text-pen-subtle">{field}</span>
                <input
                  type="date"
                  value={field === "From" ? customFrom : customTo}
                  onChange={(e) =>
                    field === "From" ? setCustomFrom(e.target.value) : setCustomTo(e.target.value)
                  }
                  className="h-8 w-full rounded-lg border border-pen-card-border bg-pen-surface px-2 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-id dark:bg-white/5"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={applyCustom}
            className="mt-3 w-full rounded-lg bg-pen-blue py-2 font-sans text-[12px] font-semibold text-white transition-opacity hover:opacity-90 dark:text-gray-900"
          >
            {copy.applyLabel}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const INTAKE_OPTIONS: { value: IntakeFilter; label: string }[] = [
  { value: "all", label: "Any source" },
  { value: "intake", label: "From support form" },
  { value: "non_intake", label: "Not from support" },
];

type Props = {
  view: "list" | "board";
  isPrivileged: boolean;
  currentUserId: string;
  currentUserName: string;
  assigneeFilter: string;
  onAssigneeFilterChange: (value: string) => void;
  people: { id: string; name: string; avatarUrl?: string | null }[];
  projects: { id: string; name: string }[];
  projectFilter: ProjectFilter;
  onProjectFilterChange: (value: ProjectFilter) => void;
  modules: { id: string; name: string }[];
  moduleFilter: ModuleFilter;
  onModuleFilterChange: (value: ModuleFilter) => void;
  teamBoardGroups: TeamBoardGroup[];
  activeTeamId: string;
  onTeamChange: (teamId: string) => void;
  listTeamFilter: string;
  onListTeamFilterChange: (teamId: string) => void;
  cardCountByTeam: Map<string, number>;
  priorityFilter: PriorityFilter;
  onPriorityFilterChange: (value: PriorityFilter) => void;
  dateFilter: DateFilter;
  onDateFilterChange: (value: DateFilter) => void;
  dueRange: DateRange;
  onDueRangeChange: (value: DateRange) => void;
  targetDateFilter: DateFilter;
  onTargetDateFilterChange: (value: DateFilter) => void;
  targetRange: DateRange;
  onTargetRangeChange: (value: DateRange) => void;
  intakeFilter: IntakeFilter;
  onIntakeFilterChange: (value: IntakeFilter) => void;
  labelFilter: LabelFilter;
  onLabelFilterChange: (value: LabelFilter) => void;
  availableLabels: string[];
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  assigneeCounts: { me: number; all: number; unassigned: number };
  className?: string;
};

export function BoardFilterBar({
  view,
  isPrivileged,
  currentUserId,
  currentUserName,
  assigneeFilter,
  onAssigneeFilterChange,
  people,
  projects,
  projectFilter,
  onProjectFilterChange,
  modules,
  moduleFilter,
  onModuleFilterChange,
  teamBoardGroups,
  activeTeamId,
  onTeamChange,
  listTeamFilter,
  onListTeamFilterChange,
  cardCountByTeam,
  priorityFilter,
  onPriorityFilterChange,
  dateFilter,
  onDateFilterChange,
  dueRange,
  onDueRangeChange,
  targetDateFilter,
  onTargetDateFilterChange,
  targetRange,
  onTargetRangeChange,
  intakeFilter,
  onIntakeFilterChange,
  labelFilter,
  onLabelFilterChange,
  availableLabels,
  hasActiveFilters,
  onClearFilters,
  assigneeCounts,
  className,
}: Props) {
  const peopleOptions = [
    { value: "me", label: "Me", count: assigneeCounts.me },
    ...(isPrivileged
      ? [
          { value: "all", label: "Everyone", count: assigneeCounts.all },
          {
            value: "unassigned",
            label: "Unassigned",
            count: assigneeCounts.unassigned,
          },
          ...people
            .filter((p) => p.id !== currentUserId)
            .map((p) => ({ value: p.id, label: p.name })),
        ]
      : []),
  ].map(optionWithCount);

  const teamOptions =
    teamBoardGroups.length > 1
      ? [
          {
            value: "all",
            label: "All teams",
            count: [...cardCountByTeam.values()].reduce((a, b) => a + b, 0),
          },
          ...teamBoardGroups.map((g) => ({
            value: g.teamId,
            label: g.teamName,
            count: cardCountByTeam.get(g.teamId) ?? 0,
          })),
        ].map(optionWithCount)
      : [];

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {/* People */}
      {isPrivileged ? (
        <SearchableSelect
          value={assigneeFilter}
          onChange={onAssigneeFilterChange}
          options={peopleOptions}
          aria-label="Filter by assignee"
          icon={Users}
          size="sm"
          highlightWhenSet={assigneeFilter !== "all"}
          className="w-auto max-w-[11rem] shrink-0"
        />
      ) : (
        <div className="flex h-7 items-center gap-1 rounded-md border border-pen-blue/30 bg-pen-blue-tint px-2 font-sans text-[11.5px] text-pen-foreground">
          <UserAvatar
            name={currentUserName || "Me"}
            size={16}
            meta={{}}
          />
          <span className="font-medium whitespace-nowrap">My tasks</span>
          <span className="font-sans text-[11.5px] text-pen-subtle">
            {assigneeCounts.me}
          </span>
        </div>
      )}

      {/* Team */}
      {teamOptions.length > 1 && (
        <SearchableSelect
          value={view === "list" ? listTeamFilter : activeTeamId}
          onChange={view === "list" ? onListTeamFilterChange : onTeamChange}
          options={teamOptions}
          aria-label="Filter by team"
          icon={Building2}
          size="sm"
          highlightWhenSet={view === "list" ? listTeamFilter !== "all" : activeTeamId !== "all"}
          className="w-auto max-w-[11rem] shrink-0"
        />
      )}

      {/* Project */}
      {projects.length > 0 && (
        <SearchableSelect
          value={projectFilter}
          onChange={onProjectFilterChange}
          options={[
            { value: "all", label: "All projects" },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
          aria-label="Filter by project"
          icon={FolderKanban}
          size="sm"
          highlightWhenSet={projectFilter !== "all"}
          className="w-auto max-w-[11rem] shrink-0"
        />
      )}

      {/* Module */}
      {modules.length > 0 && (
        <SearchableSelect
          value={moduleFilter}
          onChange={onModuleFilterChange}
          options={[
            { value: "all", label: "All modules" },
            ...modules.map((m) => ({ value: m.id, label: m.name })),
          ]}
          aria-label="Filter by module"
          icon={Boxes}
          size="sm"
          highlightWhenSet={moduleFilter !== "all"}
          className="w-auto max-w-[11rem] shrink-0"
        />
      )}

      {/* Priority */}
      <SearchableSelect
        value={priorityFilter}
        onChange={(v) => onPriorityFilterChange(v as PriorityFilter)}
        options={PRIORITY_OPTIONS}
        aria-label="Filter by priority"
        icon={Flag}
        size="sm"
        highlightWhenSet={priorityFilter !== "all"}
        className="w-auto max-w-[10rem] shrink-0"
      />

      {/* Due date — presets + custom range in one control */}
      <HybridDueDateFilter
        dateFilter={dateFilter}
        onDateFilterChange={onDateFilterChange}
        dueRange={dueRange}
        onDueRangeChange={onDueRangeChange}
      />

      {/* Target date — per-person estimate target, matches any assignee */}
      <HybridDueDateFilter
        variant="target"
        dateFilter={targetDateFilter}
        onDateFilterChange={onTargetDateFilterChange}
        dueRange={targetRange}
        onDueRangeChange={onTargetRangeChange}
      />

      {/* Intake source */}
      <SearchableSelect
        value={intakeFilter}
        onChange={(v) => onIntakeFilterChange(v as IntakeFilter)}
        options={INTAKE_OPTIONS}
        aria-label="Filter by support source"
        icon={Inbox}
        size="sm"
        highlightWhenSet={intakeFilter !== "all"}
        className="w-auto max-w-[10rem] shrink-0"
      />

      {/* Labels */}
      <LabelMultiSelect
        value={labelFilter}
        onChange={onLabelFilterChange}
        options={availableLabels}
        active={labelFilter.length > 0}
      />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="flex h-7 items-center gap-1 rounded-md px-1.5 font-sans text-[11.5px] text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
        >
          <X className="size-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}
