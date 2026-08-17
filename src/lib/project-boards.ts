type MemberWithTeam = {
  user: {
    name: string;
    teamId: string | null;
    memberships: { team: { id: string } }[];
  };
};

export function memberTeamIdsFromProject(members: MemberWithTeam[]): string[] {
  const ids = new Set<string>();
  for (const pm of members) {
    const teamId = pm.user.memberships[0]?.team?.id ?? pm.user.teamId;
    if (teamId) ids.add(teamId);
  }
  return [...ids];
}

export function memberNamesByTeamId(members: MemberWithTeam[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const pm of members) {
    const teamId = pm.user.memberships[0]?.team?.id ?? pm.user.teamId;
    if (!teamId) continue;
    const list = map.get(teamId) ?? [];
    list.push(pm.user.name);
    map.set(teamId, list);
  }
  return map;
}

export function resolveBoardTeamSource(
  teamId: string,
  departmentTeamIds: string[],
  memberNamesByTeam: Map<string, string[]>,
): "department" | "member" | "tickets" {
  if (departmentTeamIds.includes(teamId)) return "department";
  if (memberNamesByTeam.has(teamId)) return "member";
  return "tickets";
}

export function parseEnabledBoardTeamIds(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Default boards come from the project's department teams, not member assignments. */
export function resolveEnabledBoardTeamIds(opts: {
  stored: string[] | null;
  departmentTeamIds: string[];
  ticketTeamIds: string[];
  projectTeamId: string | null;
}): string[] {
  const { stored, departmentTeamIds, ticketTeamIds, projectTeamId } = opts;
  const enabled = new Set<string>();

  if (stored !== null) {
    for (const id of stored) enabled.add(id);
  } else {
    for (const id of departmentTeamIds) enabled.add(id);
  }

  for (const id of ticketTeamIds) enabled.add(id);
  if (projectTeamId) enabled.add(projectTeamId);

  return [...enabled];
}
