import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  prisma: {
    tenantMembership: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import {
  findOtherTenantAdminConflict,
  isTenantAdminAnywhere,
  TENANT_ADMIN_EXCLUSIVE_ERROR,
  TenantAdminExclusiveError,
} from "@/lib/tenant-membership";

const mockFindFirst = vi.mocked(prisma.tenantMembership.findFirst);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tenant admin exclusivity", () => {
  it("findOtherTenantAdminConflict returns the other tenant when user is admin elsewhere", async () => {
    mockFindFirst.mockResolvedValue({
      tenantId: "t-other",
      tenant: { name: "Other Org" },
    } as never);

    const conflict = await findOtherTenantAdminConflict(prisma, "user-1", "t-new");
    expect(conflict).toEqual({ tenantId: "t-other", tenantName: "Other Org" });
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          role: "admin",
          isActive: true,
          tenantId: { not: "t-new" },
        }),
      }),
    );
  });

  it("findOtherTenantAdminConflict returns null when the user is free", async () => {
    mockFindFirst.mockResolvedValue(null as never);
    expect(await findOtherTenantAdminConflict(prisma, "user-1", "t-new")).toBeNull();
  });

  it("isTenantAdminAnywhere is true when any admin membership exists", async () => {
    mockFindFirst.mockResolvedValue({ userId: "user-1" } as never);
    expect(await isTenantAdminAnywhere(prisma, "user-1")).toBe(true);
  });

  it("TenantAdminExclusiveError carries the shared message", () => {
    const err = new TenantAdminExclusiveError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(TENANT_ADMIN_EXCLUSIVE_ERROR);
  });
});
