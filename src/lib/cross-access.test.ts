import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    subDepartment: { findUnique: vi.fn(), findFirst: vi.fn() },
    ticket: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    projectMember: { count: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import {
  assignedProjectsInDeptWhere,
  isLimitedCrossAccessToDept,
  projectEffectiveDeptId,
  canCrossAccessGuestViewTicket,
  buildTicketEditContext,
} from "./cross-access";

const mockProjectMemberCount = vi.mocked(prisma.projectMember.count);
const mockProjectFindUnique = vi.mocked(prisma.project.findUnique);

describe("assignedProjectsInDeptWhere", () => {
  it("requires membership and active department", () => {
    expect(assignedProjectsInDeptWhere("user-1", "dept-a")).toEqual({
      members: { some: { userId: "user-1" } },
      OR: [{ departmentId: "dept-a" }, { subDepartment: { departmentId: "dept-a" } }],
    });
  });
});

describe("isLimitedCrossAccessToDept", () => {
  const profile = {
    grantedAccessDeptIds: ["dept-a"],
    fullAccessGrantedDeptIds: [] as string[],
    directMemberDeptIds: [] as string[],
  };

  it("is true for project-scoped grants", () => {
    expect(isLimitedCrossAccessToDept(profile, "dept-a")).toBe(true);
  });

  it("is false for full-access grants", () => {
    expect(
      isLimitedCrossAccessToDept(
        { ...profile, fullAccessGrantedDeptIds: ["dept-a"] },
        "dept-a",
      ),
    ).toBe(false);
  });

  it("is true for direct member without full access", () => {
    expect(
      isLimitedCrossAccessToDept(
        { grantedAccessDeptIds: [], directMemberDeptIds: ["dept-a"] },
        "dept-a",
      ),
    ).toBe(true);
  });
});

describe("projectEffectiveDeptId", () => {
  it("prefers project departmentId over team", () => {
    expect(
      projectEffectiveDeptId({
        departmentId: "dept-a",
        subDepartmentId: "team-1",
        subDepartment: { departmentId: "dept-b" },
      }),
    ).toBe("dept-a");
  });

  it("falls back to team department", () => {
    expect(
      projectEffectiveDeptId({
        departmentId: null,
        subDepartmentId: "team-1",
        subDepartment: { departmentId: "dept-b" },
      }),
    ).toBe("dept-b");
  });
});

describe("canCrossAccessGuestViewTicket", () => {
  const limitedProfile = {
    id: "user-1",
    grantedAccessDeptIds: ["dept-a"],
    fullAccessGrantedDeptIds: [] as string[],
    directMemberDeptIds: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows full-access guests for any ticket in the department", async () => {
    const allowed = await canCrossAccessGuestViewTicket(
      { ...limitedProfile, fullAccessGrantedDeptIds: ["dept-a"] },
      {
        projectId: "proj-1",
        subDepartmentId: "team-1",
        subDepartment: { departmentId: "dept-a" },
      },
    );
    expect(allowed).toBe(true);
    expect(mockProjectMemberCount).not.toHaveBeenCalled();
  });

  it("allows project-scoped guests only when they are project members", async () => {
    mockProjectMemberCount.mockResolvedValue(1);
    const allowed = await canCrossAccessGuestViewTicket(limitedProfile, {
      projectId: "proj-1",
      subDepartmentId: "team-1",
      subDepartment: { departmentId: "dept-a" },
    });
    expect(allowed).toBe(true);
    expect(mockProjectMemberCount).toHaveBeenCalledWith({
      where: { projectId: "proj-1", userId: "user-1" },
    });
  });

  it("denies project-scoped guests who are not project members", async () => {
    mockProjectMemberCount.mockResolvedValue(0);
    const allowed = await canCrossAccessGuestViewTicket(limitedProfile, {
      projectId: "proj-1",
      subDepartmentId: "team-1",
      subDepartment: { departmentId: "dept-a" },
    });
    expect(allowed).toBe(false);
  });

  it("resolves department from project when team dept is missing", async () => {
    mockProjectFindUnique.mockResolvedValue({
      departmentId: "dept-a",
      subDepartment: { departmentId: null },
    } as never);
    mockProjectMemberCount.mockResolvedValue(1);

    const allowed = await canCrossAccessGuestViewTicket(limitedProfile, {
      projectId: "proj-1",
      subDepartmentId: "team-1",
      subDepartment: { departmentId: null },
      projectDeptId: null,
    });
    expect(allowed).toBe(true);
  });
});

describe("buildTicketEditContext", () => {
  const limitedProfile = {
    id: "user-1",
    role: "staff",
    grantedAccessDeptIds: ["dept-a"],
    fullAccessGrantedDeptIds: [] as string[],
    directMemberDeptIds: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses project department for cross-access edit checks when team dept differs", async () => {
    mockProjectFindUnique.mockResolvedValue({
      departmentId: "dept-a",
      subDepartment: { departmentId: "dept-b" },
    } as never);
    mockProjectMemberCount.mockResolvedValue(1);

    const ctx = await buildTicketEditContext(limitedProfile, {
      creatorId: "other-user",
      subDepartmentId: "team-1",
      projectId: "proj-1",
      subDepartment: { departmentId: "dept-b" },
      assignees: [],
    });

    expect(ctx.departmentId).toBe("dept-a");
    expect(ctx.subDepartmentId).toBe("team-1");
    expect(ctx.viewerIsProjectMember).toBe(true);
  });
});
