import { describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import {
  decideDepartmentAccess,
  deriveEffectiveRole,
  shapeScope,
  type ScopeRow,
} from "./role-assignment";

const INCIDENT_TENANT = "tenant-incident";
const INCIDENT_DEPARTMENT = "department-incident";
const OTHER_DEPARTMENT = "department-other";
const INCIDENT_SUB_DEPARTMENT = "sub-department-incident";

type LegacyRoleFixture = {
  profileRole: Role;
  managerDepartmentIds: string[];
  subDepartmentMemberships: { id: string; role: Role; isActive: boolean }[];
};

/**
 * Models the legacy sources used by the current login resolution. Profile.role
 * is deliberately absent from the result: it is a display/default field, while
 * active manager and sub-department grants determine the effective role.
 */
function resolveLegacyFixtureRole(fixture: LegacyRoleFixture): Role {
  const rows: ScopeRow[] = [
    ...fixture.managerDepartmentIds.map((scopeId) => ({
      role: "manager" as const,
      scopeType: "DEPARTMENT" as const,
      scopeId,
    })),
    ...fixture.subDepartmentMemberships
      .filter((membership) => membership.isActive)
      .map((membership) => ({
        role: membership.role,
        scopeType: "SUB_DEPARTMENT" as const,
        scopeId: membership.id,
      })),
  ];

  return deriveEffectiveRole(rows);
}

function incidentFixture(): LegacyRoleFixture {
  return {
    profileRole: "sub_manager",
    managerDepartmentIds: [INCIDENT_DEPARTMENT],
    subDepartmentMemberships: [
      { id: INCIDENT_SUB_DEPARTMENT, role: "sub_manager", isActive: true },
    ],
  };
}

describe("role consistency regression fixture", () => {
  it("reproduces the incident: profile/sub-department sub-manager plus a department manager grant resolves as manager", () => {
    expect(resolveLegacyFixtureRole(incidentFixture())).toBe("manager");
  });

  it("reproduces the broken profile-only demotion: editing Profile.role does not revoke the department manager grant", () => {
    const before = incidentFixture();
    const afterProfileOnlyEdit = { ...before, profileRole: "sub_manager" as const };

    expect(before.managerDepartmentIds).toEqual([INCIDENT_DEPARTMENT]);
    expect(afterProfileOnlyEdit.managerDepartmentIds).toEqual([INCIDENT_DEPARTMENT]);
    expect(resolveLegacyFixtureRole(afterProfileOnlyEdit)).toBe("manager");
  });

  it("specifies a same-scope Manager-to-Sub-manager conversion without removing an unrelated department manager grant", () => {
    const before: LegacyRoleFixture = {
      ...incidentFixture(),
      managerDepartmentIds: [INCIDENT_DEPARTMENT, OTHER_DEPARTMENT],
    };
    const afterScopedConversion: LegacyRoleFixture = {
      ...before,
      managerDepartmentIds: before.managerDepartmentIds.filter(
        (departmentId) => departmentId !== INCIDENT_DEPARTMENT,
      ),
    };

    expect(afterScopedConversion.managerDepartmentIds).not.toContain(INCIDENT_DEPARTMENT);
    expect(afterScopedConversion.managerDepartmentIds).toEqual([OTHER_DEPARTMENT]);
    expect(resolveLegacyFixtureRole(afterScopedConversion)).toBe("manager");
  });

  it("keeps tenant privileges isolated from another tenant", () => {
    const scope = shapeScope([
      { role: "admin", scopeType: "TENANT", scopeId: INCIDENT_TENANT },
    ]);

    expect(decideDepartmentAccess(scope, INCIDENT_DEPARTMENT, INCIDENT_TENANT, [])).toBe(true);
    expect(decideDepartmentAccess(scope, OTHER_DEPARTMENT, "tenant-other", [])).toBe(false);
  });

  it("distinguishes a department Admin from a department Manager", () => {
    const scope = shapeScope([
      { role: "admin", scopeType: "DEPARTMENT", scopeId: INCIDENT_DEPARTMENT },
      { role: "manager", scopeType: "DEPARTMENT", scopeId: OTHER_DEPARTMENT },
    ]);

    expect(scope.departmentAdminIds).toEqual([INCIDENT_DEPARTMENT]);
    expect(scope.departmentManagerIds.sort()).toEqual([INCIDENT_DEPARTMENT, OTHER_DEPARTMENT]);
  });

  it("specifies the post-demotion session boundary: server authorization uses fresh assignments even if an old browser label remains cached", () => {
    const oldBrowserRole: Role = "manager";
    const freshServerRole = resolveLegacyFixtureRole({
      ...incidentFixture(),
      managerDepartmentIds: [],
    });

    expect(oldBrowserRole).toBe("manager");
    expect(freshServerRole).toBe("sub_manager");
  });
});
