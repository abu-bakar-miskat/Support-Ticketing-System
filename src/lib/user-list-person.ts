export type UserListPerson = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  departmentName?: string | null;
  subDepartmentName?: string | null;
};

export function formatUserListSubtitle(
  departmentName?: string | null,
  subDepartmentName?: string | null,
): string | null {
  const parts = [departmentName, subDepartmentName].filter(
    (v): v is string => !!v && v.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function matchesUserListSearch(
  person: Pick<UserListPerson, "name" | "departmentName" | "subDepartmentName">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    person.name.toLowerCase().includes(q) ||
    (person.departmentName ?? "").toLowerCase().includes(q) ||
    (person.subDepartmentName ?? "").toLowerCase().includes(q)
  );
}
