import { describe, expect, it } from "vitest";
import {
  memberTeamIdsFromProject,
  parseEnabledBoardTeamIds,
  resolveEnabledBoardTeamIds,
} from "./project-boards";

describe("project-boards", () => {
  it("collects member team ids from memberships and profile team", () => {
    const ids = memberTeamIdsFromProject([
      {
        user: {
          teamId: "team-a",
          memberships: [{ team: { id: "team-b" } }],
        },
      },
      {
        user: {
          teamId: null,
          memberships: [],
        },
      },
    ]);
    expect(ids).toEqual(["team-b"]);
  });

  it("defaults enabled boards to department teams", () => {
    expect(
      resolveEnabledBoardTeamIds({
        stored: null,
        departmentTeamIds: ["team-a", "team-b"],
        ticketTeamIds: [],
        projectTeamId: null,
      }),
    ).toEqual(["team-a", "team-b"]);
  });

  it("always keeps ticket and project teams visible", () => {
    expect(
      resolveEnabledBoardTeamIds({
        stored: ["team-a"],
        departmentTeamIds: ["team-a", "team-b"],
        ticketTeamIds: ["team-c"],
        projectTeamId: "team-main",
      }),
    ).toEqual(["team-a", "team-c", "team-main"]);
  });

  it("parses stored board ids", () => {
    expect(parseEnabledBoardTeamIds(["team-a", "", 1, "team-b"])).toEqual([
      "team-a",
      "team-b",
    ]);
    expect(parseEnabledBoardTeamIds(null)).toBeNull();
  });
});
