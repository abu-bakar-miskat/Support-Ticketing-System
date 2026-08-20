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
    const profile = { role: "sub_manager", memberships: [] };
    expect(isProjectLead(profile)).toBe(true);
    expect(canManageProjects(profile)).toBe(true);
    expect(isPrivilegedProjectEditor(profile)).toBe(true);
    expect(canDeleteProjects(profile)).toBe(false);
  });

  it("treats team membership lead as project manager", () => {
    const profile = {
      role: "agent",
      memberships: [{ role: "sub_manager" }],
    };
    expect(isProjectLead(profile)).toBe(true);
    expect(canManageProjects(profile)).toBe(true);
    expect(isPrivilegedProjectEditor(profile)).toBe(true);
  });

  it("staff without lead membership cannot manage projects", () => {
    const profile = { role: "agent", memberships: [{ role: "agent" }] };
    expect(canManageProjects(profile)).toBe(false);
    expect(isPrivilegedProjectEditor(profile)).toBe(false);
  });

  it("allows project settings for assigned members", () => {
    const profile = { role: "agent", memberships: [] };
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
      role: "agent",
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
      role: "agent",
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
    const staff = { role: "agent", memberships: [] };
    expect(canModifyProjectContent(staff, false)).toBe(false);
    expect(canModifyProjectContent(staff, true)).toBe(true);
    const lead = { role: "sub_manager", memberships: [] };
    expect(canModifyProjectContent(lead, false)).toBe(true);
  });
});
