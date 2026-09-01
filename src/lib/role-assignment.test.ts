import { describe, it, expect } from "vitest";
import {
  shapeScope,
  decideDepartmentAccess,
  deriveEffectiveRole,
  subDepartmentScopeForDepartment,
  computeSubDepartmentTeamIds,
  resolveEffectiveSubDepartmentManager,
  type ScopeRow,
  type UserScope,
} from "./role-assignment";

function scope(overrides: Partial<UserScope> = {}): UserScope {
  return {
    isPlatformAdmin: false,
    tenantIds: [],
    tenantAdminIds: [],
    departmentIds: [],
    departmentAdminIds: [],
    departmentManagerIds: [],
    subDepartmentIds: [],
    ...overrides,
  };
}

describe("shapeScope", () => {
  it("marks platform admin from a PLATFORM row", () => {
    const rows: ScopeRow[] = [{ role: "admin", scopeType: "PLATFORM", scopeId: null }];
    expect(shapeScope(rows).isPlatformAdmin).toBe(true);
  });

  it("collects tenant ids and flags tenant admins", () => {
    const rows: ScopeRow[] = [
      { role: "admin", scopeType: "TENANT", scopeId: "t1" },
      { role: "agent", scopeType: "TENANT", scopeId: "t2" },
    ];
    const s = shapeScope(rows);
    expect(s.tenantIds.sort()).toEqual(["t1", "t2"]);
    expect(s.tenantAdminIds).toEqual(["t1"]);
  });

  it("splits department admin vs manager ids", () => {
    const rows: ScopeRow[] = [
      { role: "manager", scopeType: "DEPARTMENT", scopeId: "d1" },
      { role: "agent", scopeType: "DEPARTMENT", scopeId: "d2" },
      { role: "admin", scopeType: "DEPARTMENT", scopeId: "d3" },
    ];
    const s = shapeScope(rows);
    expect(s.departmentIds.sort()).toEqual(["d1", "d2", "d3"]);
    expect(s.departmentAdminIds).toEqual(["d3"]);
    expect(s.departmentManagerIds.sort()).toEqual(["d1", "d3"]);
  });

  it("collects sub-department ids", () => {
    const rows: ScopeRow[] = [{ role: "agent", scopeType: "SUB_DEPARTMENT", scopeId: "team-9" }];
    expect(shapeScope(rows).subDepartmentIds).toEqual(["team-9"]);
  });

  it("dedupes repeated scope ids", () => {
    const rows: ScopeRow[] = [
      { role: "agent", scopeType: "DEPARTMENT", scopeId: "d1" },
      { role: "manager", scopeType: "DEPARTMENT", scopeId: "d1" },
    ];
    expect(shapeScope(rows).departmentIds).toEqual(["d1"]);
  });

  it("ignores scoped rows with a null scopeId", () => {
    const rows: ScopeRow[] = [{ role: "agent", scopeType: "DEPARTMENT", scopeId: null }];
    expect(shapeScope(rows).departmentIds).toEqual([]);
  });
});

describe("deriveEffectiveRole", () => {
  it("platform assignment is not a global admin role", () => {
    expect(deriveEffectiveRole([{ role: "admin", scopeType: "PLATFORM", scopeId: null }])).toBe(
      "agent",
    );
  });

  it("tenant admin → admin", () => {
    expect(deriveEffectiveRole([{ role: "admin", scopeType: "TENANT", scopeId: "t1" }])).toBe(
      "admin",
    );
  });

  it("department manager → manager", () => {
    expect(
      deriveEffectiveRole([{ role: "manager", scopeType: "DEPARTMENT", scopeId: "d1" }]),
    ).toBe("manager");
  });

  it("department admin collapses to manager globally (dept-admin power comes from departmentAdminIds)", () => {
    expect(
      deriveEffectiveRole([{ role: "admin", scopeType: "DEPARTMENT", scopeId: "d1" }]),
    ).toBe("manager");
  });

  it("tenant manager → manager", () => {
    expect(deriveEffectiveRole([{ role: "manager", scopeType: "TENANT", scopeId: "t1" }])).toBe(
      "manager",
    );
  });

  it("sub-department lead → lead", () => {
    expect(deriveEffectiveRole([{ role: "sub_manager", scopeType: "SUB_DEPARTMENT", scopeId: "team-1" }])).toBe(
      "sub_manager",
    );
  });

  it("plain department/tenant membership → staff", () => {
    expect(
      deriveEffectiveRole([
        { role: "agent", scopeType: "TENANT", scopeId: "t1" },
        { role: "agent", scopeType: "DEPARTMENT", scopeId: "d1" },
      ]),
    ).toBe("agent");
  });

  it("no assignments → staff", () => {
    expect(deriveEffectiveRole([])).toBe("agent");
  });

  it("admin outranks a concurrent lead/manager assignment", () => {
    expect(
      deriveEffectiveRole([
        { role: "sub_manager", scopeType: "SUB_DEPARTMENT", scopeId: "team-1" },
        { role: "manager", scopeType: "DEPARTMENT", scopeId: "d1" },
        { role: "admin", scopeType: "TENANT", scopeId: "t1" },
      ]),
    ).toBe("admin");
  });
});

