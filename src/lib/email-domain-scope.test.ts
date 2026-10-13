import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {
  emailDomainRequest: { findMany: vi.fn() }, emailDomain: { findMany: vi.fn() },
} }));
vi.mock("@/lib/request-scope", () => ({ runAsSystem: (fn: () => unknown) => fn() }));
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/email-domains", () => ({ addTenantDomain: vi.fn() }));
vi.mock("@/lib/resend-domains", () => ({ listManagedDomains: vi.fn() }));
import { prisma } from "@/lib/db";
import { listManagedDomains } from "@/lib/resend-domains";
import { listScopeDomainRequests } from "./email-domain-requests";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.emailDomainRequest.findMany).mockResolvedValue([]);
  vi.mocked(prisma.emailDomain.findMany).mockResolvedValue([{
    id: "shared", name: "mail.example.com", subDepartmentId: null, createdAt: new Date("2026-10-13"),
  }] as never);
  vi.mocked(listManagedDomains).mockResolvedValue([{ name: "mail.example.com", status: "verified" }] as never);
});

describe("shared workspace domains", () => {
  it.each([
    { departmentId: "dept" },
    { departmentId: "dept", subDepartmentId: "sub" },
  ])("includes workspace domains in team scope %j while enforcing tenant isolation", async (scope) => {
    expect(await listScopeDomainRequests("tenant", scope)).toEqual([
      expect.objectContaining({ domain: "mail.example.com", status: "approved", verified: true }),
    ]);
    expect(prisma.emailDomain.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: "tenant",
        OR: expect.arrayContaining([{ departmentId: null, subDepartmentId: null }]),
      }),
    }));
  });
});
