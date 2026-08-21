export type SubDepartmentNavItem = {
  label: string;
  href: string;
};

export type SubDepartmentNavGroup = {
  label: string;
  items: SubDepartmentNavItem[];
};

/**
 * Build the sub-department sidebar nav for a given sub-department name.
 * Hrefs are keyed off the (URL-encoded) name so every nested page lives under
 * `/sub-departments/[name]`. Add new sections here to extend the sidebar.
 */
export function getSubDepartmentNav(name: string): SubDepartmentNavGroup[] {
  const base = `/sub-departments/${encodeURIComponent(name)}`;
  return [
    {
      label: "GENERAL",
      items: [
        { label: "About", href: base },
        { label: "Mailbox", href: `${base}/mailbox` },
        { label: "Support forms", href: `${base}/support-forms` },
      ],
    },
  ];
}

export const ALL_SUB_DEPARTMENT_NAV_ITEMS = (name: string) =>
  getSubDepartmentNav(name).flatMap((g) => g.items);
