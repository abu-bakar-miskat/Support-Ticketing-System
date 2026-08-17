export type UserListPerson = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  departmentName?: string | null;
  teamName?: string | null;
};

export function formatUserListSubtitle(
  departmentName?: string | null,
  teamName?: string | null,
): string | null {
  const parts = [departmentName, teamName].filter(
    (v): v is string => !!v && v.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function matchesUserListSearch(
  person: Pick<UserListPerson, "name" | "departmentName" | "teamName">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    person.name.toLowerCase().includes(q) ||
    (person.departmentName ?? "").toLowerCase().includes(q) ||
    (person.teamName ?? "").toLowerCase().includes(q)
  );
}
