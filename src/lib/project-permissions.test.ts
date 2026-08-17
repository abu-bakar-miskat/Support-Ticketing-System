import { describe, it, expect } from "vitest";
import {
  canManageProjects,
  canDeleteProjects,
  canAccessProjectSettings,
  canModifyProjectContent,
  isPrivilegedProjectEditor,
  isProjectLead,
} from "@/lib/project-permissions";

describe("project-permissions", () => {
  it("treats profile lead role as project manager", () => {
    const profile = { role: "lead", memberships: [] };
    expect(isProjectLead(profile)).toBe(true);
    expect(canManageProjects(profile)).toBe(true);
    expect(isPrivilegedProjectEditor(profile)).toBe(true);
    expect(canDeleteProjects(profile)).toBe(false);
  });

  it("treats team membership lead as project manager", () => {
    const profile = {
      role: "staff",
      memberships: [{ role: "lead" }],
    };
    expect(isProjectLead(profile)).toBe(true);
    expect(canManageProjects(profile)).toBe(true);
    expect(isPrivilegedProjectEditor(profile)).toBe(true);
  });

  it("staff without lead membership cannot manage projects", () => {
    const profile = { role: "staff", memberships: [{ role: "staff" }] };
    expect(canManageProjects(profile)).toBe(false);
    expect(isPrivilegedProjectEditor(profile)).toBe(false);
  });

  it("allows project settings for assigned members", () => {
    const profile = { role: "staff", memberships: [] };
    expect(
      canAccessProjectSettings(profile, {
        projectDeptId: "dept-a",
        activeDeptId: "dept-a",
        isProjectMember: true,
      }),
    ).toBe(true);
  });

  it("allows project settings for full-access cross-dept guests in that dept", () => {
    const profile = {
      role: "staff",
      memberships: [],
      fullAccessGrantedDeptIds: ["dept-a"],
    };
    expect(
      canAccessProjectSettings(profile, {
        projectDeptId: "dept-a",
        activeDeptId: "dept-a",
        isProjectMember: false,
      }),
    ).toBe(true);
  });

  it("denies project settings for limited cross-access guests who are not assigned", () => {
    const profile = {
      role: "staff",
      memberships: [],
      fullAccessGrantedDeptIds: [],
    };
    expect(
      canAccessProjectSettings(profile, {
        projectDeptId: "dept-a",
        activeDeptId: "dept-a",
        isProjectMember: false,
      }),
    ).toBe(false);
  });

  it("allows native dept staff to modify only when they are project members", () => {
    const staff = { role: "staff", memberships: [] };
    expect(canModifyProjectContent(staff, false)).toBe(false);
    expect(canModifyProjectContent(staff, true)).toBe(true);
    const lead = { role: "lead", memberships: [] };
    expect(canModifyProjectContent(lead, false)).toBe(true);
  });
});
