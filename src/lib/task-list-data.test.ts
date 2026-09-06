import { expect, it, vi } from "vitest";
vi.mock("@/lib/board-data", () => ({ getBoardCards: vi.fn(), countBoardCards: vi.fn(), resolveBoardCardFilters: vi.fn(async (params) => params) }));
import { getBoardCards, countBoardCards } from "@/lib/board-data";
import { getTaskListData } from "./task-list-data";

it("preserves authorization filters and paginates the server-rendered and API list identically", async () => {
  vi.mocked(countBoardCards).mockResolvedValue(26);
  vi.mocked(getBoardCards).mockResolvedValue([{ dbId: "last" }] as never);
  const filterParams = { tenantId: "tenant", allowedDeptIds: ["dept"], statusIn: ["OPEN"] };
  const result = await getTaskListData({ filterParams, sortKey: "created", isAdmin: false, isManager: false, isElevated: false, deptScope: null, error: null }, "agent", 2, 25);
  expect(getBoardCards).toHaveBeenCalledWith({ ...filterParams, timeForUserId: "agent", sortKey: "created", skip: 25, take: 25 });
  expect(result).toMatchObject({ total: 26, page: 2, hasMore: false, canExport: false, isPrivileged: false });
});