describe("decideDepartmentAccess", () => {
  it("platform admin reaches any department", () => {
    expect(decideDepartmentAccess(scope({ isPlatformAdmin: true }), "d1", "tA", [])).toBe(true);
  });

  it("direct department membership grants access", () => {
    expect(decideDepartmentAccess(scope({ departmentIds: ["d1"] }), "d1", "tA", [])).toBe(true);
  });

  it("tenant admin reaches any department in that tenant", () => {
    expect(decideDepartmentAccess(scope({ tenantAdminIds: ["tA"] }), "d1", "tA", [])).toBe(true);
  });

  it("tenant admin does not reach a department in another tenant", () => {
    expect(decideDepartmentAccess(scope({ tenantAdminIds: ["tA"] }), "d1", "tB", [])).toBe(false);
  });

  it("sub-department membership grants access to its owning department", () => {
    expect(
      decideDepartmentAccess(scope({ subDepartmentIds: ["team-1"] }), "d1", "tA", ["d1"]),
    ).toBe(true);
  });

  it("denies a user with no relevant scope", () => {
    expect(decideDepartmentAccess(scope({ departmentIds: ["d2"] }), "d1", "tA", [])).toBe(false);
  });
});

describe("subDepartmentScopeForDepartment — SD-06", () => {
  const deptSubDepartments = ["subDepartmentA", "subDepartmentB", "subDepartmentC"];

  it("returns null (all subDepartments) for a platform admin", () => {
    expect(subDepartmentScopeForDepartment(scope({ isPlatformAdmin: true }), "d1", deptSubDepartments, "tA")).toBeNull();
  });

  it("returns null for a tenant admin of the department's tenant", () => {
    expect(
      subDepartmentScopeForDepartment(scope({ tenantAdminIds: ["tA"] }), "d1", deptSubDepartments, "tA"),
    ).toBeNull();
  });

  it("returns null for a whole-department (DEPARTMENT-scoped) caller", () => {
    expect(
      subDepartmentScopeForDepartment(scope({ departmentIds: ["d1"] }), "d1", deptSubDepartments, "tA"),
    ).toBeNull();
  });

  it("restricts a sub-department-only caller to their granted subDepartments in this dept", () => {
    const s = scope({ subDepartmentIds: ["subDepartmentA", "subDepartmentZ"] });
    const allowed = subDepartmentScopeForDepartment(s, "d1", deptSubDepartments, "tA");
    expect(allowed).not.toBeNull();
    expect([...allowed!]).toEqual(["subDepartmentA"]); // subDepartmentZ is not in this department
  });

  it("a caller granted only sub-department A does not get B or C (negative)", () => {
    const allowed = subDepartmentScopeForDepartment(
      scope({ subDepartmentIds: ["subDepartmentA"] }), "d1", deptSubDepartments, "tA",
    );
    expect(allowed!.has("subDepartmentA")).toBe(true);
    expect(allowed!.has("subDepartmentB")).toBe(false);
    expect(allowed!.has("subDepartmentC")).toBe(false);
  });

  it("returns an empty set (sees nothing) for a caller with no grant in this dept", () => {
    const allowed = subDepartmentScopeForDepartment(
      scope({ subDepartmentIds: ["subDepartmentZ"] }), "d1", deptSubDepartments, "tA",
    );
    expect(allowed!.size).toBe(0);
  });

  it("does not treat a tenant admin of a DIFFERENT tenant as whole-department", () => {
    const allowed = subDepartmentScopeForDepartment(
      scope({ tenantAdminIds: ["tOther"], subDepartmentIds: ["subDepartmentB"] }), "d1", deptSubDepartments, "tA",
    );
    expect([...allowed!]).toEqual(["subDepartmentB"]);
  });
});

