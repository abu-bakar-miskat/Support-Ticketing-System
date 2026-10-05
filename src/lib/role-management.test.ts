import { describe, expect, it } from "vitest";
import {
  planLegacyDepartmentRoleUpdate,
  previewRoleChanges,
  type RoleChange,
} from "./role-management";

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

describe("planLegacyDepartmentRoleUpdate", () => {
  it("plans a Manager-to-Sub-manager conversion by revoking the department manager grant", () => {
    const changes = planLegacyDepartmentRoleUpdate({
      tenantId: "tenant-a",
      departmentId: "department-a",
      subDepartmentId: "sub-department-a",
      newRole: "sub_manager",
      current: [departmentManager, unrelatedManager],
    });

    expect(changes).toEqual([
      { scopeType: "DEPARTMENT", scopeId: "department-a", role: "agent" },
      { scopeType: "SUB_DEPARTMENT", scopeId: "sub-department-a", role: "sub_manager" },
    ]);
  });

  it("plans a department manager grant without touching other departments", () => {
    const changes = planLegacyDepartmentRoleUpdate({
      tenantId: "tenant-a",
      departmentId: "department-a",
      newRole: "manager",
      current: [unrelatedManager],
    });

    expect(changes).toEqual([departmentManager]);
  });

  it("plans a tenant-wide Admin grant without requiring a department", () => {
    const changes = planLegacyDepartmentRoleUpdate({
      tenantId: "tenant-a",
      departmentId: null,
      newRole: "admin",
      current: [],
    });

    expect(changes).toEqual([
      { scopeType: "TENANT", scopeId: "tenant-a", role: "admin" },
    ]);
  });

  it("downgrades a tenant admin to agent when demoting away from Admin", () => {
    const changes = planLegacyDepartmentRoleUpdate({
      tenantId: "tenant-a",
      departmentId: "department-a",
      subDepartmentId: "sub-department-a",
      newRole: "agent",
      current: [{ scopeType: "TENANT", scopeId: "tenant-a", role: "admin" }],
    });

    expect(changes).toEqual([
      { scopeType: "TENANT", scopeId: "tenant-a", role: "agent" },
      { scopeType: "SUB_DEPARTMENT", scopeId: "sub-department-a", role: "agent" },
    ]);
  });
});
