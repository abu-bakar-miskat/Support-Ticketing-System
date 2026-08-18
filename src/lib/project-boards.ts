type MemberWithSubDepartment = {
  user: {
    name: string;
    subDepartmentId: string | null;
    memberships: { subDepartment: { id: string } }[];
  };
};

export function memberSubDepartmentIdsFromProject(members: MemberWithSubDepartment[]): string[] {
  const ids = new Set<string>();
  for (const pm of members) {
    const subDepartmentId = pm.user.memberships[0]?.subDepartment?.id ?? pm.user.subDepartmentId;
    if (subDepartmentId) ids.add(subDepartmentId);
  }
  return [...ids];
}

export function memberNamesBySubDepartmentId(members: MemberWithSubDepartment[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const pm of members) {
    const subDepartmentId = pm.user.memberships[0]?.subDepartment?.id ?? pm.user.subDepartmentId;
    if (!subDepartmentId) continue;
    const list = map.get(subDepartmentId) ?? [];
    list.push(pm.user.name);
    map.set(subDepartmentId, list);
  }
  return map;
}

export function resolveBoardSubDepartmentSource(
  subDepartmentId: string,
  departmentSubDepartmentIds: string[],
  memberNamesBySubDepartment: Map<string, string[]>,
): "department" | "member" | "tickets" {
  if (departmentSubDepartmentIds.includes(subDepartmentId)) return "department";
  if (memberNamesBySubDepartment.has(subDepartmentId)) return "member";
  return "tickets";
}

export function parseEnabledBoardSubDepartmentIds(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Default boards come from the project's department teams, not member assignments. */
export function resolveEnabledBoardSubDepartmentIds(opts: {
  stored: string[] | null;
  departmentSubDepartmentIds: string[];
  ticketSubDepartmentIds: string[];
  projectSubDepartmentId: string | null;
}): string[] {
  const { stored, departmentSubDepartmentIds, ticketSubDepartmentIds, projectSubDepartmentId } = opts;
  const enabled = new Set<string>();

  if (stored !== null) {
    for (const id of stored) enabled.add(id);
  } else {
    for (const id of departmentSubDepartmentIds) enabled.add(id);
  }

  for (const id of ticketSubDepartmentIds) enabled.add(id);
  if (projectSubDepartmentId) enabled.add(projectSubDepartmentId);

  return [...enabled];
}
