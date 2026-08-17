import { describe, it, expect } from "vitest";
import {
  shapeScope,
  decideDepartmentAccess,
  deriveEffectiveRole,
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
      { role: "staff", scopeType: "TENANT", scopeId: "t2" },
    ];
    const s = shapeScope(rows);
    expect(s.tenantIds.sort()).toEqual(["t1", "t2"]);
    expect(s.tenantAdminIds).toEqual(["t1"]);
  });

  it("flags department admins for admin and manager roles only", () => {
    const rows: ScopeRow[] = [
      { role: "manager", scopeType: "DEPARTMENT", scopeId: "d1" },
      { role: "staff", scopeType: "DEPARTMENT", scopeId: "d2" },
      { role: "admin", scopeType: "DEPARTMENT", scopeId: "d3" },
    ];
    const s = shapeScope(rows);
    expect(s.departmentIds.sort()).toEqual(["d1", "d2", "d3"]);
    expect(s.departmentAdminIds.sort()).toEqual(["d1", "d3"]);
  });

  it("collects sub-department ids", () => {
    const rows: ScopeRow[] = [{ role: "staff", scopeType: "SUB_DEPARTMENT", scopeId: "team-9" }];
    expect(shapeScope(rows).subDepartmentIds).toEqual(["team-9"]);
  });

  it("dedupes repeated scope ids", () => {
    const rows: ScopeRow[] = [
      { role: "staff", scopeType: "DEPARTMENT", scopeId: "d1" },
      { role: "manager", scopeType: "DEPARTMENT", scopeId: "d1" },
    ];
    expect(shapeScope(rows).departmentIds).toEqual(["d1"]);
  });

  it("ignores scoped rows with a null scopeId", () => {
    const rows: ScopeRow[] = [{ role: "staff", scopeType: "DEPARTMENT", scopeId: null }];
    expect(shapeScope(rows).departmentIds).toEqual([]);
  });
});

describe("deriveEffectiveRole", () => {
  it("platform assignment → admin", () => {
    expect(deriveEffectiveRole([{ role: "admin", scopeType: "PLATFORM", scopeId: null }])).toBe(
      "admin",
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

  it("tenant manager → manager", () => {
    expect(deriveEffectiveRole([{ role: "manager", scopeType: "TENANT", scopeId: "t1" }])).toBe(
      "manager",
    );
  });

  it("sub-department lead → lead", () => {
    expect(deriveEffectiveRole([{ role: "lead", scopeType: "SUB_DEPARTMENT", scopeId: "team-1" }])).toBe(
      "lead",
    );
  });

  it("plain department/tenant membership → staff", () => {
    expect(
      deriveEffectiveRole([
        { role: "staff", scopeType: "TENANT", scopeId: "t1" },
        { role: "staff", scopeType: "DEPARTMENT", scopeId: "d1" },
      ]),
    ).toBe("staff");
  });

  it("no assignments → staff", () => {
    expect(deriveEffectiveRole([])).toBe("staff");
  });

  it("admin outranks a concurrent lead/manager assignment", () => {
    expect(
      deriveEffectiveRole([
        { role: "lead", scopeType: "SUB_DEPARTMENT", scopeId: "team-1" },
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
