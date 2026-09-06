import { describe, expect, it } from "vitest";
import { previewRoleChanges, type RoleChange } from "./role-management";

const departmentManager: RoleChange = {
  scopeType: "DEPARTMENT",
  scopeId: "department-a",
  role: "manager",
};
const subManager: RoleChange = {
  scopeType: "SUB_DEPARTMENT",
  scopeId: "sub-department-a",
  role: "sub_manager",
};
const unrelatedManager: RoleChange = {
  scopeType: "DEPARTMENT",
  scopeId: "department-b",
  role: "manager",
};

describe("previewRoleChanges", () => {
  it("shows a scoped Manager-to-Sub-manager conversion and retained unrelated access", () => {
    const preview = previewRoleChanges(
      [departmentManager, unrelatedManager],
      [{ ...departmentManager, role: "agent" }, subManager, unrelatedManager],
    );

    expect(preview.removed).toEqual([departmentManager]);
    expect(preview.added).toEqual([{ ...departmentManager, role: "agent" }, subManager]);
    expect(preview.retained).toEqual([unrelatedManager]);
  });
});
