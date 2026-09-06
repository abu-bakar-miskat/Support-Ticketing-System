import { expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: { ticket: { findMany: vi.fn(), count: vi.fn() } } }));
vi.mock("@/lib/board-search", () => ({
  resolveSearchTicketIds: vi.fn().mockResolvedValue(["match"]),
  resolveSubStatusTicketIds: vi.fn(), resolveFormFieldTicketIds: vi.fn(),
}));
import { prisma } from "@/lib/db";
import { resolveSearchTicketIds } from "@/lib/board-search";
import { getTaskListData } from "./task-list-data";

it("resolves search once and applies the same matching IDs to count and page queries", async () => {
  vi.mocked(prisma.ticket.findMany).mockResolvedValueOnce([{ id: "match" }] as never).mockResolvedValueOnce([]);
  vi.mocked(prisma.ticket.count).mockResolvedValue(0);
  await getTaskListData({
    filterParams: { tenantId: "tenant", search: "needle" }, sortKey: "created",
    isAdmin: false, isManager: false, isElevated: false, deptScope: null, error: null,
  }, "agent");
  expect(resolveSearchTicketIds).toHaveBeenCalledTimes(1);
  expect(prisma.ticket.findMany).toHaveBeenCalledTimes(2);
  const countWhere = vi.mocked(prisma.ticket.count).mock.calls[0][0]?.where;
  const pageWhere = vi.mocked(prisma.ticket.findMany).mock.calls[1][0]?.where;
  expect(pageWhere).toEqual(countWhere);
  expect(JSON.stringify(pageWhere)).toContain("match");
  expect(JSON.stringify(pageWhere)).toContain("tenant");
});
