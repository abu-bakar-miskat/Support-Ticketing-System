// Central query key factory — import from here instead of defining inline strings.

export const ticketKeys = {
  all: ["tickets"] as const,
  detail: (id: string) => ["tickets", id, "detail"] as const,
  shell: (id: string) => ["tickets", id, "shell"] as const,
  byProject: (projectId: string) => ["tickets", "project", projectId] as const,
}

export const subDepartmentKeys = {
  members: (subDepartmentId: string) => ["teams", subDepartmentId, "members"] as const,
  statuses: (subDepartmentId: string) => ["teams", subDepartmentId, "statuses"] as const,
}

export const adminKeys = {
  projects: ["admin", "projects"] as const,
  users: ["admin", "users"] as const,
}

export const sprintKeys = {
  all: ["sprints"] as const,
  byProject: (projectId: string) => ["sprints", "project", projectId] as const,
  detail: (id: string) => ["sprints", id] as const,
}

export const moduleKeys = {
  all: ["modules"] as const,
  byProject: (projectId: string) => ["modules", "project", projectId] as const,
  rollup: (projectId: string) => ["modules", "rollup", projectId] as const,
}

export const taskKeys = {
  my: () => ["tasks", "my"] as const,
  all: () => ["tasks", "all"] as const,
  allInfinite: (filters: Record<string, unknown>) => ["tasks", "all", "infinite", filters] as const,
  meta: (deptId?: string | null) => ["tasks", "meta", deptId ?? null] as const,
}

export const timeKeys = {
  entries: () => ["time", "entries"] as const,
}

export const mentionKeys = {
  all: () => ["mentions"] as const,
}

export const labelKeys = {
  all: ["labels"] as const,
}

export const calendarKeys = {
  month: (deptId: string, from: string, to: string) =>
    ["calendar", deptId, from, to] as const,
  upcoming: () => ["calendar", "upcoming-holidays"] as const,
}

export const reportKeys = {
  subDepartmentTime: (from: string, to: string, projectId: string, personId: string) =>
    ["reports", "team-time", from, to, projectId, personId] as const,
  overview: (from: string, to: string, projectId: string, personId: string) =>
    ["reports", "overview", from, to, projectId, personId] as const,
}
