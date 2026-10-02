import { describe, expect, it } from "vitest";
import {
  parseTenantPathContext,
  TENANT_LEVEL_ROOTS,
  TENANT_SCOPED_ROOTS,
  tenantWithMissingDepartment,
  toInternalAppPath,
} from "./tenant-path";

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

  it("rejects tenant URLs that omit the required department", () => {
    const departmentRoots = [...TENANT_SCOPED_ROOTS].filter(
      (root) => !TENANT_LEVEL_ROOTS.has(root),
    );
    for (const root of departmentRoots) {
      expect(parseTenantPathContext(`/nova-pathways/${root}`)).toBeNull();
      expect(tenantWithMissingDepartment(`/nova-pathways/${root}`)).toBe(
        "nova-pathways",
      );
    }

    expect(parseTenantPathContext("/nova-pathways/tasks/task-1")).toBeNull();
    expect(tenantWithMissingDepartment("/nova-pathways/tasks/task-1")).toBe(
      "nova-pathways",
    );
  });

  it("strips tenant and department prefixes down to the app route", () => {
    expect(toInternalAppPath("/acme/support/board")).toBe("/board");
    expect(toInternalAppPath("/acme/support/triage/timeline")).toBe("/timeline");
    expect(toInternalAppPath("/acme/support/settings/api-keys")).toBe("/settings/api-keys");
    expect(toInternalAppPath("/settings/api-keys")).toBe("/settings/api-keys");
    expect(toInternalAppPath("/")).toBe("/");
  });

  it("does not flag complete department or tenant-level URLs", () => {
    expect(tenantWithMissingDepartment("/nova-pathways/support/tasks")).toBeNull();
    expect(tenantWithMissingDepartment("/nova-pathways/departments")).toBeNull();
  });
});
