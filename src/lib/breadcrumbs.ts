import { getSettingsPageLabel } from "@/components/settings/settings-nav";

export type BreadcrumbCrumb = { label: string; href: string };

type BuildCrumbsOptions = {
  pathname: string;
  projectNames?: Record<string, string>;
  projectTab?: string | null;
  projectTabName?: string | null;
  ticketHumanId?: string | null;
  recentTicketHumanIds?: Record<string, string>;
};

const ROUTE_META: Record<string, { label: string; parent?: string }> = {
  "/": { label: "Home" },
  "/manager": { label: "Manager dashboard", parent: "/" },
  "/tasks": { label: "My Tasks", parent: "/" },
  "/time": { label: "My Time", parent: "/" },
  "/inbox": { label: "Inbox", parent: "/" },
  "/all-tasks": { label: "All Tasks", parent: "/" },
  "/mentions": { label: "@Mentions", parent: "/" },
  "/board": { label: "Board", parent: "/" },
  "/timeline": { label: "Timeline", parent: "/" },
  "/modules": { label: "Modules", parent: "/" },
  "/activity": { label: "Activity", parent: "/" },
  "/profile": { label: "My Profile", parent: "/" },
  "/projects": { label: "Projects", parent: "/" },
  "/departments": { label: "Departments", parent: "/" },
  "/department": { label: "Department", parent: "/" },
  "/docs": { label: "User manual", parent: "/" },
  "/reports": { label: "Team time", parent: "/" },
  "/sub-departments": { label: "Sub Departments", parent: "/manager" },
};

function resolveParentHref(parentKey: string): string {
  if (parentKey.startsWith("~")) return "/";
  return parentKey;
}

function staticRouteCrumbs(pathname: string): BreadcrumbCrumb[] | null {
  const meta = ROUTE_META[pathname];
  if (!meta) return null;
  if (!meta.parent) return [{ label: meta.label, href: pathname }];
  const parentMeta = ROUTE_META[meta.parent];
  return [
    { label: parentMeta?.label ?? "Home", href: resolveParentHref(meta.parent) },
    { label: meta.label, href: pathname },
  ];
}

function settingsCrumbs(pathname: string): BreadcrumbCrumb[] {
  const settingsRoot: BreadcrumbCrumb = { label: "Settings", href: "/settings" };
  const supportForms: BreadcrumbCrumb = {
    label: "Support forms",
    href: "/settings/intake-forms",
  };

  const submissionDetail = pathname.match(
    /^\/settings\/intake-forms\/([^/]+)\/submissions\/([^/]+)$/,
  );
  if (submissionDetail) {
    const [, formId, intakeId] = submissionDetail;
    return [
      settingsRoot,
      supportForms,
      { label: "Form", href: `/settings/intake-forms/${formId}` },
      { label: "Submissions", href: `/settings/intake-forms/${formId}/submissions` },
      { label: "Submission", href: pathname },
    ];
  }

  const submissions = pathname.match(/^\/settings\/intake-forms\/([^/]+)\/submissions$/);
  if (submissions) {
    const [, formId] = submissions;
    return [
      settingsRoot,
      supportForms,
      { label: "Form", href: `/settings/intake-forms/${formId}` },
      { label: "Submissions", href: pathname },
    ];
  }

  const formBuilder = pathname.match(/^\/settings\/intake-forms\/([^/]+)$/);
  if (formBuilder) {
    const [, formId] = formBuilder;
    return [
      settingsRoot,
      supportForms,
      { label: "Form fields", href: `/settings/intake-forms/${formId}` },
    ];
  }

  if (pathname.startsWith("/settings")) {
    const pageLabel = getSettingsPageLabel(pathname);
    const label =
      pageLabel !== "Settings" || pathname === "/settings"
        ? pageLabel
        : pathname
            .split("/")
            .pop()!
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
    if (pathname === "/settings") {
      return [{ label: "Settings", href: "/settings" }];
    }
    return [settingsRoot, { label, href: pathname }];
  }

  return [settingsRoot];
}

function projectCrumbs(
  pathname: string,
  projectNames: Record<string, string>,
  tab?: string | null,
  tabName?: string | null,
): BreadcrumbCrumb[] {
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  if (!projectMatch) return [];

  const id = projectMatch[1];
  const name = projectNames[id] ?? id;
  const base: BreadcrumbCrumb[] = [
    { label: "Projects", href: "/projects" },
    { label: name, href: `/projects/${id}` },
  ];

  if (tab === "tickets") {
    base.push({ label: "All tasks", href: `/projects/${id}?tab=tickets` });
  } else if (tab === "overview") {
    base.push({ label: "Overview", href: `/projects/${id}?tab=overview` });
  } else if (tab?.startsWith("team:") && tabName) {
    base.push({
      label: tabName,
      href: `/projects/${id}?tab=${encodeURIComponent(tab)}&tabName=${encodeURIComponent(tabName)}`,
    });
  }

  return base;
}

function ticketCrumbs(
  pathname: string,
  ticketHumanId?: string | null,
  recentTicketHumanIds?: Record<string, string>,
): BreadcrumbCrumb[] | null {
  const ticketMatch =
    pathname.match(/^\/tasks\/([^/]+)$/) ??
    pathname.match(/^\/tickets\/([^/]+)$/);
  if (!ticketMatch) return null;

  const dbId = ticketMatch[1];
  const label =
    ticketHumanId?.trim() ||
    recentTicketHumanIds?.[dbId]?.trim() ||
    dbId;

  return [
    { label: "My Tasks", href: "/tasks" },
    { label: label, href: pathname },
  ];
}

/** Build the breadcrumb trail for the current pathname. */
export function buildBreadcrumbs(opts: BuildCrumbsOptions): BreadcrumbCrumb[] {
  const {
    pathname,
    projectNames = {},
    projectTab,
    projectTabName,
    ticketHumanId,
    recentTicketHumanIds = {},
  } = opts;

  const ticket = ticketCrumbs(pathname, ticketHumanId, recentTicketHumanIds);
  if (ticket) return ticket;

  const project = projectCrumbs(pathname, projectNames, projectTab, projectTabName);
  if (project.length > 0) return project;

  if (pathname.startsWith("/settings")) {
    return settingsCrumbs(pathname);
  }

  const staticRoute = staticRouteCrumbs(pathname);
  if (staticRoute) return staticRoute;

  return [{ label: "Home", href: "/" }];
}

/** Parent crumb for the back button — null when already at root. */
export function parentCrumb(crumbs: BreadcrumbCrumb[]): BreadcrumbCrumb | null {
  if (crumbs.length < 2) return null;
  return crumbs[crumbs.length - 2];
}
