import type { BoardCardData, SubDepartmentStatusConfig } from "@/components/board/board-types";
import type { AssignedSubtask } from "@/lib/board-data";

export type MyTasksResponse = {
  tasks: BoardCardData[];
  subtasks: AssignedSubtask[];
  reviewTasks: BoardCardData[];
  isManager: boolean;
  subDepartmentStatusMap: Record<string, SubDepartmentStatusConfig[]>;
};

export type AllTasksResponse = {
  tasks: BoardCardData[];
  isPrivileged: boolean;
  canExport: boolean;
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type ExportFormat = "excel" | "pdf" | "csv";

export type TasksMetaResponse = {
  subDepartmentStatuses: SubDepartmentStatusConfig[];
  availableProjects: { id: string; name: string; subDepartmentId: string | null; kind: string }[];
  availableModules: {
    id: string;
    name: string;
    projectId: string;
    projectName: string;
  }[];
  availableMembers: {
    id: string;
    name: string;
    avatarUrl: string | null;
    departmentName: string | null;
    subDepartmentName: string | null;
    role: string;
  }[];
  defaultSubDepartmentId: string | null;
};

export type AllTasksFilters = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string[];
  priority?: string[];
  projectId?: string[];
  assigneeId?: string[];
  moduleId?: string[];
  labels?: string[];
  dateFrom?: string;
  dateTo?: string;
  targetDateFrom?: string;
  targetDateTo?: string;
  sort?: string;
  unassigned?: boolean;
  source?: "intake" | "manual";
  /** List personal/admin draft tickets instead of published ones */
  drafts?: boolean;
};

export async function fetchMyTasks(): Promise<MyTasksResponse> {
  const res = await fetch("/api/tasks/my");
  if (!res.ok) throw new Error("Failed to fetch my tasks");
  return res.json();
}

export function buildTaskListSearchParams(filters: AllTasksFilters = {}): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.page)       params.set("page",       String(filters.page));
  if (filters.limit)      params.set("limit",      String(filters.limit));
  if (filters.search)     params.set("search",     filters.search);
  if (filters.status?.length)     params.set("status",     filters.status.join(","));
  if (filters.priority?.length)   params.set("priority",   filters.priority.join(","));
  if (filters.projectId?.length)  params.set("projectId",  filters.projectId.join(","));
  if (filters.assigneeId?.length) params.set("assigneeId", filters.assigneeId.join(","));
  if (filters.moduleId?.length)    params.set("moduleId",    filters.moduleId.join(","));
  if (filters.labels?.length)    params.set("labels",     filters.labels.join(","));
  if (filters.dateFrom)   params.set("dateFrom",   filters.dateFrom);
  if (filters.dateTo)     params.set("dateTo",     filters.dateTo);
  if (filters.targetDateFrom) params.set("targetDateFrom", filters.targetDateFrom);
  if (filters.targetDateTo)   params.set("targetDateTo",   filters.targetDateTo);
  if (filters.sort)       params.set("sort",       filters.sort);
  if (filters.unassigned) params.set("unassigned", "true");
  if (filters.source)     params.set("source",     filters.source);
  if (filters.drafts)     params.set("drafts",     "true");
  return params;
}

export async function fetchAllTasks(filters: AllTasksFilters = {}, signal?: AbortSignal): Promise<AllTasksResponse> {
  const params = buildTaskListSearchParams(filters);
  const res = await fetch(`/api/tasks/all?${params.toString()}`, { signal });
  if (!res.ok) throw new Error("Failed to fetch all tasks");
  return res.json();
}

/** URL for the admin/manager ticket export endpoint, honoring the current filters. */
export function buildTicketExportUrl(filters: AllTasksFilters = {}, format: ExportFormat): string {
  const params = buildTaskListSearchParams(filters);
  params.delete("page");
  params.delete("limit");
  params.set("format", format);
  return `/api/admin/tickets/export?${params.toString()}`;
}

export async function fetchTasksMeta(): Promise<TasksMetaResponse> {
  const res = await fetch("/api/tasks/meta");
  if (!res.ok) throw new Error("Failed to fetch tasks meta");
  return res.json();
}
