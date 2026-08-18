import { describe, it, expect } from "vitest";
import {
  getNativeDepartmentIds,
  includeDeptProjectsForNativeMembers,
  isNativeDeptMemberOrManager,
} from "./support-project";
import { deptProjectsForDeptWhere } from "@/lib/dept-scope";
import { supportProjectsForDeptWhere } from "./support-project";

describe("support project native access", () => {
  const staffInDept = {
    id: "u1",
    role: "staff",
    memberships: [{ subDepartment: { department: { id: "dept-1" } } }],
  };

  const managerOfDept = {
    id: "u2",
    role: "manager",
    managedDepartmentIds: ["dept-1"],
    memberships: [],
  };

  const crossAccessGuest = {
    id: "u3",
    role: "staff",
    grantedAccessDeptIds: ["dept-1"],
    memberships: [{ subDepartment: { department: { id: "dept-home" } } }],
  };

  it("collects native department ids from teams, direct membership, and management", () => {
    expect(getNativeDepartmentIds(staffInDept)).toEqual(["dept-1"]);
    expect(getNativeDepartmentIds(managerOfDept)).toEqual(["dept-1"]);
    expect(getNativeDepartmentIds(crossAccessGuest)).toEqual(["dept-home"]);
  });

  it("recognises native members and managers but not cross-access guests", () => {
    expect(isNativeDeptMemberOrManager(staffInDept, "dept-1")).toBe(true);
    expect(isNativeDeptMemberOrManager(managerOfDept, "dept-1")).toBe(true);
    expect(isNativeDeptMemberOrManager(crossAccessGuest, "dept-1")).toBe(false);
  });

  it("widens project filters with all dept projects for native users", () => {
    const base = { members: { some: { userId: "u1" } } };
    expect(
      includeDeptProjectsForNativeMembers(base, staffInDept, "dept-1"),
    ).toEqual({
      OR: [base, deptProjectsForDeptWhere("dept-1")],
    });
    expect(
      includeDeptProjectsForNativeMembers(base, crossAccessGuest, "dept-1"),
    ).toEqual(base);
  });

  it("supportProjectsForDeptWhere is a subset of deptProjectsForDeptWhere", () => {
    expect(supportProjectsForDeptWhere("dept-1")).toMatchObject({
      kind: "support",
      ...deptProjectsForDeptWhere("dept-1"),
    });
  });
});
