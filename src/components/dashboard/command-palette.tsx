"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, Clock, Home, CheckSquare, LayoutGrid, FileText,
  Settings, FolderKanban, Users, Workflow, Tag, Inbox,
  AtSign, LayoutList, BarChart2, Ticket, Check,
} from "lucide-react";
import { DepartmentIcon } from "@/components/icons/department-icon";
import { DepartmentIconVisual } from "@/components/icons/department-icon-visual";
import { getDepartmentIcon } from "@/lib/department-icons";
import { cn } from "@/lib/utils";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { statusStyle } from "@/components/board/board-types";
import { UI_PRIORITY_DOT_HEX, uiPriorityFromDb } from "@/components/board/board-types";

function Kbd({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((k) => (
        <span key={k} className="flex h-5 min-w-[20px] items-center justify-center rounded border border-pen-card-border bg-pen-surface px-1.5 font-mono text-[11.5px] font-medium text-pen-muted dark:bg-pen-secondary-bg">
          {k}
        </span>
      ))}
    </div>
  );
}

function EnterBtn() {
  return (
    <div className="flex size-5 shrink-0 items-center justify-center rounded bg-pen-button">
      <span className="font-sans text-[11.5px] text-pen-button-fg">↵</span>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const s = statusStyle(status);
  return <span className={cn("block size-[7px] shrink-0 rounded-full", s.dot)} />;
}

function PriorityDot({ priority }: { priority: string | null }) {
  const ui = priority ? uiPriorityFromDb(priority) : "low";
  const color = UI_PRIORITY_DOT_HEX[ui];
  return (
    <span
      className="block size-[7px] shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function ProjectStatusBadge({ status }: { status: string }) {
  const label =
    status === "pipeline" ? "Pipeline"
    : status === "active" ? "Active"
    : status === "on_hold" ? "On Hold"
    : status === "completed" ? "Completed"
    : status === "cancelled" ? "Cancelled"
    : status;

  const colorClass =
    status === "active"
      ? "bg-pen-green-tint text-[#15803d] dark:bg-[#152a20] dark:text-[#6ee7a0]"
      : status === "pipeline"
        ? "bg-[#f1f5f9] text-[#64748b] dark:bg-[#2a2e36] dark:text-[#94a3b8]"
        : status === "on_hold"
          ? "bg-[#fff7ed] text-[#c2410c] dark:bg-[#3a2818] dark:text-[#fdba74]"
          : status === "completed"
            ? "bg-pen-blue-tint text-[#0369a1] dark:bg-[#1a3444] dark:text-[#7dd3fc]"
            : "bg-[#f1f5f9] text-[#64748b] dark:bg-[#2a2e36] dark:text-[#94a3b8]";

  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-sans text-[10.5px] font-medium ring-1 ring-inset ring-black/5 dark:ring-white/10", colorClass)}>
      {label}
    </span>
  );
}

const ICON = "size-[16px] shrink-0 text-pen-muted";

export type RecentTicket = { dbId: string; ticketId: string; label: string; meta: string };
export type SidebarProjectItem = { id: string; label: string; href: string; color: string; projectStatus?: string | null };

type SearchTicket = {
  id: string;
  humanId: string;
  title: string;
  status: string;
  priority: string | null;
  project: string | null;
};

type SearchProject = {
  id: string;
  name: string;
  slug: string;
  color: string;
  status: string;
  ticketCount: number;
};

type Item = {
  id: string;
  label: string;
  sub?: string;
  icon?: React.ReactNode;
  colorDot?: string;
  href?: string;
  action?: string;
  onActivate?: () => void;
  isActive?: boolean;
  // Rich ticket/project data for custom rendering
  ticketData?: SearchTicket;
  projectData?: SearchProject;
  recentMeta?: string;
};

type Group = { heading: string; items: Item[] };

const GOTO_ITEMS: Item[] = [
  { id: "nav-home",     label: "Home",         icon: <Home className={ICON} />,         href: "/" },
  { id: "nav-tasks",    label: "My Tasks",      icon: <CheckSquare className={ICON} />,  href: "/tasks" },
  { id: "nav-board",    label: "Board",         icon: <LayoutGrid className={ICON} />,   href: "/board" },
  { id: "nav-all",      label: "All Tasks",     icon: <LayoutList className={ICON} />,   href: "/all-tasks" },
  { id: "nav-projects", label: "Projects",      icon: <FolderKanban className={ICON} />, href: "/projects" },
  { id: "nav-inbox",    label: "Inbox",         icon: <Inbox className={ICON} />,        href: "/inbox" },
  { id: "nav-mentions", label: "Mentions",      icon: <AtSign className={ICON} />,       href: "/mentions" },
  { id: "nav-reports",  label: "Time Reports",  icon: <BarChart2 className={ICON} />,    href: "/reports" },
];

const SETTINGS_ITEMS: Item[] = [
  { id: "s-general",    label: "Settings — General",    icon: <Settings className={ICON} />,   href: "/settings" },
  { id: "s-workflows",  label: "Settings — Workflows",  icon: <Workflow className={ICON} />,   href: "/settings/workflows" },
  { id: "s-members",    label: "Settings — Members",    icon: <Users className={ICON} />,      href: "/settings/members" },
  { id: "s-depts",      label: "Settings — Departments",icon: <DepartmentIcon className={ICON} />,  href: "/settings/departments" },
  { id: "s-projects",   label: "Settings — Projects",   icon: <FolderKanban className={ICON} />,href: "/settings/projects" },
  { id: "s-tags",       label: "Settings — Tags",       icon: <Tag className={ICON} />,        href: "/settings/tags" },
  { id: "s-teams",      label: "Settings — Teams",      icon: <Users className={ICON} />,      href: "/settings/sub-departments" },
];

const ACTION_ITEMS: Item[] = [
  { id: "a-new-ticket", label: "New ticket",        icon: <Plus className={ICON} />,     action: "new-ticket" },
  { id: "a-log-time",   label: "Log time manually", icon: <Clock className={ICON} />,    action: "log-time" },
  { id: "a-reports",    label: "View time reports", icon: <FileText className={ICON} />, href: "/reports" },
];

function buildStaticGroups(projects: SidebarProjectItem[] | undefined): Group[] {
  const groups: Group[] = [];
  if (projects && projects.length > 0) {
    groups.push({
      heading: "PROJECTS",
      items: projects.map((p) => ({
        id: `p-${p.id}`,
        label: p.label,
        sub: p.projectStatus ?? undefined,
        colorDot: p.color,
        href: p.href,
      })),
    });
  }
  groups.push({ heading: "GO TO", items: GOTO_ITEMS });
  groups.push({ heading: "SETTINGS", items: SETTINGS_ITEMS });
  groups.push({ heading: "ACTIONS", items: ACTION_ITEMS });
  return groups;
}

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { recentTickets, projects, allDepts, activeDeptId, userRole } = useDashboardContext();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string>("");
  const [searchResults, setSearchResults] = useState<{ tickets: SearchTicket[]; projects: SearchProject[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced live search — 150ms for snappiness, starts at 1 char
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setSearchResults(null);
      setSearching(false);
      abortRef.current?.abort();
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        if (res.ok) setSearchResults(await res.json());
      } catch {
        // aborted or network error — ignore
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const canSwitchDept = userRole === "admin" || userRole === "manager";

  async function switchDept(deptId: string | null) {
    await fetch("/api/active-dept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deptId }),
    });
    window.location.href = deptId ? "/" : "/departments";
  }

  function buildDeptGroup(filter?: string): Group | null {
    if (!canSwitchDept || !allDepts?.length) return null;
    const items: Item[] = [];

    // "All Departments" global view — admin only
    if (userRole === "admin") {
      const label = "All Departments";
      if (!filter || label.toLowerCase().includes(filter)) {
        items.push({
          id: "dept-all",
          label,
          icon: <DepartmentIcon className={ICON} />,
          isActive: activeDeptId === null,
          onActivate: () => switchDept(null),
        });
      }
    }

    for (const d of allDepts) {
      if (filter && !d.name.toLowerCase().includes(filter)) continue;
      const DeptItemIcon = getDepartmentIcon(d.name, d.id);
      items.push({
        id: `dept-${d.id}`,
        label: d.name,
        icon: <DeptItemIcon className={ICON} />,
        isActive: activeDeptId === d.id,
        onActivate: () => switchDept(d.id),
      });
    }

    if (items.length === 0) return null;
    return { heading: "SWITCH DEPARTMENT", items };
  }

  const staticGroups = buildStaticGroups(projects);

  const visibleGroups: Group[] = query.length >= 2
    ? (() => {
        const q = query.toLowerCase();
        const groups: Group[] = [];

        if (searchResults?.tickets.length) {
          groups.push({
            heading: "TICKETS",
            items: searchResults.tickets.map((t) => ({
              id: `ticket-${t.id}`,
              label: t.title,
              href: `/tickets/${t.id}`,
              ticketData: t,
            })),
          });
        }

        if (searchResults?.projects.length) {
          groups.push({
            heading: "PROJECTS",
            items: searchResults.projects.map((p) => ({
              id: `proj-${p.id}`,
              label: p.name,
              href: `/projects/${p.slug}`,
              projectData: p,
            })),
          });
        }

        // Department switching — filtered by query
        const deptGroup = buildDeptGroup(q);
        if (deptGroup) groups.push(deptGroup);

        // Filter static groups
        for (const g of staticGroups) {
          const filtered = g.items.filter((i) => i.label.toLowerCase().includes(q));
          if (filtered.length) groups.push({ ...g, items: filtered });
        }

        return groups;
      })()
    : [
        ...(recentTickets.length > 0 ? [{
          heading: "RECENT",
          items: recentTickets.map((t) => ({
            id: `r-${t.dbId}`,
            label: t.label,
            recentMeta: t.meta,
            icon: <Ticket className={ICON} />,
            href: `/tickets/${t.dbId}`,
            sub: t.ticketId,
          })),
        }] : []),
        // Department switcher always visible in idle state for admin/manager
        ...((() => { const g = buildDeptGroup(); return g ? [g] : []; })()),
        ...staticGroups,
      ];

  const allItems = visibleGroups.flatMap((g) => g.items);
  const activeIndex = allItems.findIndex((i) => i.id === activeId);

  const handleSelect = useCallback((item: Item) => {
    if (item.onActivate) { item.onActivate(); return; }
    if (item.href) router.push(item.href);
    onClose();
  }, [router, onClose]);

  // Reset on open
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setQuery(""); setSearchResults(null); setActiveId(allItems[0]?.id ?? ""); }
  }

  useEffect(() => {
    if (allItems.length > 0 && activeIndex === -1) setActiveId(allItems[0].id);
  }, [allItems, activeIndex]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); const n = allItems[(activeIndex + 1) % allItems.length]; if (n) setActiveId(n.id); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); const p = allItems[(activeIndex - 1 + allItems.length) % allItems.length]; if (p) setActiveId(p.id); return; }
      if (e.key === "Enter") { e.preventDefault(); const item = allItems[activeIndex]; if (item) handleSelect(item); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, activeIndex, allItems, handleSelect, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="pen-overlay-enter absolute inset-0 pen-overlay-backdrop" />
      <div
        className="relative z-10 w-full max-w-[640px] overflow-hidden rounded-[14px] pen-glass-panel pen-modal-enter border ring-1 ring-white/30 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex h-14 items-center gap-3 border-b border-pen-card-border pl-[18px] pr-4">
          <Search className="size-[18px] shrink-0 text-pen-subtle" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tickets, projects, settings… or try ENG-123"
            className="min-w-0 flex-1 bg-transparent font-sans text-[15px] text-pen-foreground outline-none placeholder:text-pen-subtle"
            style={{ caretColor: "#38bdf8" }}
          />
          {searching && (
            <span className="font-sans text-[11.5px] text-pen-subtle animate-pulse">Searching…</span>
          )}
          <Kbd keys={["esc"]} />
        </div>

        {/* Results */}
        <div className="flex flex-col gap-0.5 overflow-y-auto p-2" style={{ maxHeight: "calc(80vh - 52px - 38px)" }}>
          {visibleGroups.length === 0 && query.length >= 2 && !searching && (
            <p className="py-8 text-center font-sans text-[13px] text-pen-subtle">No results for "{query}"</p>
          )}
          {visibleGroups.map((group) => (
            <div key={group.heading}>
              <div className="flex h-[22px] items-center pl-2.5">
                <span className="pen-text-label">{group.heading}</span>
              </div>
              {group.items.map((item) => {
                const isActive = item.id === activeId;
                const t = item.ticketData;
                const p = item.projectData;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-[10px] rounded-lg px-2.5 text-left transition-colors",
                      (t || p) ? "h-10" : "h-9",
                      isActive ? "bg-pen-blue-tint" : "hover:bg-pen-blue-tint/60 dark:hover:bg-pen-blue-tint/40",
                    )}
                    onMouseEnter={() => setActiveId(item.id)}
                    onClick={() => handleSelect(item)}
                  >
                    {/* Ticket result row */}
                    {t ? (
                      <>
                        <PriorityDot priority={t.priority} />
                        <span className={cn("min-w-0 flex-1 truncate font-sans text-[13px]", isActive ? "text-pen-foreground font-semibold" : "text-pen-foreground")}>
                          {t.title}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          {t.project && (
                            <span className="hidden max-w-[120px] truncate font-sans text-[11.5px] text-pen-subtle sm:block">
                              {t.project}
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                            <StatusDot status={t.status} />
                            <span className="font-sans text-[11.5px] text-pen-subtle">{t.status}</span>
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-pen-id">{t.humanId}</span>
                        </div>
                      </>
                    ) : p ? (
                      /* Project result row */
                      <>
                        <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: p.color }} />
                        <span className={cn("min-w-0 flex-1 truncate font-sans text-[13px]", isActive ? "text-pen-foreground font-semibold" : "text-pen-foreground")}>
                          {p.name}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-sans text-[11.5px] text-pen-subtle tabular-nums">
                            {p.ticketCount} {p.ticketCount === 1 ? "ticket" : "tickets"}
                          </span>
                          <ProjectStatusBadge status={p.status} />
                        </div>
                      </>
                    ) : (
                      /* Recent / nav / settings / action row */
                      <>
                        {item.colorDot
                          ? <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.colorDot }} />
                          : item.icon}
                        <span className={cn("min-w-0 flex-1 truncate font-sans text-[13px]", isActive ? "text-pen-foreground font-semibold" : "text-pen-foreground")}>
                          {item.label}
                        </span>
                        {/* Recent ticket: show ticket ID + status dot */}
                        {item.recentMeta ? (
                          <div className="flex shrink-0 items-center gap-2">
                            <div className="flex items-center gap-1">
                              <StatusDot status={item.recentMeta} />
                              <span className="font-sans text-[11.5px] text-pen-subtle">{item.recentMeta}</span>
                            </div>
                            <span className="font-mono text-[11px] font-semibold text-pen-id">{item.sub}</span>
                          </div>
                        ) : item.sub ? (
                          <span className="shrink-0 font-sans text-[11.5px] text-pen-subtle">{item.sub}</span>
                        ) : null}
                        {item.isActive && (
                          <Check className="size-3.5 shrink-0 text-pen-blue" />
                        )}
                        {isActive && !item.recentMeta && <EnterBtn />}
                      </>
                    )}
                    {(t || p) && isActive && <EnterBtn />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex h-[38px] items-center gap-3.5 border-t border-pen-card-border bg-pen-bg px-4">
          <div className="flex items-center gap-1.5"><Kbd keys={["↑","↓"]} /><span className="font-sans text-[11.5px] text-pen-subtle">navigate</span></div>
          <div className="flex items-center gap-1.5"><Kbd keys={["↵"]} /><span className="font-sans text-[11.5px] text-pen-subtle">select</span></div>
          <div className="flex items-center gap-1.5"><Kbd keys={["⌘","K"]} /><span className="font-sans text-[11.5px] text-pen-subtle">toggle</span></div>
          <span className="flex-1" />
          <span className="font-sans text-[11.5px] font-medium text-pen-subtle">PEN Platform</span>
        </div>
      </div>
    </div>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
