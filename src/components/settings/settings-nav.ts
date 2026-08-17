export type SettingsNavItem = {
  label: string;
  href: string;
  /** Only platform super-admins see this item */
  superAdminOnly?: true;
/** Only admins see this item */
  adminOnly?: true;
  /** Admins and managers see this item; staff do not */
  managerOnly?: true;
  /** Hidden for cross-department-access outsiders — department-specific management only */
  deptSpecific?: true;
  count?: number;
};

export type SettingsNavGroup = {
  label: string;
  items: SettingsNavItem[];
};

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: "PERSONAL",
    items: [
      { label: "Profile", href: "/settings" },
      { label: "Appearance", href: "/settings/appearance" },
      { label: "Notifications", href: "/settings/notifications" },
      { label: "Keyboard shortcuts", href: "/settings/shortcuts" },
    ],
  },
  {
    label: "WORKSPACE",
    items: [
      {
        label: "Members",
        href: "/settings/members",
        managerOnly: true,
        deptSpecific: true,
      },
      {
        label: "Teams & roles",
        href: "/settings/teams",
        managerOnly: true,
        deptSpecific: true,
      },
      {
        label: "Departments",
        href: "/settings/departments",
        managerOnly: true,
        deptSpecific: true,
      },
      {
        label: "Branding",
        href: "/settings/branding",
        adminOnly: true,
      },
    ],
  },
  {
    label: "CONFIGURATION",
    items: [
      {
        label: "Projects",
        href: "/settings/projects",
        managerOnly: true,
        deptSpecific: true,
      },
      {
        label: "Tags & labels",
        href: "/settings/tags",
        managerOnly: true,
        deptSpecific: true,
      },
      {
        label: "Ticket Templates",
        href: "/settings/templates",
        managerOnly: true,
        deptSpecific: true,
      },
      {
        label: "Workflows & statuses",
        href: "/settings/workflows",
        managerOnly: true,
        deptSpecific: true,
      },
    ],
  },
  {
    label: "INTEGRATIONS",
    items: [
      {
        label: "Support forms",
        href: "/settings/intake-forms",
        managerOnly: true,
      },
      {
        label: "API keys",
        href: "/settings/api-keys",
        managerOnly: true,
        deptSpecific: true,
      },
      {
        label: "Import from Notion",
        href: "/settings/import",
        managerOnly: true,
      },
      {
        label: "Email settings",
        href: "/settings/email",
        managerOnly: true,
      },
    ],
  },
  {
    label: "PLATFORM",
    items: [
      {
        label: "Tenants",
        href: "/tenants",
        superAdminOnly: true,
      },
    ],
  },
];

export const ALL_SETTINGS_NAV_ITEMS = SETTINGS_NAV.flatMap((g) => g.items);

export function getFilteredNav(
  role: string,
  counts: Partial<Record<string, number>> = {},
  isCrossAccess = false,
  isSuperAdmin = false,
): SettingsNavGroup[] {
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isLead = role === "lead";

  return SETTINGS_NAV.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => {
        if (item.superAdminOnly) return isSuperAdmin;
        if (item.adminOnly) return isAdmin;
        if (item.managerOnly) return isAdmin || isManager || isLead;
        return true;
      })
      .filter((item) => {
        // Cross-access outsiders only see personal settings, not department-specific ones
        if (isCrossAccess && item.deptSpecific) return false;
        return true;
      })
      .map((item) => ({
        ...item,
        count: counts[item.href] ?? item.count,
      })),
  })).filter((group) => group.items.length > 0);
}

export function getSettingsPageLabel(pathname: string): string {
  const item = ALL_SETTINGS_NAV_ITEMS.find((nav) => nav.href === pathname);
  return item?.label ?? "Settings";
}
