import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockGet,
  })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    department: {
      findUnique: vi.fn(async () => ({ isHub: false })),
    },
    projectMember: {
      findMany: vi.fn(async () => []),
    },
    subDepartment: {
      findFirst: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const order: Record<string, string> = {
          "team-general": "dept-general",
          "team-web": "dept-web",
          "team-support": "dept-support",
        };
        const id = where.id.in.find((tid) => order[tid]) ?? where.id.in[0];
        return { departmentId: order[id] ?? "dept-web" };
      }),
      findMany: vi.fn(async () => [{ id: "team-web" }]),
    },
  },
}));

import { getProfileDeptScope } from "@/lib/dept-scope";

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockReturnValue({ value: "dept-web" });
});

describe("getProfileDeptScope — staff native department visits", () => {
  it("does not treat Web Development as cross-access when user has a team there", async () => {
    const scope = await getProfileDeptScope({
      id: "user-1",
      role: "staff",
      subDepartmentIds: ["team-general", "team-web"],
      memberships: [
        { subDepartment: { department: { id: "dept-general" } } },
        { subDepartment: { department: { id: "dept-web" } } },
      ],
      grantedAccessDeptIds: ["dept-software"],
      directMemberDeptIds: ["dept-web"],
    });

    expect(scope?.activeDeptId).toBe("dept-web");
    expect(scope?.isCrossAccessOnly).not.toBe(true);
  });

  it("still restricts limited cross-access guests to assigned projects only", async () => {
    const scope = await getProfileDeptScope({
      id: "user-2",
      role: "staff",
      subDepartmentIds: ["team-support"],
      memberships: [{ subDepartment: { department: { id: "dept-support" } } }],
      grantedAccessDeptIds: ["dept-web"],
    });

    expect(scope?.activeDeptId).toBe("dept-web");
    expect(scope?.isCrossAccessOnly).toBe(true);
  });
});
