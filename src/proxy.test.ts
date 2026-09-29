import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getClaims: vi.fn(async () => ({
        data: { claims: { sub: "user-1", email: "admin@example.com" } },
      })),
      getUser: vi.fn(async () => ({ data: { user: null } })),
    },
  })),
}));

import { proxy } from "./proxy";

describe("tenant request context in proxy", () => {
  beforeEach(() => {
    delete process.env.DEV_AUTH_BYPASS;
  });

  it("rewrites the URL tenant even when another tab changed the shared cookie", async () => {
    const request = new NextRequest("http://localhost/tenant-x/departments", {
      headers: {
        cookie: "pen_active_tenant_slug=tenant-z; pen_active_tenant=tenant-z-id",
      },
    });

    const response = await proxy(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/departments",
    );
    expect(response.headers.get("x-middleware-request-x-tenant-slug")).toBe(
      "tenant-x",
    );
  });

  it("uses the same-origin page URL as tenant context for API requests", async () => {
    const request = new NextRequest("http://localhost/api/dashboard/layout", {
      headers: {
        cookie: "pen_active_tenant_slug=tenant-z; pen_active_tenant=tenant-z-id",
        referer: "http://localhost/tenant-x/support",
      },
    });

    const response = await proxy(request);

    expect(response.headers.get("x-middleware-request-x-tenant-slug")).toBe(
      "tenant-x",
    );
    expect(response.headers.get("x-middleware-request-x-department-slug")).toBe(
      "support",
    );
  });

  it("rewrites a department workspace home without consulting shared cookies", async () => {
    const request = new NextRequest("http://localhost/tenant-x/support", {
      headers: {
        cookie: "pen_active_tenant_slug=tenant-z; pen_active_dept_slug=finance",
      },
    });

    const response = await proxy(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost/");
    expect(response.headers.get("x-middleware-request-x-tenant-slug")).toBe("tenant-x");
    expect(response.headers.get("x-middleware-request-x-department-slug")).toBe("support");
  });

  it("redirects a tenant root to its department overview", async () => {
    const response = await proxy(new NextRequest("http://localhost/tenant-x"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/tenant-x/departments");
  });

  it("does not treat platform routes as tenant-prefixed URLs", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/platform/settings"),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-tenant-slug")).toBeNull();
  });
});
