import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {
  department: { findFirst: vi.fn() },
  emailDomain: { findUnique: vi.fn(), create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
} }));
vi.mock("@/lib/request-scope", () => ({ runAsSystem: (fn: () => unknown) => fn() }));
vi.mock("@/lib/resend-domains", () => ({ findVerifiedManagedDomain: vi.fn() }));

import { prisma } from "@/lib/db";
import { findVerifiedManagedDomain } from "@/lib/resend-domains";
import { addTenantDomain, removeTenantDomain } from "./email-domains";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.department.findFirst).mockResolvedValue({ id: "dept", name: "Support" } as never);
});

describe("workspace domain assignments", () => {
  it("does not save unverified domains or failed Resend lookups", async () => {
    vi.mocked(findVerifiedManagedDomain).mockResolvedValue({ error: "Not verified in Resend" });
    expect(await addTenantDomain("tenant", "mail.example.com", { departmentId: "dept" }))
      .toEqual({ error: "Not verified in Resend" });
    expect(prisma.emailDomain.create).not.toHaveBeenCalled();
  });

  it("assigns the existing verified Resend id and normalizes the name", async () => {
    const domain = { id: "resend-existing", name: "mail.example.com", status: "verified" as const,
      region: null, capabilities: { sending: "enabled", receiving: "disabled" }, createdAt: null, records: [] };
    vi.mocked(findVerifiedManagedDomain).mockResolvedValue(domain);
    expect(await addTenantDomain("tenant", " MAIL.EXAMPLE.COM ", { departmentId: "dept" }))
      .toEqual({ ...domain, scopeLabel: "Support" });
    expect(prisma.emailDomain.create).toHaveBeenCalledWith({ data: {
      tenantId: "tenant", name: "mail.example.com", resendId: "resend-existing",
      departmentId: "dept", subDepartmentId: null,
    } });
  });

  it("assigns a verified domain to all departments without a schema change", async () => {
    vi.mocked(findVerifiedManagedDomain).mockResolvedValue({ id: "resend-existing", name: "mail.example.com", status: "verified" } as never);
    expect(await addTenantDomain("tenant", "mail.example.com", { allDepartments: true }))
      .toMatchObject({ scopeLabel: "All departments and sub-departments" });
    expect(prisma.emailDomain.create).toHaveBeenCalledWith({ data: {
      tenantId: "tenant", name: "mail.example.com", resendId: "resend-existing",
      departmentId: null, subDepartmentId: null,
    } });
    expect(prisma.department.findFirst).not.toHaveBeenCalled();
  });

  it("rejects conflicting all-department and individual team scopes", async () => {
    expect(await addTenantDomain("tenant", "mail.example.com", { allDepartments: true, departmentId: "dept" }))
      .toHaveProperty("error");
    expect(prisma.emailDomain.create).not.toHaveBeenCalled();
    expect(findVerifiedManagedDomain).not.toHaveBeenCalled();
  });

  it("still blocks unverified domains assigned to all departments", async () => {
    vi.mocked(findVerifiedManagedDomain).mockResolvedValue({ error: "Not verified" });
    expect(await addTenantDomain("tenant", "mail.example.com", { allDepartments: true })).toHaveProperty("error");
    expect(prisma.emailDomain.create).not.toHaveBeenCalled();
  });

  it("rejects domains owned by another workspace", async () => {
    vi.mocked(prisma.emailDomain.findUnique).mockResolvedValue({ tenantId: "other" } as never);
    expect(await addTenantDomain("tenant", "mail.example.com", { departmentId: "dept" }))
      .toEqual({ error: "This domain is already registered by another workspace." });
    expect(findVerifiedManagedDomain).not.toHaveBeenCalled();
    expect(prisma.emailDomain.create).not.toHaveBeenCalled();
  });

  it("removes only the owned local assignment", async () => {
    vi.mocked(prisma.emailDomain.findFirst).mockResolvedValue({ id: "local" } as never);
    expect(await removeTenantDomain("tenant", "resend-existing")).toEqual({ ok: true });
    expect(prisma.emailDomain.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant", resendId: "resend-existing" },
    }));
    expect(prisma.emailDomain.delete).toHaveBeenCalledWith({ where: { id: "local" } });
  });
});
