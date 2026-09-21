import { describe, expect, it } from "vitest";
import { dashboardHomeRedirect } from "./dashboard-home-routing";

describe("dashboardHomeRedirect", () => {
  it("keeps a tenant admin on Home after they enter a department", () => {
    expect(
      dashboardHomeRedirect(
        { role: "admin", isSuperAdmin: false },
        "software-department-id",
      ),
    ).toBeNull();
  });

  it("sends a tenant admin without an active department to the department picker", () => {
    expect(
      dashboardHomeRedirect({ role: "admin", isSuperAdmin: false }, null),
    ).toBe("/departments");
  });

  it("keeps a super admin in a selected department workspace", () => {
    expect(
      dashboardHomeRedirect(
        { role: "admin", isSuperAdmin: true },
        "software-department-id",
      ),
    ).toBeNull();
  });

  it("sends a super admin without a selected department to the platform console", () => {
    expect(
      dashboardHomeRedirect({ role: "admin", isSuperAdmin: true }, null),
    ).toBe("/platform");
  });

  it("preserves the manager home redirect", () => {
    expect(
      dashboardHomeRedirect({ role: "manager", isSuperAdmin: false }, "dept-id"),
    ).toBe("/manager");
  });
});
