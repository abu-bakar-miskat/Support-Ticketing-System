"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { ProjectDot } from "@/components/projects/project-avatar";
import { DepartmentIcon } from "@/components/icons/department-icon";
import { getDepartmentIcon } from "@/lib/department-icons";
import { SidebarNavIcon } from "@/components/dashboard/sidebar-nav-icon";
import { UserProfileMenu } from "@/components/dashboard/user-profile-menu";

import {
  House,
  ListTodo,
  Timer,
  SquareKanban,
  CalendarDays,
  CalendarRange,
  FolderKanban,
  ChartColumn,
  ChartPie,
  Settings2,
  CircleUser,
  Search,
  X,
  Bell,
  Plus,
  Check,
  ChevronDown,
  ArrowLeft,
  Pin,
  PinOff,
  PanelLeftClose,
  ChevronRight,
  LifeBuoy,
  Users,
  Boxes,
  Activity,
  KeyRound,
  BriefcaseBusiness,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore, useNotificationStore } from "@/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useMemo, useState } from "react";
import { usePinnedProjects } from "@/hooks/use-pinned-projects";
import { usePermissions } from "@/hooks/use-permissions";
import { ProjectModal } from "@/components/projects/project-modal";
import { InstallAppButton } from "@/components/pwa/install-app-button";

import type { LucideIcon } from "lucide-react";

export type SidebarProject = {
  id: string;
  label: string;
  href: string;
  color: string;
  avatarUrl?: string | null;
  count: number;
  subDepartmentId: string | null;
  projectStatus?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
};

export type SubDepartmentItem = {
  id: string;
  name: string;
  prefix: string;
  departmentId?: string | null;
  departmentName?: string | null;
};

export type DeptNode = {
  id: string;
  name: string;
  projects: SidebarProject[];
};

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  requiresModulesAccess?: boolean;
  /** Hidden in support departments (dev-planning views). */
  hideForSupport?: boolean;
  /** Only shown in support departments. */
  supportOnly?: boolean;
};

const navViews: NavItem[] = [
  { label: "Board", href: "/board", icon: SquareKanban },
  { label: "Timeline", href: "/timeline", icon: CalendarDays, hideForSupport: true },
  { label: "Modules", href: "/modules", icon: Boxes, requiresModulesAccess: true, hideForSupport: true },
  { label: "Support forms", href: "/settings/intake-forms", icon: LifeBuoy, supportOnly: true },
  { label: "Reports", href: "/reports", icon: ChartColumn },
  { label: "Calendar", href: "/calendar", icon: CalendarRange },
  { label: "My Profile", href: "/profile", icon: CircleUser },
  { label: "Settings", href: "/settings", icon: Settings2 },
  { label: "Help Center", href: "/docs", icon: LifeBuoy },
];

type SidebarProps = {
  onClose?: () => void;
  onOpenSearch?: () => void;
  onCreateTask?: () => void;
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Mobile/tablet drawer — always expanded */
  isDrawer?: boolean;
  /** Active tenant branding — overrides the default PEN logo/name when set. */
  brandingName?: string | null;
  brandingLogoUrl?: string | null;
};

