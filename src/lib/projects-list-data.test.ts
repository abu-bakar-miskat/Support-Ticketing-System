import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: { project: { findMany: vi.fn() } },
}));
vi.mock("@/lib/dept-scope", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProfileDeptScope: vi.fn(),
}));
vi.mock("@/lib/misc-project", () => ({
  dedupeMiscProjects: (p: unknown[]) => p,
}));
vi.mock("@/lib/board-data", () => ({
  avatarColorFor: () => "#000000",
}));

import { prisma } from "@/lib/db";
import { getProfileDeptScope, buildProjectDeptWhere, deptProjectsForDeptWhere } from "@/lib/dept-scope";
import { assignedProjectsInDeptWhere } from "@/lib/cross-access";
import { fetchProjectsList } from "./projects-list-data";

const mockFindMany = vi.mocked(prisma.project.findMany);
const mockDeptScope = vi.mocked(getProfileDeptScope);

const MEMBER_WHERE = { members: { some: { userId: "user-1" } } };

const staff = {
  id: "user-1",
  role: "staff",
  memberships: [{ subDepartment: { department: { id: "dept-1" } } }],
};
const hubStaff = {
  id: "user-1",
  role: "staff",
  memberships: [{ subDepartment: { department: { id: "hub-1" } } }],
};
const manager = {
  id: "user-1",
  role: "manager",
  managedDepartmentIds: ["dept-1"],
};

const hubScope = { activeDeptId: "hub-1", subDepartmentIds: ["team-h"], isHub: true };
const deptScope = { activeDeptId: "dept-1", subDepartmentIds: ["team-1"], isHub: false };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([] as never);
});

describe("fetchProjectsList — mine", () => {
  it("staff in hub view sees only assigned projects", async () => {
    mockDeptScope.mockResolvedValue(hubScope as never);
    await fetchProjectsList(hubStaff, "mine");
    expect(mockFindMany.mock.calls[0][0]?.where).toEqual(MEMBER_WHERE);
  });

  it("staff in a department view sees only assigned projects in that department", async () => {
    mockDeptScope.mockResolvedValue(deptScope as never);
    await fetchProjectsList(staff, "mine");
    expect(mockFindMany.mock.calls[0][0]?.where).toEqual({
      AND: [MEMBER_WHERE, buildProjectDeptWhere(deptScope as never)],
    });
  });

  it("manager in hub view sees member plus managed-department projects", async () => {
    mockDeptScope.mockResolvedValue(hubScope as never);
    await fetchProjectsList(manager, "mine");
    expect(mockFindMany.mock.calls[0][0]?.where).toEqual({
      OR: [
        MEMBER_WHERE,
        { departmentId: { in: ["dept-1"] } },
        { subDepartment: { departmentId: { in: ["dept-1"] } } },
      ],
    });
  });

  it("manager scoped to a department gets managed and assigned projects in that dept", async () => {
    mockDeptScope.mockResolvedValue(deptScope as never);
    await fetchProjectsList(
      { ...manager, managedDepartmentIds: ["dept-1"] },
      "mine",
    );
    expect(mockFindMany.mock.calls[0][0]?.where).toEqual({
      AND: [
        {
          OR: [
            MEMBER_WHERE,
            { departmentId: { in: ["dept-1"] } },
            { subDepartment: { departmentId: { in: ["dept-1"] } } },
          ],
        },
        buildProjectDeptWhere(deptScope as never),
      ],
    });
  });

  it("manager viewing a dept they do NOT manage keeps that dept's filter ANDed in", async () => {
    const otherDeptScope = { activeDeptId: "dept-2", subDepartmentIds: ["team-2"], isHub: false };
    mockDeptScope.mockResolvedValue(otherDeptScope as never);
    await fetchProjectsList(manager, "mine");
    // The managed-dept OR arm still names dept-1, but the AND with dept-2's
    // filter means only dept-2 projects (member or managed) can match.
    expect(mockFindMany.mock.calls[0][0]?.where).toEqual({
      AND: [
        {
          OR: [
            MEMBER_WHERE,
            { departmentId: { in: ["dept-1"] } },
            { subDepartment: { departmentId: { in: ["dept-1"] } } },
          ],
        },
        buildProjectDeptWhere(otherDeptScope as never),
      ],
    });
  });

  it("cross-access visitors see only member projects in the active department", async () => {
    const crossScope = {
      activeDeptId: "other-dept",
      subDepartmentIds: ["team-x"],
      allowedDeptIds: ["other-dept"],
      isHub: false,
      isCrossAccessOnly: true,
    };
    mockDeptScope.mockResolvedValue(crossScope as never);
    await fetchProjectsList(
      { ...manager, grantedAccessDeptIds: ["other-dept"] },
      "mine",
    );
    expect(mockFindMany.mock.calls[0][0]?.where).toEqual(
      assignedProjectsInDeptWhere("user-1", "other-dept"),
    );
  });

  it("cross-access 'all' tab is also scoped to assigned projects in the active department", async () => {
    const crossScope = {
      activeDeptId: "other-dept",
      subDepartmentIds: ["team-x"],
      allowedDeptIds: ["other-dept"],
      isHub: false,
      isCrossAccessOnly: true,
    };
    mockDeptScope.mockResolvedValue(crossScope as never);
    await fetchProjectsList(
      { ...staff, grantedAccessDeptIds: ["other-dept"] },
      "all",
    );
    expect(mockFindMany.mock.calls[0][0]?.where).toEqual(
      assignedProjectsInDeptWhere("user-1", "other-dept"),
    );
  });
});

describe("fetchProjectsList — all", () => {
  it("staff 'all' in a dept view uses the full department project filter", async () => {
    mockDeptScope.mockResolvedValue(deptScope as never);
    await fetchProjectsList(staff, "all");
    expect(mockFindMany.mock.calls[0][0]?.where).toEqual(
      deptProjectsForDeptWhere("dept-1"),
    );
  });

  it("staff 'all' without dept scope falls back to native department membership", async () => {
    mockDeptScope.mockResolvedValue(null);
    await fetchProjectsList(
      {
        ...staff,
        memberships: [{ subDepartment: { department: { id: "dept-1" } } }],
      },
      "all",
    );
    expect(mockFindMany.mock.calls[0][0]?.where).toEqual(
      deptProjectsForDeptWhere("dept-1"),
    );
  });

  it("manager 'all' in a dept view uses the dept filter only", async () => {
    mockDeptScope.mockResolvedValue(deptScope as never);
    await fetchProjectsList(manager, "all");
    expect(mockFindMany.mock.calls[0][0]?.where).toEqual(
      buildProjectDeptWhere(deptScope as never),
    );
  });
});
