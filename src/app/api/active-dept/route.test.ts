import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(async () => ({
    profile: {
      id: "admin-1",
      role: "admin",
      activeTenantId: "tenant-1",
      managedDepartmentIds: [],
      isSuperAdmin: false,
    },
    error: null,
  })),
}));
vi.mock("@/lib/role-assignment", () => ({
  canAccessDepartment: vi.fn(async () => false),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    department: {
      findUnique: vi.fn(async () => ({
        id: "dept-1",
        slug: "support",
        tenantId: "tenant-1",
        tenant: { slug: "tenant-x" },
      })),
    },
  },
}));

import { POST } from "./route";

describe("POST /api/active-dept", () => {
  it("returns the complete canonical workspace path context", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/active-dept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deptId: "dept-1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      slug: "support",
      tenantSlug: "tenant-x",
    });
  });

});