function SidebarNavLink({
  item,
  active,
  collapsed,
  onQuickAdd,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onQuickAdd?: () => void;
}) {
  const Icon = item.icon;
  const showAdd = !!onQuickAdd && !collapsed;

  if (showAdd) {
    return (
      <div className="group flex h-7 items-center gap-0.5">
        <Link
          href={item.href}
          // Full prefetch: dashboard routes are dynamic, so the default only
          // prefetches an empty shell — this caches the whole RSC payload for
          // instant transitions (fresh for staleTimes.dynamic seconds).
          prefetch={true}
          className={cn(
            "pen-nav-link relative flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 font-sans text-[13px] text-pen-foreground hover:bg-pen-blue-tint",
            active && "bg-pen-blue-tint font-semibold text-pen-id",
          )}
          style={{ height: "28px" }}
        >
          <SidebarNavIcon icon={Icon} />
          <span className="truncate">{item.label}</span>
          {item.badge != null && (
            <>
              <span className="flex-1" />
              <span className="text-[11.5px] text-pen-subtle">
                {item.badge}
              </span>
            </>
          )}
        </Link>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onQuickAdd();
          }}
          aria-label={`New ${item.label}`}
          title={`New ${item.label.toLowerCase()}`}
          className="flex size-5 shrink-0 items-center justify-center rounded text-pen-subtle hover:bg-pen-blue-tint hover:text-pen-id"
        >
          <Plus className="size-3" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      prefetch={true}
      title={collapsed ? item.label : undefined}
      className={cn(
        "pen-nav-link relative flex h-7 items-center rounded-md font-sans text-[13px] text-pen-foreground hover:bg-pen-blue-tint",
        collapsed ? "justify-center px-0" : "gap-2 px-2.5",
        active && "bg-pen-blue-tint font-semibold text-pen-id",
      )}
    >
      <span className="relative shrink-0">
        <SidebarNavIcon icon={Icon} />
        {collapsed && item.badge != null && item.badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-pen-blue px-0.5 font-sans text-[11.5px] font-semibold text-white dark:text-gray-900">
            {item.badge > 9 ? "9+" : item.badge}
          </span>
        )}
      </span>
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {item.badge != null && (
            <>
              <span className="flex-1" />
              <span className="text-[11.5px] text-pen-subtle">
                {item.badge}
              </span>
            </>
          )}
        </>
      )}
    </Link>
  );
}

const PROJECTS_SECTION_KEY = "pen_sidebar_projects_expanded";

function DeptContextLabel({
  name,
  isCrossAccess,
}: {
  name: string;
  isCrossAccess: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <span className="block truncate font-sans text-[12px] font-semibold leading-snug text-pen-foreground">
        {name}
      </span>
      {isCrossAccess && (
        <span className="mt-0.5 flex items-center gap-1 font-sans text-[10px] leading-none text-pen-subtle">
          <KeyRound className="size-2.5 shrink-0 opacity-70" aria-hidden />
          Guest access
        </span>
      )}
    </div>
  );
}

function DeptContextIcon({
  name,
  id,
}: {
  name: string;
  id: string;
}) {
  const Icon = getDepartmentIcon(name, id);
  return (
    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-pen-blue/10">
      <SidebarNavIcon icon={Icon} size="sm" className="text-pen-blue" />
    </span>
  );
}

function CrossAccessMenuHint({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 font-sans text-[10px] leading-none text-pen-subtle",
        className,
      )}
    >
      Guest
    </span>
  );
}

