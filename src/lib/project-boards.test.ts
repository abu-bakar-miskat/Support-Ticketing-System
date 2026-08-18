import { describe, expect, it } from "vitest";
import {
  memberSubDepartmentIdsFromProject,
  parseEnabledBoardSubDepartmentIds,
  resolveEnabledBoardSubDepartmentIds,
} from "./project-boards";

describe("project-boards", () => {
  it("collects member team ids from memberships and profile team", () => {
    const ids = memberSubDepartmentIdsFromProject([
      {
        user: {
          subDepartmentId: "team-a",
          memberships: [{ subDepartment: { id: "team-b" } }],
        },
      },
      {
        user: {
          subDepartmentId: null,
          memberships: [],
        },
      },
    ]);
    expect(ids).toEqual(["team-b"]);
  });

  it("defaults enabled boards to department teams", () => {
    expect(
      resolveEnabledBoardSubDepartmentIds({
        stored: null,
        departmentSubDepartmentIds: ["team-a", "team-b"],
        ticketSubDepartmentIds: [],
        projectSubDepartmentId: null,
      }),
    ).toEqual(["team-a", "team-b"]);
  });

  it("always keeps ticket and project teams visible", () => {
    expect(
      resolveEnabledBoardSubDepartmentIds({
        stored: ["team-a"],
        departmentSubDepartmentIds: ["team-a", "team-b"],
        ticketSubDepartmentIds: ["team-c"],
        projectSubDepartmentId: "team-main",
      }),
    ).toEqual(["team-a", "team-c", "team-main"]);
  });

  it("parses stored board ids", () => {
    expect(parseEnabledBoardSubDepartmentIds(["team-a", "", 1, "team-b"])).toEqual([
      "team-a",
      "team-b",
    ]);
    expect(parseEnabledBoardSubDepartmentIds(null)).toBeNull();
  });
});
