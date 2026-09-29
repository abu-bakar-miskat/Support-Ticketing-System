import { describe, expect, it } from "vitest";
import { parseTenantPathContext } from "./tenant-path";

describe("parseTenantPathContext", () => {
  it("keeps tenant-level URLs independent from the active cookie", () => {
    expect(parseTenantPathContext("/tenant-x")).toEqual({
      tenantSlug: "tenant-x",
      departmentSlug: null,
      subDepartmentSlug: null,
      internalPath: "/",
    });
    expect(parseTenantPathContext("/tenant-x/departments")).toEqual({
      tenantSlug: "tenant-x",
      departmentSlug: null,
      subDepartmentSlug: null,
      internalPath: "/departments",
    });
    expect(parseTenantPathContext("/tenant-y/departments")).toEqual({
      tenantSlug: "tenant-y",
      departmentSlug: null,
      subDepartmentSlug: null,
      internalPath: "/departments",
    });
  });

  it("extracts department and sub-department context from workspace URLs", () => {
    expect(parseTenantPathContext("/acme/support")).toEqual({
      tenantSlug: "acme",
      departmentSlug: "support",
      subDepartmentSlug: null,
      internalPath: "/",
    });
    expect(parseTenantPathContext("/acme/support/board")).toEqual({
      tenantSlug: "acme",
      departmentSlug: "support",
      subDepartmentSlug: null,
      internalPath: "/board",
    });
    expect(parseTenantPathContext("/acme/support/triage/board")).toEqual({
      tenantSlug: "acme",
      departmentSlug: "support",
      subDepartmentSlug: "triage",
      internalPath: "/board",
    });
  });

  it("leaves bare internal and non-tenant routes to their normal routing", () => {
    expect(parseTenantPathContext("/departments")).toBeNull();
    expect(parseTenantPathContext("/platform/settings")).toBeNull();
    expect(parseTenantPathContext("/api/tickets")).toBeNull();
  });
});