export function Sidebar({
  onClose,
  onOpenSearch,
  onCreateTask,
  className,
  collapsed = false,
  onToggleCollapse,
  isDrawer = false,
  brandingName = null,
  brandingLogoUrl = null,
}: SidebarProps) {
  const {
    projects,
    myTasksCount,
    subDepartments,
    activeSubDepartmentId,
    departments,
    allDepts,
    activeDeptId,
    activeDeptType,
    isCrossAccessDept,
    crossAccessDeptIds,
    isFullAccessDept,
    isManagerOfActiveDept,
    canAccessModules,
    userRole,
    isSuperAdmin,
    pinnedProjectIds: initialPins,
  } = useDashboardContext();
  const pathname = usePathname();
  const router = useRouter();
  const [switchingSubDepartment, setSwitchingSubDepartment] = useState<string | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [switchingDept, setSwitchingDept] = useState(false);
  const { pins, togglePin } = usePinnedProjects(initialPins);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [projectsSectionReady, setProjectsSectionReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(PROJECTS_SECTION_KEY);
    if (stored !== null) setProjectsExpanded(stored === "true");
    setProjectsSectionReady(true);
  }, []);

  useEffect(() => {
    if (!projectsSectionReady) return;
    localStorage.setItem(PROJECTS_SECTION_KEY, String(projectsExpanded));
  }, [projectsExpanded, projectsSectionReady]);

  const crossAccessDeptSet = useMemo(
    () => new Set(crossAccessDeptIds),
    [crossAccessDeptIds],
  );

  const sidebarProjectPool = useMemo(() => {
    const map = new Map<string, (typeof projects)[number]>();
    for (const p of projects) {
      if (activeDeptId && p.departmentId !== activeDeptId) continue;
      map.set(p.id, p);
    }
    for (const dept of departments) {
      for (const p of dept.projects) {
        map.set(p.id, p);
      }
    }
    return [...map.values()];
  }, [projects, departments, activeDeptId]);

  const user = useAuthStore((s) => s.user);
  const notifCount = useNotificationStore((s) =>
    s.initialized ? s.unreadCount : null,
  );
  const { canManageProjects: isPrivileged } = usePermissions();

  async function switchDept(deptId: string | null) {
    if (deptId === activeDeptId) return;
    setSwitchingDept(true);
    await fetch("/api/active-dept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deptId }),
    });
    // Full reload so the server re-renders every page with the new cookie
    window.location.href = deptId ? "/" : "/departments";
  }

  async function switchSubDepartment(subDepartmentId: string) {
    if (subDepartmentId === activeSubDepartmentId) return;
    setSwitchingSubDepartment(subDepartmentId);
    try {
      await fetch("/api/active-sub-department", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subDepartmentId }),
      });
      router.refresh();
    } finally {
      setSwitchingSubDepartment(null);
    }
  }

  const deptContextClassName = cn(
    "flex w-full items-center rounded-lg border border-pen-card-border bg-pen-surface text-left outline-none transition-colors",
    "hover:border-pen-blue/40 hover:bg-pen-blue-tint data-popup-open:border-pen-blue/40 data-popup-open:bg-pen-blue-tint",
  );

  const activeSubDepartment = subDepartments.find((t) => t.id === activeSubDepartmentId) ?? subDepartments[0];
  const isAdmin = userRole === "admin";
  const isManager = userRole === "manager";
  const activeDept = allDepts.find((d) => d.id === activeDeptId);
  // For staff/lead — department name comes from their team membership
  const staffDeptName =
    !isAdmin && !isManager
      ? (activeSubDepartment?.departmentName ?? subDepartments[0]?.departmentName ?? null)
      : null;
  const staffDeptId =
    !isAdmin && !isManager
      ? (activeSubDepartment?.departmentId ?? subDepartments[0]?.departmentId ?? null)
      : null;
  // Admin with no dept selected = on the dept overview page, not in a workspace
  const isAdminGlobalView = isAdmin && !activeDeptId;
  const isCollapsed = collapsed && !isDrawer;

  const hasMultiDeptAccess = !isAdmin && allDepts.length > 1;

  const navMainBase: NavItem[] = isAdminGlobalView
    ? [
        { label: "Departments", href: "/departments", icon: DepartmentIcon },
        {
          label: "Notifications",
          href: "/inbox",
          icon: Bell,
          badge: notifCount ?? undefined,
        },
        { label: "Settings", href: "/settings", icon: Settings2 },
      ]
    : isCrossAccessDept
      ? [
          ...(hasMultiDeptAccess
            ? [{ label: "My Departments", href: "/departments", icon: DepartmentIcon }]
            : []),
          { label: "Tasks", href: "/tasks", icon: ListTodo },
          { label: "Projects", href: "/projects", icon: FolderKanban },
          {
            label: "Notifications",
            href: "/inbox",
            icon: Bell,
            badge: notifCount ?? undefined,
          },
          { label: "Activity", href: "/activity", icon: Activity },
        ]
      : [
          ...(hasMultiDeptAccess
            ? [{ label: "My Departments", href: "/departments", icon: DepartmentIcon }]
            : []),
          {
            label: "Home",
            href: isManagerOfActiveDept ? "/manager" : "/",
            icon: House,
          },
          {
            label: "Tasks",
            href: "/tasks",
            icon: ListTodo,
            badge: isManagerOfActiveDept
              ? undefined
              : myTasksCount || undefined,
          },
          { label: "Projects", href: "/projects", icon: FolderKanban },
          {
            label: "Notifications",
            href: "/inbox",
            icon: Bell,
            badge: notifCount ?? undefined,
          },
          { label: "My Time", href: "/time", icon: Timer },
          { label: "Activity", href: "/activity", icon: Activity },
          ...(isAdmin || isManager
            ? [
                { label: "Members", href: "/department", icon: Users },
                { label: "Team Reports", href: "/manager/people", icon: ChartPie },
                { label: "Recruitment", href: "/recruitment", icon: BriefcaseBusiness },
              ]
            : []),
        ];

  // Super admins get a platform-level entry to the tenant management page,
  // pinned above the context-specific nav in every view.
  const navMain: NavItem[] = isSuperAdmin
    ? [{ label: "All Tenants", href: "/tenants", icon: Building2 }, ...navMainBase]
    : navMainBase;

  return (
    <>
      <aside
        className={cn(
          "pen-glass-panel flex h-full shrink-0 flex-col gap-0.5 overflow-x-hidden overflow-y-auto border-r py-3.5 transition-[width,padding] duration-200 ease-in-out",
          isCollapsed ? "w-[68px] px-2" : "w-[220px] px-3",
          className,
        )}
      >
        {/* Logo row */}
        <div
          className={cn(
            "flex h-12 items-center",
            isCollapsed ? "justify-center" : "pl-1",
          )}
        >
          {isCollapsed ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex size-8 items-center justify-center rounded-lg hover:bg-pen-blue-tint"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/pen-dot.svg"
                alt="PEN"
                width={20}
                height={20}
                className="size-5"
              />
            </button>
          ) : brandingLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brandingLogoUrl}
              alt={brandingName ?? "Logo"}
              height={36}
              className="h-9 w-auto max-w-[140px] object-contain"
            />
          ) : brandingName ? (
            <span className="truncate text-[15px] font-semibold text-pen-foreground">
              {brandingName}
            </span>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/pen-logo-light.svg"
                alt="PEN Group"
                width={116}
                height={36}
                className="dark:hidden"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/pen-logo-dark.svg"
                alt="PEN Group"
                width={116}
                height={36}
                className="hidden dark:block"
              />
            </>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded p-1 text-pen-subtle hover:text-pen-foreground lg:hidden"
              aria-label="Close sidebar"
            >
              <X className="size-4" />
            </button>
          )}
          {!isCollapsed && onToggleCollapse && !onClose && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="ml-auto rounded p-1 text-pen-subtle hover:bg-pen-blue-tint hover:text-pen-foreground"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>

        <div className="h-2" />

        {/* Department context */}
        {(isAdmin || isManager || allDepts.length > 0) && activeDept && (
          <div className="flex flex-col gap-0.5">
            {isAdmin && isCollapsed && (
              <button
                type="button"
                disabled={switchingDept}
                title="All Departments"
                onClick={async () => {
                  await fetch("/api/active-dept", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ deptId: null }),
                  });
                  window.location.href = "/departments";
                }}
                className="flex h-7 w-full items-center justify-center rounded-md text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-50"
              >
                <ArrowLeft className="size-3.5" />
              </button>
            )}
            {isAdmin && !isCollapsed && (
              <button
                type="button"
                disabled={switchingDept}
                onClick={async () => {
                  await fetch("/api/active-dept", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ deptId: null }),
                  });
                  window.location.href = "/departments";
                }}
                className="flex h-6 items-center gap-1.5 rounded-md px-1.5 font-sans text-[11.5px] text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-50"
              >
                <ArrowLeft className="size-3 shrink-0" />
                All Departments
              </button>
            )}

            {!isAdmin && allDepts.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  type="button"
                  disabled={switchingDept}
                  title={
                    isCollapsed
                      ? `${isCrossAccessDept ? "Guest access · " : ""}${activeDept.name}`
                      : undefined
                  }
                  className={cn(
                    deptContextClassName,
                    switchingDept && "opacity-60",
                    isCollapsed ? "justify-center p-2" : "items-center gap-2 px-2.5 py-2",
                  )}
                >
                  <DeptContextIcon name={activeDept.name} id={activeDept.id} />
                  {!isCollapsed && (
                    <>
                      <DeptContextLabel
                        name={activeDept.name}
                        isCrossAccess={isCrossAccessDept}
                      />
                      <ChevronDown className="size-3 shrink-0 self-center text-pen-subtle" />
                    </>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="min-w-[200px] font-sans [&_[data-slot=dropdown-menu-item]]:text-[12px] [&_[data-slot=dropdown-menu-item]]:text-pen-foreground [&_[data-slot=dropdown-menu-item]]:focus:bg-pen-blue-tint"
                  side="right"
                  align="start"
                  sideOffset={8}
                >
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle uppercase px-2 py-1.5">
                      My Departments
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  {allDepts.map((dept) => {
                    const isGuestDept = crossAccessDeptSet.has(dept.id);
                    const DeptItemIcon = getDepartmentIcon(dept.name, dept.id);
                    return (
                      <DropdownMenuItem
                        key={dept.id}
                        onClick={() => switchDept(dept.id)}
                      >
                        <span className="flex size-5 items-center justify-center rounded-md bg-pen-blue/10">
                          <SidebarNavIcon
                            icon={DeptItemIcon}
                            size="sm"
                            className="text-pen-blue"
                          />
                        </span>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="min-w-0 truncate">{dept.name}</span>
                          {isGuestDept && <CrossAccessMenuHint />}
                        </span>
                        {activeDeptId === dept.id && (
                          <Check className="ml-auto size-3 shrink-0 text-pen-blue" />
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div
                className={cn(
                  deptContextClassName,
                  isCollapsed ? "justify-center p-2" : "items-center gap-2 px-2.5 py-2",
                )}
                title={
                  isCollapsed
                    ? `${isCrossAccessDept ? "Guest access · " : ""}${activeDept.name}`
                    : undefined
                }
              >
                <DeptContextIcon name={activeDept.name} id={activeDept.id} />
                {!isCollapsed && (
                  <DeptContextLabel
                    name={activeDept.name}
                    isCrossAccess={isCrossAccessDept}
                  />
                )}
              </div>
            )}
          </div>
        )}
        {isAdmin && isAdminGlobalView && (
          <div
            className={cn(
              "flex items-center rounded-lg border border-pen-blue/30 bg-pen-blue-tint",
              isCollapsed ? "justify-center p-2" : "gap-2 px-2.5 py-2",
            )}
            title={isCollapsed ? "All Departments" : undefined}
          >
            <SidebarNavIcon
              icon={DepartmentIcon}
              size="sm"
              className="shrink-0 text-pen-blue"
            />
            {!isCollapsed && (
              <span className="font-sans text-[12px] font-semibold text-pen-id">
                All Departments
              </span>
            )}
          </div>
        )}

        {/* Staff / lead — static department badge (only when main block didn't render) */}
        {staffDeptName && !activeDept && (
          <div
            className={cn(
              deptContextClassName,
              isCollapsed ? "justify-center p-2" : "items-center gap-2 px-2.5 py-2",
            )}
            title={
              isCollapsed
                ? `${isCrossAccessDept ? "Guest access · " : ""}${staffDeptName}`
                : undefined
            }
          >
            <DeptContextIcon
              name={staffDeptName}
              id={staffDeptId ?? staffDeptName}
            />
            {!isCollapsed && (
              <DeptContextLabel
                name={staffDeptName}
                isCrossAccess={isCrossAccessDept}
              />
            )}
          </div>
        )}

        <div className="h-2" />

        {/* Personal nav items — not department-scoped */}
        {navMain.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const onQuickAdd =
            item.label === "Tasks"
              ? onCreateTask
              : item.label === "Projects" && isPrivileged
                ? () => setShowCreateProject(true)
                : undefined;
          return (
            <SidebarNavLink
              key={item.href}
              item={item}
              active={active}
              collapsed={isCollapsed}
              onQuickAdd={onQuickAdd}
            />
          );
        })}

        {/* Pinned projects */}
        {!isAdminGlobalView &&
          !isCollapsed &&
          (() => {
            const sorted = sidebarProjectPool
              .filter((p) => pins.has(p.id))
              .sort((a, b) => a.label.localeCompare(b.label));
            if (sorted.length === 0) return null;

            return (
              <>
                <div className="h-3.5" />
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setProjectsExpanded((v) => !v)}
                    aria-expanded={projectsExpanded}
                    aria-label={
                      projectsExpanded
                        ? "Collapse pinned projects"
                        : "Expand pinned projects"
                    }
                    className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-0.5 py-0.5 text-left transition-colors hover:bg-pen-surface"
                  >
                    <ChevronRight
                      className={cn(
                        "size-3 shrink-0 text-pen-subtle transition-transform",
                        projectsExpanded && "rotate-90",
                      )}
                    />
                    <p className="min-w-0 flex-1 font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
                      PINNED PROJECTS
                    </p>
                    <span className="font-sans text-[11.5px] text-pen-subtle">
                      {sorted.length}
                    </span>
                  </button>
                  {isPrivileged && (
                    <button
                      type="button"
                      onClick={() => setShowCreateProject(true)}
                      aria-label="New project"
                      className="flex size-4 shrink-0 items-center justify-center rounded text-pen-subtle hover:bg-pen-blue-tint hover:text-pen-id"
                    >
                      <Plus className="size-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
                {projectsExpanded && (
                  <>
                    <div className="h-1" />
                    {sorted.map((p) => {
                      const isPinned = pins.has(p.id);
                      return (
                        <Link
                          key={p.id}
                          href={p.href}
                          className={cn(
                            "group pen-nav-link flex h-7 items-center gap-2 rounded-md px-2.5 font-sans text-[13px] text-pen-foreground hover:bg-pen-blue-tint",
                            pathname === p.href &&
                              "bg-pen-blue-tint font-semibold text-pen-id",
                          )}
                        >
                          <ProjectDot
                            color={p.color}
                            avatarUrl={p.avatarUrl}
                            name={p.label}
                            size={16}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {p.label}
                          </span>
                          {/* Pin button — always visible */}
                          <button
                            type="button"
                            onClick={(e) => togglePin(e, p.id)}
                            aria-label={
                              isPinned
                                ? `Unpin ${p.label}`
                                : `Pin ${p.label} to top`
                            }
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded transition-colors",
                              isPinned
                                ? "text-pen-blue hover:text-red-400"
                                : "text-pen-subtle hover:text-pen-id",
                            )}
                          >
                            {isPinned ? (
                              <PinOff className="size-3" aria-hidden="true" />
                            ) : (
                              <Pin className="size-3" aria-hidden="true" />
                            )}
                          </button>
                          {!isPinned && (
                            <span className="text-[11.5px] text-pen-subtle">
                              {p.count}
                            </span>
                          )}
                          {isPinned && (
                            <span className="text-[11.5px] text-pen-blue">
                              {p.count}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </>
                )}
              </>
            );
          })()}

        {!isAdminGlobalView && (
          <>
            <div className="h-3.5" />
            {!isCollapsed && (
              <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
                VIEWS
              </p>
            )}
            <div className="h-1" />
          </>
        )}

        {!isAdminGlobalView &&
          navViews
            .filter((item) => {
              if (item.requiresModulesAccess && !canAccessModules) return false;
              // Per-department-type interface: support departments hide dev-planning
              // views (Timeline, Modules) and surface Support forms; other types
              // hide the support-only item.
              const isSupportDept = activeDeptType === "support";
              if (item.hideForSupport && isSupportDept) return false;
              if (item.supportOnly && !isSupportDept) return false;
              if (isCrossAccessDept) {
                // Full-access guests can also see Reports (read-only, dept-wide).
                const allowed = isFullAccessDept
                  ? ["/board", "/modules", "/reports"]
                  : ["/board", "/modules"];
                return allowed.includes(item.href);
              }
              return true;
            })
            .map((item) => {
              const active =
                item.href === "/settings"
                  ? pathname.startsWith("/settings")
                  : pathname === item.href;
              return (
                <SidebarNavLink
                  key={item.href}
                  item={item}
                  active={active}
                  collapsed={isCollapsed}
                />
              );
            })}

        {/* Spacer */}
        <div className="flex-1" />

        <InstallAppButton collapsed={isCollapsed} />

        {/* User */}
        <UserProfileMenu variant="sidebar" collapsed={isCollapsed} />
      </aside>

      {/* Create Project Modal */}
      {showCreateProject &&
        (() => {
          const userSubDepartment = subDepartments.find((t) => t.id === user?.subDepartmentId);
          // Lock to active dept for everyone when in a dept context; non-admins always locked to their dept
          const lockedDeptId =
            activeDeptId ??
            (!isAdmin
              ? (userSubDepartment?.departmentId ?? departments[0]?.id ?? "")
              : null);
          const lockedDept = lockedDeptId
            ? {
                id: lockedDeptId,
                name:
                  departments.find((d) => d.id === lockedDeptId)?.name ??
                  activeDept?.name ??
                  userSubDepartment?.departmentName ??
                  "",
              }
            : null;
          return (
            <ProjectModal
              mode={{ type: "create" }}
              departments={departments}
              lockedDepartment={lockedDept}
              onClose={() => setShowCreateProject(false)}
              onSuccess={() => {
                setShowCreateProject(false);
                router.refresh();
              }}
            />
          );
        })()}
    </>
  );
}
