import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {
  ticket: { groupBy: vi.fn(), findMany: vi.fn() },
  projectMember: { findMany: vi.fn() }, timeEntry: { findMany: vi.fn() },
  activityLog: { findMany: vi.fn() }, subDepartmentStatus: { findMany: vi.fn() },
} }));
vi.mock("@/lib/dept-scope", () => ({
  getProfileDeptScope: vi.fn().mockResolvedValue({ subDepartmentIds: ["a", "b"], isHub: true }),
  buildProjectDeptWhere: vi.fn(),
}));
import { prisma } from "@/lib/db";
import { getHomeDashboardData } from "./dashboard-home-data";

const group = (subDepartmentId: string, status: string, count: number) => ({
  subDepartmentId, status, projectId: "project", _count: { _all: count },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 7, 12));
  vi.mocked(prisma.projectMember.findMany).mockResolvedValue([
    { project: { id: "project", name: "Project", slug: "project", color: null } },
  ] as never);
  vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([]);
  vi.mocked(prisma.activityLog.findMany).mockResolvedValue([]);
  vi.mocked(prisma.subDepartmentStatus.findMany).mockResolvedValue([
    { subDepartmentId: "a", label: "Approved", isComplete: true },
    { subDepartmentId: "b", label: "Approved", isComplete: false },
  ] as never);
});
afterEach(() => vi.useRealTimers());

it("keeps full metrics and project counts while fetching details only for attention", async () => {
  vi.mocked(prisma.ticket.groupBy)
    .mockResolvedValueOnce([
      group("a", "Approved", 1000), group("b", "Approved", 2),
      group("a", "Done", 5), group("a", "In Progress", 3), group("a", "Blocked", 1),
    ] as never)
    .mockResolvedValueOnce([group("a", "Approved", 10), group("b", "Approved", 1), group("a", "Blocked", 1)] as never)
    .mockResolvedValueOnce([group("b", "Approved", 2), group("a", "In Progress", 3)] as never);
  const attentionRow = { title: "Task", ticketNumber: 1, priority: "Medium", dueDate: new Date(2026, 8, 6), subDepartment: { prefix: "T" } };
  vi.mocked(prisma.ticket.findMany).mockResolvedValue([
    { ...attentionRow, id: "complete", subDepartmentId: "a", status: "Approved" },
    { ...attentionRow, id: "overdue", subDepartmentId: "b", status: "Approved" },
    { ...attentionRow, id: "blocked", subDepartmentId: "a", status: "Blocked", dueDate: null },
  ] as never);
  const data = await getHomeDashboardData({ id: "agent" } as never);
  expect(data.metrics).toMatchObject({ open: 6, completed: 1005, todo: 2, inProgress: 4, overdue: 1, dueThisWeek: 5 });
  expect(data.projects[0].openCount).toBe(6);
  expect(data.attention.map((t) => [t.dbId, t.kind])).toEqual([["overdue", "overdue"], ["blocked", "blocked"]]);
  expect(prisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ assigneeId: "agent", deletedAt: null, subDepartmentId: { in: ["a", "b"] }, OR: expect.any(Array) }),
  }));
});

it("does not fetch ticket details when every assignment is complete", async () => {
  vi.mocked(prisma.ticket.groupBy)
    .mockResolvedValueOnce([group("a", "Approved", 2000)] as never)
    .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  const data = await getHomeDashboardData({ id: "agent" } as never);
  expect(data.metrics.open).toBe(0);
  expect(data.metrics.completed).toBe(2000);
  expect(data.attention).toEqual([]);
  expect(prisma.ticket.findMany).not.toHaveBeenCalled();
});