describe("computeSubDepartmentTeamIds — global SD-06 allowlist for the Prisma scope extension", () => {
  it("is unrestricted (null) for a platform admin", () => {
    expect(computeSubDepartmentTeamIds(scope({ isPlatformAdmin: true }), {}, {})).toBeNull();
  });

  it("is unrestricted (null) when the caller admins every tenant they belong to", () => {
    const s = scope({ tenantIds: ["t1", "t2"], tenantAdminIds: ["t1", "t2"] });
    expect(computeSubDepartmentTeamIds(s, {}, {})).toBeNull();
  });

  it("is restricted when the caller admins only some of their tenants", () => {
    const s = scope({ tenantIds: ["t1", "t2"], tenantAdminIds: ["t1"], subDepartmentIds: ["subDepartmentA"] });
    // Not null — t2 access must still be bounded, even though t1 is fully open
    // (t1's subDepartments are included via the tenantAdminIds expansion below).
    expect(computeSubDepartmentTeamIds(s, {}, { t1: ["team-t1-a", "team-t1-b"] })).toEqual(
      expect.arrayContaining(["subDepartmentA", "team-t1-a", "team-t1-b"]),
    );
  });

  it("is restricted to exactly the caller's direct subDepartment memberships when they hold no department/tenant-admin grants", () => {
    const s = scope({ tenantIds: ["t1"], subDepartmentIds: ["subDepartmentA", "subDepartmentB"] });
    expect(computeSubDepartmentTeamIds(s, {}, {})).toEqual(["subDepartmentA", "subDepartmentB"]);
  });

  it("returns an empty (non-null) array for a caller with no grants at all — sees nothing, not everything", () => {
    const s = scope({ tenantIds: ["t1"] });
    expect(computeSubDepartmentTeamIds(s, {}, {})).toEqual([]);
  });

  it("expands a DEPARTMENT-scoped grant into that department's full subDepartment list", () => {
    const s = scope({ tenantIds: ["t1"], departmentIds: ["d1"], subDepartmentIds: ["subDepartmentC"] });
    const result = computeSubDepartmentTeamIds(s, { d1: ["subDepartmentA", "subDepartmentB"] }, {});
    expect(result?.sort()).toEqual(["subDepartmentA", "subDepartmentB", "subDepartmentC"]);
  });

  it("expands a tenant-admin grant into that tenant's full subDepartment list", () => {
    const s = scope({ tenantIds: ["t1", "t2"], tenantAdminIds: ["t1"], subDepartmentIds: ["subDepartmentX"] });
    const result = computeSubDepartmentTeamIds(s, {}, { t1: ["subDepartmentA", "subDepartmentB"] });
    expect(result?.sort()).toEqual(["subDepartmentA", "subDepartmentB", "subDepartmentX"]);
  });

  it("de-duplicates overlapping subDepartment ids across the sources", () => {
    const s = scope({ tenantIds: ["t1"], departmentIds: ["d1"], subDepartmentIds: ["subDepartmentA"] });
    const result = computeSubDepartmentTeamIds(s, { d1: ["subDepartmentA", "subDepartmentB"] }, {});
    expect(result?.sort()).toEqual(["subDepartmentA", "subDepartmentB"]);
  });
});

describe("resolveEffectiveSubDepartmentManager — unassigned → parent dept admin", () => {
  it("uses the sub-department's own managers when assigned", () => {
    expect(
      resolveEffectiveSubDepartmentManager({
        subDepartmentManagerUserIds: ["u1", "u2"],
        departmentAdminUserIds: ["admin1"],
      }),
    ).toEqual(["u1", "u2"]);
  });

  it("defaults to the parent department admins when the sub-department has none", () => {
    expect(
      resolveEffectiveSubDepartmentManager({
        subDepartmentManagerUserIds: [],
        departmentAdminUserIds: ["admin1", "admin2"],
      }),
    ).toEqual(["admin1", "admin2"]);
  });

  it("de-duplicates while preserving order", () => {
    expect(
      resolveEffectiveSubDepartmentManager({
        subDepartmentManagerUserIds: ["u1", "u1", "u2"],
        departmentAdminUserIds: [],
      }),
    ).toEqual(["u1", "u2"]);
  });

  it("returns empty when neither the sub-department nor the department has managers", () => {
    expect(
      resolveEffectiveSubDepartmentManager({ subDepartmentManagerUserIds: [], departmentAdminUserIds: [] }),
    ).toEqual([]);
  });
});
