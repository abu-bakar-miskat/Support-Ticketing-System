import type { TemplateFeatureKey } from "@/lib/template-features";

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
  /** Tenant-level setting — shown only in tenant view (no active department), hidden inside a department */
  tenantScoped?: true;
  /** Hidden unless the tenant's active templates include this feature key (Template Catalogue) */
  templateFeatureKey?: TemplateFeatureKey;
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
        templateFeatureKey: "members",
      },
      {
        label: "Sub departments & roles",
        href: "/settings/sub-departments",
        managerOnly: true,
        deptSpecific: true,
        templateFeatureKey: "teamsRoles",
      },
      {
        label: "Departments",
        href: "/settings/departments",
        managerOnly: true,
        tenantScoped: true,
        templateFeatureKey: "departmentsSettings",
      },
      {
        label: "Branding",
        href: "/settings/branding",
        adminOnly: true,
        tenantScoped: true,
        templateFeatureKey: "branding",
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
        templateFeatureKey: "projects",
      },
      {
        label: "Tags & labels",
        href: "/settings/tags",
        managerOnly: true,
        deptSpecific: true,
        templateFeatureKey: "tagsLabels",
      },
      {
        label: "Ticket Templates",
        href: "/settings/templates",
        managerOnly: true,
        deptSpecific: true,
        templateFeatureKey: "ticketTemplates",
      },
      {
        label: "Workflows & statuses",
        href: "/settings/workflows",
        managerOnly: true,
        deptSpecific: true,
        templateFeatureKey: "workflows",
      },
      {
        label: "SLA policies",
        href: "/settings/sla",
        managerOnly: true,
        deptSpecific: true,
      },
      {
        label: "Automation rules",
        href: "/settings/rules",
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
        deptSpecific: true,
        templateFeatureKey: "supportForm",
      },
      {
        label: "API keys",
        href: "/settings/api-keys",
        managerOnly: true,
        deptSpecific: true,
        templateFeatureKey: "apiKeys",
      },
      // Import from Notion is hidden from the UI (route/component/API retained).
      // {
      //   label: "Import from Notion",
      //   href: "/settings/import",
      //   managerOnly: true,
      //   templateFeatureKey: "importForm",
      // },
      {
        label: "Email settings",
        href: "/settings/email",
        managerOnly: true,
        deptSpecific: true,
        templateFeatureKey: "emailSettings",
      },
    ],
  },
  {
    label: "PLATFORM",
    items: [
      {
        label: "Templates",
        href: "/settings/templates-catalogue",
        adminOnly: true,
        tenantScoped: true,
      },
    ],
  },
];

export const ALL_SETTINGS_NAV_ITEMS = SETTINGS_NAV.flatMap((g) => g.items);

/**
 * `activeFeatureKeys` is "ALL" when the tenant has adopted zero templates yet
 * (fail-open, see lib/template-catalogue.ts) so existing tenants see every
 * item exactly as before this feature shipped.
 */
export function getFilteredNav(
  role: string,
  counts: Partial<Record<string, number>> = {},
  isCrossAccess = false,
  isSuperAdmin = false,
  // Array form (not Set) so this can flow straight through as a server→client
  // component prop, which must be JSON-serializable.
  activeFeatureKeys: TemplateFeatureKey[] | "ALL" = "ALL",
  // Tenant view (no active department): department-scoped settings are hidden;
  // only tenant-level settings show. Defaults to true so callers that don't
  // pass it keep the pre-existing behavior.
  hasActiveDept = true,
): SettingsNavGroup[] {
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isLead = role === "sub_manager";

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
        // Tenant view (no active department): hide department-scoped settings.
        if (!hasActiveDept && item.deptSpecific) return false;
        // Department view (active department): hide tenant-level settings.
        if (hasActiveDept && item.tenantScoped) return false;
        return true;
      })
      .filter((item) => {
        if (!item.templateFeatureKey) return true;
        return activeFeatureKeys === "ALL" || activeFeatureKeys.includes(item.templateFeatureKey);
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
